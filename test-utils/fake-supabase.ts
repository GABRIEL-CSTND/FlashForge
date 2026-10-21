// In-memory stand-in for the service-role Supabase client, for route tests.
// Supports the subset of the query builder the app uses: select (with
// `{ count: 'exact', head: true }`), insert, update, delete, eq/neq/in/is,
// gt/gte/lt/lte filters, order, limit, single/maybeSingle, rpc, and auth.getUser. Unique
// keys return Postgres error 23505 and deletes can cascade, like the real
// schema. Behaviour that matters was also checked against the live database.

type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;
type Result = { data: unknown; error: { code: string; message: string } | null; count?: number | null };

export interface FakeTableConfig {
  // Each entry is a set of columns that must be unique together.
  unique?: string[][];
  // Column defaults applied on insert, e.g. generated ids and timestamps.
  defaults?: Record<string, () => unknown>;
  // On delete, also delete rows in other tables that point at this one.
  cascade?: { table: string; column: string; references?: string }[];
}

export interface FakeSupabaseOptions {
  tables?: Record<string, FakeTableConfig>;
  // token -> { id, email }
  users?: Record<string, { id: string; email: string }>;
  rpc?: Record<string, (args: Record<string, unknown>, db: FakeDb) => unknown[]>;
}

export interface FakeDb {
  rows: Record<string, Row[]>;
  // Make the next query on `table` (optionally only for `op`) fail.
  failNext: (table: string, op?: 'select' | 'insert' | 'update' | 'delete') => void;
}

let idCounter = 0;
export function fakeUuid(): string {
  idCounter += 1;
  return `00000000-0000-4000-8000-${String(idCounter).padStart(12, '0')}`;
}

function pick(row: Row, columns: string): Row {
  if (columns.trim() === '*') return { ...row };
  const out: Row = {};
  for (const col of columns.split(',').map((c) => c.trim()).filter(Boolean)) out[col] = row[col];
  return out;
}

export function createFakeSupabase(options: FakeSupabaseOptions = {}) {
  const configs = options.tables ?? {};
  const rows: Record<string, Row[]> = Object.fromEntries(Object.keys(configs).map((t) => [t, []]));
  const failures: { table: string; op?: string }[] = [];

  const table = (name: string) => (rows[name] ??= []);

  const db: FakeDb = {
    rows,
    failNext: (t, op) => failures.push({ table: t, op }),
  };

  function takeFailure(t: string, op: string) {
    const i = failures.findIndex((f) => f.table === t && (!f.op || f.op === op));
    if (i === -1) return null;
    failures.splice(i, 1);
    return { code: 'XX000', message: `simulated ${op} failure on ${t}` };
  }

  function violatesUnique(t: string, candidate: Row, ignore?: Row) {
    for (const cols of configs[t]?.unique ?? []) {
      if (table(t).some((r) => r !== ignore && cols.every((c) => r[c] === candidate[c]))) return true;
    }
    return false;
  }

  function cascadeDelete(t: string, deleted: Row[]) {
    for (const rule of configs[t]?.cascade ?? []) {
      const key = rule.references ?? 'id';
      const doomed = new Set(deleted.map((r) => r[key]));
      const child = table(rule.table);
      const gone = child.filter((r) => doomed.has(r[rule.column]));
      rows[rule.table] = child.filter((r) => !doomed.has(r[rule.column]));
      cascadeDelete(rule.table, gone);
    }
  }

  function from(t: string) {
    const filters: Filter[] = [];
    let op: 'select' | 'insert' | 'update' | 'delete' = 'select';
    let payload: Row | Row[] | null = null;
    let returning: string | null = null;
    let countMode = false;
    let headOnly = false;
    let order: { column: string; ascending: boolean } | null = null;
    let limitTo: number | null = null;

    const run = (): Result => {
      const failure = takeFailure(t, op);
      if (failure) return { data: null, error: failure };

      if (op === 'insert') {
        const inserted: Row[] = [];
        for (const raw of Array.isArray(payload) ? payload : [payload ?? {}]) {
          const row: Row = { ...raw };
          for (const [col, make] of Object.entries(configs[t]?.defaults ?? {})) row[col] ??= make();
          if (violatesUnique(t, row)) {
            return { data: null, error: { code: '23505', message: `duplicate key value in ${t}` } };
          }
          inserted.push(row);
        }
        table(t).push(...inserted);
        return { data: returning ? inserted.map((r) => pick(r, returning!)) : null, error: null };
      }

      let matched = table(t).filter((r) => filters.every((f) => f(r)));

      if (op === 'update') {
        for (const r of matched) {
          if (violatesUnique(t, { ...r, ...(payload as Row) }, r)) {
            return { data: null, error: { code: '23505', message: `duplicate key value in ${t}` } };
          }
        }
        for (const r of matched) Object.assign(r, payload);
        return { data: returning ? matched.map((r) => pick(r, returning!)) : null, error: null };
      }

      if (op === 'delete') {
        rows[t] = table(t).filter((r) => !matched.includes(r));
        cascadeDelete(t, matched);
        return { data: returning ? matched.map((r) => pick(r, returning!)) : null, error: null };
      }

      if (order) {
        const { column, ascending } = order;
        matched = [...matched].sort((a, b) =>
          String(a[column]).localeCompare(String(b[column])) * (ascending ? 1 : -1)
        );
      }
      if (limitTo !== null) matched = matched.slice(0, limitTo);
      const count = countMode ? matched.length : null;
      return { data: headOnly ? null : matched.map((r) => pick(r, returning ?? '*')), error: null, count };
    };

    const builder = {
      select(columns = '*', opts?: { count?: 'exact'; head?: boolean }) {
        returning = columns;
        countMode = opts?.count === 'exact';
        headOnly = opts?.head === true;
        return builder;
      },
      insert(values: Row | Row[]) {
        op = 'insert';
        payload = values;
        return builder;
      },
      update(values: Row) {
        op = 'update';
        payload = values;
        return builder;
      },
      delete() {
        op = 'delete';
        return builder;
      },
      eq(column: string, value: unknown) {
        filters.push((r) => r[column] === value);
        return builder;
      },
      neq(column: string, value: unknown) {
        filters.push((r) => r[column] !== value);
        return builder;
      },
      in(column: string, values: unknown[]) {
        filters.push((r) => values.includes(r[column]));
        return builder;
      },
      is(column: string, value: null) {
        filters.push((r) => (r[column] ?? null) === value);
        return builder;
      },
      // Comparisons work for numbers and for ISO timestamps (which sort as strings).
      gt(column: string, value: string | number) {
        filters.push((r) => (r[column] as string | number) > value);
        return builder;
      },
      gte(column: string, value: string | number) {
        filters.push((r) => (r[column] as string | number) >= value);
        return builder;
      },
      lt(column: string, value: string | number) {
        filters.push((r) => (r[column] as string | number) < value);
        return builder;
      },
      lte(column: string, value: string | number) {
        filters.push((r) => (r[column] as string | number) <= value);
        return builder;
      },
      order(column: string, opts?: { ascending?: boolean }) {
        order = { column, ascending: opts?.ascending ?? true };
        return builder;
      },
      limit(n: number) {
        limitTo = n;
        return builder;
      },
      async single() {
        const result = run();
        const list = (result.data as Row[] | null) ?? [];
        if (result.error) return { data: null, error: result.error };
        if (list.length !== 1) return { data: null, error: { code: 'PGRST116', message: `expected 1 row, got ${list.length}` } };
        return { data: list[0], error: null };
      },
      async maybeSingle() {
        const result = run();
        const list = (result.data as Row[] | null) ?? [];
        if (result.error) return { data: null, error: result.error };
        if (list.length > 1) return { data: null, error: { code: 'PGRST116', message: `expected 0 or 1 rows, got ${list.length}` } };
        return { data: list[0] ?? null, error: null };
      },
      then<T>(resolve: (value: Result) => T, reject?: (reason: unknown) => T) {
        return Promise.resolve(run()).then(resolve, reject);
      },
    };
    return builder;
  }

  const client = {
    from,
    auth: {
      async getUser(token: string) {
        const user = options.users?.[token];
        return user
          ? { data: { user: { id: user.id, email: user.email } }, error: null }
          : { data: { user: null }, error: { message: 'invalid JWT' } };
      },
    },
    async rpc(name: string, args: Record<string, unknown>) {
      const handler = options.rpc?.[name];
      if (!handler) return { data: null, error: { code: '42883', message: `function ${name} does not exist` } };
      // A handler throws { code, message } to act like a function that raises.
      try {
        return { data: handler(args, db), error: null };
      } catch (err) {
        return { data: null, error: err as { code: string; message: string } };
      }
    },
  };

  return { client, db };
}
