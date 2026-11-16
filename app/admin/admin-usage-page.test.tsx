// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

type Reply = { ok: boolean; status: number; data: Record<string, unknown> };
const state = vi.hoisted(() => ({
  role: 'admin',
  reply: null as null | Reply,
  putReply: null as null | Reply,
  calls: [] as { method: string; path: string; body?: unknown }[],
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/components/ProfileProvider', () => ({
  useProfile: () => ({ user: { id: 'u-admin' }, profile: { role: state.role, roleChosenAt: null, displayName: null }, loading: false, refreshProfile: vi.fn() }),
}));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-client')>();
  return {
    ...actual,
    apiFetch: vi.fn(async (path: string, init: { method?: string; body?: unknown } = {}) => {
      const method = init.method ?? 'GET';
      state.calls.push({ method, path, body: init.body });
      if (method === 'PUT' && path === '/api/admin/limits') return state.putReply ?? { ok: true, status: 200, data: { limits: (init.body as { limits: unknown }).limits } };
      if (path !== '/api/admin/usage') throw new Error(`unexpected ${method} ${path}`);
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
  limits: { anonymous: 2, student: 5, teacher: 15, admin: null },
  days: [
    { day: '2026-10-23', generations: 12, failures: 1, signedOut: 2, avgMs: 6000, limited: 3, answered: { 'gemini-3.5-flash': 9, 'gemini-3.5-flash-lite': 2 }, requests: { 'gemini-3.5-flash': 15, 'gemini-3.5-flash-lite': 3 } },
    { day: '2026-10-22', generations: 8, failures: 0, signedOut: 0, avgMs: 11000, limited: 0, answered: { 'gemma-4-26b-a4b-it': 8 }, requests: { 'gemma-4-26b-a4b-it': 8 } },
  ],
  topUsers: [{ id: 'u1', email: 'ana@example.com', displayName: 'Ana Reyes', role: 'student', generations: 7, failures: 1 }],
  ...overrides,
});

beforeEach(() => {
  state.role = 'admin';
  state.reply = { ok: true, status: 200, data: usage() };
  state.putReply = null;
  state.calls = [];
});
afterEach(cleanup);

const limitInput = (label: string) => screen.findByLabelText(label) as Promise<HTMLInputElement>;

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
    expect(screen.getByText('3 requests refused by the daily limits today.')).toBeTruthy();
  });

  it('sums up the period and lists each day with the models that answered', async () => {
    render(<AdminUsagePage />);
    // 20 guides, 1 failed (5%), average wait (12×6s + 8×11s) / 20 = 8s.
    expect(await screen.findByText('20 guides · 5% failed · average wait 8.0s · 2 signed out · 3 refused by limits')).toBeTruthy();
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(rows.map((r) => within(r).getAllByRole('cell').map((c) => c.textContent))).toEqual([
      ['12', '1', '6.0s', 'gemini-3.5-flash: 9gemini-3.5-flash-lite: 2'],
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

describe('daily limits editor (#63)', () => {
  it('shows the saved limits, empty meaning no limit', async () => {
    render(<AdminUsagePage />);
    expect((await limitInput('Signed out')).value).toBe('2');
    expect((await limitInput('Students')).value).toBe('5');
    expect((await limitInput('Teachers')).value).toBe('15');
    expect((await limitInput('Admins')).value).toBe('');
    expect((await limitInput('Admins')).placeholder).toBe('No limit');
  });

  it('saves new limits, sending empty boxes as no limit', async () => {
    render(<AdminUsagePage />);
    fireEvent.change(await limitInput('Students'), { target: { value: '3' } });
    fireEvent.change(await limitInput('Teachers'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save limits' }));
    expect((await screen.findByRole('status')).textContent).toBe('Saved. The new limits apply from the next study guide.');
    expect(state.calls.at(-1)).toEqual({
      method: 'PUT',
      path: '/api/admin/limits',
      body: { limits: { anonymous: 2, student: 3, teacher: null, admin: null } },
    });
  });

  it('checks the numbers before sending', async () => {
    render(<AdminUsagePage />);
    fireEvent.change(await limitInput('Students'), { target: { value: '2.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save limits' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Each limit must be a whole number from 0 to 1000, or empty for no limit.');
    expect(state.calls.some((c) => c.method === 'PUT')).toBe(false);
  });

  it("shows the server's error", async () => {
    state.putReply = { ok: false, status: 403, data: { error: 'Only admins can do this.' } };
    render(<AdminUsagePage />);
    await limitInput('Students');
    fireEvent.click(screen.getByRole('button', { name: 'Save limits' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Only admins can do this.');
  });
});
