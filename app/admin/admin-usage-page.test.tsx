// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';

const state = vi.hoisted(() => ({ role: 'admin', reply: null as null | { ok: boolean; status: number; data: Record<string, unknown> } }));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/components/ProfileProvider', () => ({
  useProfile: () => ({ user: { id: 'u-admin' }, profile: { role: state.role, roleChosenAt: null, displayName: null }, loading: false, refreshProfile: vi.fn() }),
}));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-client')>();
  return {
    ...actual,
    apiFetch: vi.fn(async (path: string) => {
      if (path !== '/api/admin/usage') throw new Error(`unexpected ${path}`);
      return state.reply!;
    }),
  };
});

import AdminUsagePage from '@/app/admin/usage/page';

const MODELS = ['gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemma-4-26b-a4b-it'];
const usage = (overrides: Record<string, unknown> = {}) => ({
  today: '2026-10-23',
  periodDays: 14,
  models: MODELS,
  mainModelDailyQuota: 20,
  days: [
    { day: '2026-10-23', generations: 12, failures: 1, signedOut: 2, avgMs: 6000, answered: { 'gemini-3.5-flash': 9, 'gemini-3.5-flash-lite': 2 }, requests: { 'gemini-3.5-flash': 15, 'gemini-3.5-flash-lite': 3 } },
    { day: '2026-10-22', generations: 8, failures: 0, signedOut: 0, avgMs: 11000, answered: { 'gemma-4-26b-a4b-it': 8 }, requests: { 'gemma-4-26b-a4b-it': 8 } },
  ],
  topUsers: [{ id: 'u1', email: 'ana@example.com', displayName: 'Ana Reyes', role: 'student', generations: 7, failures: 1 }],
  ...overrides,
});

beforeEach(() => {
  state.role = 'admin';
  state.reply = { ok: true, status: 200, data: usage() };
});
afterEach(cleanup);

describe('admin usage page', () => {
  it("shows today's requests per model against the main model's quota", async () => {
    render(<AdminUsagePage />);
    const models = within(await screen.findByRole('list', { name: 'Requests today by model' })).getAllByRole('listitem');
    expect(models.map((li) => li.textContent)).toEqual([
      'gemini-3.5-flashmain15 of about 20 requests · 9 guides made',
      'gemini-3.5-flash-litebackup3 requests · 2 guides made',
      'gemma-4-26b-a4b-itbackup0 requests · 0 guides made',
    ]);
    expect(screen.getByText('1 generation failed today.')).toBeTruthy();
  });

  it('sums up the period and lists each day with the models that answered', async () => {
    render(<AdminUsagePage />);
    // 20 guides, 1 failed (5%), average wait (12×6s + 8×11s) / 20 = 8s.
    expect(await screen.findByText('20 guides · 5% failed · average wait 8.0s · 2 signed out')).toBeTruthy();
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(rows.map((r) => within(r).getAllByRole('cell').map((c) => c.textContent))).toEqual([
      ['12', '1', '6.0s', 'gemini-3.5-flash: 9, gemini-3.5-flash-lite: 2'],
      ['8', '0', '11.0s', 'gemma-4-26b-a4b-it: 8'],
    ]);
    expect(within(screen.getByRole('list', { name: 'Top users' })).getByRole('listitem').textContent).toBe('Ana Reyesstudent7 guides · 1 failed');
  });

  it('shows zeros today and an empty history before anything is generated', async () => {
    state.reply = { ok: true, status: 200, data: usage({ days: [], topUsers: [] }) };
    render(<AdminUsagePage />);
    expect(await screen.findByText('0 of about 20 requests · 0 guides made')).toBeTruthy();
    expect(screen.getByText('No study guides generated yet.')).toBeTruthy();
    expect(screen.getByText('No signed-in generations in the last 14 days.')).toBeTruthy();
  });

  it('shows errors, and is only for admins', async () => {
    state.reply = { ok: false, status: 500, data: { error: 'Something went wrong. Please try again.' } };
    render(<AdminUsagePage />);
    expect((await screen.findByRole('alert')).textContent).toBe('Something went wrong. Please try again.');
    cleanup();
    state.role = 'teacher';
    render(<AdminUsagePage />);
    expect(await screen.findByText('The admin pages are only for admins.')).toBeTruthy();
  });
});
