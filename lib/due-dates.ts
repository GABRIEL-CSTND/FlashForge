// Due-date helpers shared by server and client code (#56). Due dates are
// stored as timestamps (UTC) and always shown in the viewer's own local time.

const GRACE_MS = 5 * 60_000;
const MAX_AHEAD_MS = 2 * 366 * 24 * 60 * 60_000;

export type DueAtResult = { ok: true; dueAt: string | null } | { ok: false; error: string };

// Validates a due date sent to the server: null/undefined/'' means "no due
// date"; otherwise an ISO timestamp that isn't already past (5-minute grace)
// and is within 2 years.
export function parseDueAt(value: unknown, now: Date = new Date()): DueAtResult {
  if (value === null || value === undefined || value === '') return { ok: true, dueAt: null };
  if (typeof value !== 'string') return { ok: false, error: 'Pick a valid due date.' };
  const time = Date.parse(value);
  if (Number.isNaN(time)) return { ok: false, error: 'Pick a valid due date.' };
  if (time < now.getTime() - GRACE_MS) return { ok: false, error: 'That due date has already passed.' };
  if (time > now.getTime() + MAX_AHEAD_MS) return { ok: false, error: 'Pick a due date within the next 2 years.' };
  return { ok: true, dueAt: new Date(time).toISOString() };
}

export function isOverdue(dueAt: string | null, now: Date = new Date()): boolean {
  return dueAt !== null && Date.parse(dueAt) < now.getTime();
}

// e.g. "Thu, Oct 30, 11:59 PM", in the viewer's locale and time zone.
export function formatDueDate(dueAt: string): string {
  return new Date(dueAt).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// <input type="datetime-local"> works in local time without a zone:
// "2026-10-30T23:59". These convert to and from stored ISO timestamps.
export function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInputValue(value: string): string | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

// Soonest due first, then sets without a due date (newest assignment first).
export function sortByDue<T extends { dueAt: string | null; createdAt: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.dueAt && b.dueAt) return Date.parse(a.dueAt) - Date.parse(b.dueAt);
    if (a.dueAt) return -1;
    if (b.dueAt) return 1;
    return Date.parse(b.createdAt) - Date.parse(a.createdAt);
  });
}
