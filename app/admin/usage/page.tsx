'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import AdminOnly from '@/components/AdminOnly';
import { apiFetch, errorMessage } from '@/lib/api-client';
import { studentLabel } from '@/lib/classes-shared';
import {
  LIMIT_LABELS,
  LIMIT_ROLES,
  MAX_DAILY_LIMIT,
  parseGenerationLimits,
  type GenerationLimits,
  type LimitRole,
} from '@/lib/generation-limits';

interface UsageDay {
  day: string;
  generations: number;
  failures: number;
  signedOut: number;
  avgMs: number;
  answered: Record<string, number>;
  requests: Record<string, number>;
  limited: number;
}

interface TopGenerator {
  id: string;
  email: string | null;
  displayName: string | null;
  role: string;
  generations: number;
  failures: number;
}

interface Usage {
  today: string;
  periodDays: number;
  models: string[];
  mainModelDailyQuota: number;
  limits: GenerationLimits | null;
  days: UsageDay[];
  topUsers: TopGenerator[];
}

type LoadState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; usage: Usage };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
// Quota days are plain dates (YYYY-MM-DD); format them without a time-zone shift.
const formatDay = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

// How many study guides are generated, which models made them, and how close
// the main model is to its free daily quota (#62).
export default function AdminUsagePage() {
  return (
    <AdminOnly>
      <UsageView />
    </AdminOnly>
  );
}

function UsageView() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/admin/usage')
      .then((res) => {
        if (cancelled) return;
        setState(res.ok ? { status: 'ready', usage: res.data as unknown as Usage } : { status: 'error', message: errorMessage(res.data) });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error', message: 'Could not reach the server. Check your connection and try again.' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status !== 'ready') {
    return (
      <main className="min-h-screen w-full p-6 max-w-2xl mx-auto space-y-6">
        <Link href="/admin" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800">
          ← Admin
        </Link>
        {state.status === 'loading' ? (
          <p className="text-sm text-gray-500">Loading usage...</p>
        ) : (
          <p role="alert" className="text-sm text-red-500">
            {state.message}
          </p>
        )}
      </main>
    );
  }

  const { today, periodDays, models, mainModelDailyQuota, limits, days, topUsers } = state.usage;
  const todayRow = days.find((d) => d.day === today);
  const total = days.reduce((sum, d) => sum + d.generations, 0);
  const failed = days.reduce((sum, d) => sum + d.failures, 0);
  const signedOut = days.reduce((sum, d) => sum + d.signedOut, 0);
  const limited = days.reduce((sum, d) => sum + d.limited, 0);
  const averageMs = total > 0 ? days.reduce((sum, d) => sum + d.avgMs * d.generations, 0) / total : 0;

  return (
    // w-full: the body is a flex column (see the class results page).
    <main className="min-h-screen w-full p-6 max-w-2xl mx-auto space-y-6">
      <Link href="/admin" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800">
        ← Admin
      </Link>
      <h1 className="text-xl font-semibold">AI usage</h1>

      <section aria-labelledby="today-heading" className="space-y-3 rounded-xl border p-4">
        <div className="space-y-1">
          <h2 id="today-heading" className="font-medium">
            Today
          </h2>
          <p className="text-xs text-gray-400">
            Days run midnight to midnight Pacific time, when the free Gemini quota resets. Requests include retries
            and backups.
          </p>
        </div>
        <ul aria-label="Requests today by model" className="space-y-3">
          {models.map((model, i) => {
            const requests = todayRow?.requests[model] ?? 0;
            const guides = todayRow?.answered[model] ?? 0;
            const share = Math.min(100, Math.round((requests / mainModelDailyQuota) * 100));
            return (
              <li key={model} className="space-y-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate font-mono text-sm">{model}</span>
                  <span className="shrink-0 text-xs text-gray-400">{i === 0 ? 'main' : 'backup'}</span>
                </div>
                <p className="text-sm text-gray-500">
                  {i === 0 ? `${requests} of about ${mainModelDailyQuota} requests` : plural(requests, 'request')} ·{' '}
                  {plural(guides, 'guide')} made
                </p>
                {i === 0 && (
                  <div className="h-1.5 rounded-full bg-gray-500/15" aria-hidden="true">
                    <div
                      className={`h-1.5 rounded-full ${share >= 100 ? 'bg-red-500' : share >= 75 ? 'bg-amber-500' : 'bg-green-500'}`}
                      style={{ width: `${share}%` }}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {todayRow && todayRow.failures > 0 && (
          <p className="text-sm text-red-500">{plural(todayRow.failures, 'generation')} failed today.</p>
        )}
        {todayRow && todayRow.limited > 0 && (
          <p className="text-sm text-amber-600">{plural(todayRow.limited, 'request')} refused by the daily limits today.</p>
        )}
      </section>

      <LimitsEditor initial={limits} />

      <section aria-labelledby="period-heading" className="space-y-2">
        <h2 id="period-heading" className="font-medium">
          Last {periodDays} days
        </h2>
        {days.length === 0 ? (
          <div className="rounded-lg border p-6 text-center text-sm text-gray-500">No study guides generated yet.</div>
        ) : (
          <>
            <p className="text-sm text-gray-500">
              {plural(total, 'guide')} · {Math.round((failed / total) * 100)}% failed · average wait {seconds(averageMs)} ·{' '}
              {signedOut} signed out
              {limited > 0 && ` · ${limited} refused by limits`}
            </p>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <caption className="sr-only">Study guides generated per day</caption>
                <thead>
                  <tr className="border-b text-left text-xs whitespace-nowrap text-gray-400">
                    <th scope="col" className="px-3 py-2 font-medium">Day</th>
                    <th scope="col" className="px-3 py-2 font-medium">Guides</th>
                    <th scope="col" className="px-3 py-2 font-medium">Failed</th>
                    <th scope="col" className="px-3 py-2 font-medium">Avg wait</th>
                    <th scope="col" className="px-3 py-2 font-medium">Made by</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {days.map((d) => (
                    <tr key={d.day}>
                      <th scope="row" className="whitespace-nowrap px-3 py-2 text-left font-normal">
                        {formatDay(d.day)}
                      </th>
                      <td className="px-3 py-2">{d.generations}</td>
                      <td className={`px-3 py-2 ${d.failures > 0 ? 'text-red-500' : ''}`}>{d.failures}</td>
                      <td className="px-3 py-2">{seconds(d.avgMs)}</td>
                      <td className="px-3 py-2 text-xs text-gray-500">
                        {/* One model per line, never broken mid-name (it scrolls on phones). */}
                        {models.some((m) => d.answered[m])
                          ? models
                              .filter((m) => d.answered[m])
                              .map((m) => (
                                <span key={m} className="block whitespace-nowrap">
                                  {m}: {d.answered[m]}
                                </span>
                              ))
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section aria-labelledby="top-heading" className="space-y-2">
        <h2 id="top-heading" className="font-medium">
          Top users
        </h2>
        {topUsers.length === 0 ? (
          <p className="text-sm text-gray-500">No signed-in generations in the last {periodDays} days.</p>
        ) : (
          <ol aria-label="Top users" className="divide-y rounded-lg border">
            {topUsers.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{studentLabel(u)}</p>
                  <p className="text-xs capitalize text-gray-400">{u.role}</p>
                </div>
                <span className="shrink-0 text-sm text-gray-500">
                  {plural(u.generations, 'guide')}
                  {u.failures > 0 && ` · ${u.failures} failed`}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}

const LIMITS_INVALID = `Each limit must be a whole number from 0 to ${MAX_DAILY_LIMIT}, or empty for no limit.`;

// Daily study guides per person for each role (#63). Saved limits apply from
// the next request; no redeploy needed.
function LimitsEditor({ initial }: { initial: GenerationLimits | null }) {
  const [drafts, setDrafts] = useState<Record<LimitRole, string>>(
    () =>
      Object.fromEntries(LIMIT_ROLES.map((r) => [r, initial?.[r] == null ? '' : String(initial[r])])) as Record<
        LimitRole,
        string
      >
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: 'error' | 'status'; text: string } | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const limits = parseGenerationLimits(
      Object.fromEntries(LIMIT_ROLES.map((r) => [r, drafts[r].trim() === '' ? null : Number(drafts[r])]))
    );
    if (!limits) {
      setMessage({ kind: 'error', text: LIMITS_INVALID });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await apiFetch('/api/admin/limits', { method: 'PUT', body: { limits } });
      setMessage(
        res.ok
          ? { kind: 'status', text: 'Saved. The new limits apply from the next study guide.' }
          : { kind: 'error', text: errorMessage(res.data) }
      );
    } catch {
      setMessage({ kind: 'error', text: 'Could not reach the server. Check your connection and try again.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-labelledby="limits-heading" className="space-y-3 rounded-xl border p-4">
      <div className="space-y-1">
        <h2 id="limits-heading" className="font-medium">
          Daily limits
        </h2>
        <p className="text-xs text-gray-400">
          Study guides each person can make per day (signed-out visitors are counted per IP address). Leave a box empty
          for no limit. Anyone can choose &quot;teacher&quot; at sign-up, so keep that limit modest.
        </p>
      </div>
      {/* noValidate: our own message explains every bad value, the same in all browsers. */}
      <form onSubmit={save} noValidate className="space-y-2">
        {LIMIT_ROLES.map((role) => (
          <div key={role} className="flex items-center justify-between gap-3">
            <label htmlFor={`limit-${role}`} className="text-sm">
              {LIMIT_LABELS[role]}
            </label>
            <input
              id={`limit-${role}`}
              type="number"
              inputMode="numeric"
              min={0}
              max={MAX_DAILY_LIMIT}
              step={1}
              placeholder="No limit"
              value={drafts[role]}
              onChange={(e) => setDrafts((d) => ({ ...d, [role]: e.target.value }))}
              className="w-28 rounded-lg border bg-transparent px-2 py-1 text-right"
            />
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg border px-3 py-1.5 text-sm font-medium hover:border-blue-400 disabled:opacity-40"
          >
            {saving ? 'Saving...' : 'Save limits'}
          </button>
          {message && (
            <p
              role={message.kind === 'error' ? 'alert' : 'status'}
              className={`text-sm ${message.kind === 'error' ? 'text-red-500' : 'text-green-600'}`}
            >
              {message.text}
            </p>
          )}
        </div>
      </form>
    </section>
  );
}
