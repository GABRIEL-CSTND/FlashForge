import { describe, expect, it } from 'vitest';
import { fromLocalInputValue, isOverdue, parseDueAt, sortByDue, toLocalInputValue } from '@/lib/due-dates';

const NOW = new Date('2026-10-21T12:00:00Z');
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000).toISOString();

describe('parseDueAt', () => {
  it('treats empty values as "no due date"', () => {
    for (const v of [null, undefined, '']) expect(parseDueAt(v, NOW)).toEqual({ ok: true, dueAt: null });
  });

  it('accepts a future date and normalizes it to an ISO timestamp', () => {
    expect(parseDueAt('2026-10-30T23:59:00+08:00', NOW)).toEqual({ ok: true, dueAt: '2026-10-30T15:59:00.000Z' });
  });

  it('allows 5 minutes of grace, then rejects past dates', () => {
    expect(parseDueAt(at(-4), NOW).ok).toBe(true);
    expect(parseDueAt(at(-6), NOW)).toEqual({ ok: false, error: 'That due date has already passed.' });
  });

  it('rejects dates more than 2 years out, garbage, and non-strings', () => {
    expect(parseDueAt(at(3 * 366 * 24 * 60), NOW)).toEqual({ ok: false, error: 'Pick a due date within the next 2 years.' });
    expect(parseDueAt('next friday', NOW)).toEqual({ ok: false, error: 'Pick a valid due date.' });
    expect(parseDueAt(1234, NOW)).toEqual({ ok: false, error: 'Pick a valid due date.' });
  });
});

describe('isOverdue', () => {
  it('is true only for a due date that has passed', () => {
    expect(isOverdue(at(-1), NOW)).toBe(true);
    expect(isOverdue(at(1), NOW)).toBe(false);
    expect(isOverdue(null, NOW)).toBe(false);
  });
});

describe('local date-time inputs', () => {
  it('round-trips through the datetime-local format in local time', () => {
    const value = '2026-11-05T08:30';
    const iso = fromLocalInputValue(value)!;
    expect(new Date(iso).getHours()).toBe(8);
    expect(toLocalInputValue(iso)).toBe(value);
    expect(fromLocalInputValue('')).toBeNull();
  });
});

describe('sortByDue', () => {
  it('puts the soonest due first, then sets without a due date (newest first)', () => {
    const items = [
      { name: 'no due, older', dueAt: null, createdAt: '2026-10-01T00:00:00Z' },
      { name: 'due later', dueAt: at(600), createdAt: '2026-10-01T00:00:00Z' },
      { name: 'no due, newer', dueAt: null, createdAt: '2026-10-20T00:00:00Z' },
      { name: 'due soon', dueAt: at(60), createdAt: '2026-10-01T00:00:00Z' },
    ];
    expect(sortByDue(items).map((i) => i.name)).toEqual(['due soon', 'due later', 'no due, newer', 'no due, older']);
  });
});
