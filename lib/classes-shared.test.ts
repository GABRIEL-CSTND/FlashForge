import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: {} }));

import { cleanClassName, formatJoinCode, JOIN_CODE_ALPHABET, normalizeJoinCode } from '@/lib/classes-shared';
import { generateJoinCode, isUuid } from '@/lib/classes';

describe('class names', () => {
  it('trims and collapses whitespace', () => {
    expect(cleanClassName('  Biology\t 101  ')).toBe('Biology 101');
  });

  it('rejects empty, whitespace-only, too-long, and non-string names', () => {
    expect(cleanClassName('')).toBeNull();
    expect(cleanClassName('   ')).toBeNull();
    expect(cleanClassName('x'.repeat(81))).toBeNull();
    expect(cleanClassName(42)).toBeNull();
    expect(cleanClassName('x'.repeat(80))).toHaveLength(80);
  });
});

describe('join codes', () => {
  it('generates 6 characters from the look-alike-free alphabet', () => {
    for (let i = 0; i < 500; i++) {
      expect(generateJoinCode()).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/);
    }
    expect(JOIN_CODE_ALPHABET).not.toMatch(/[01ILO]/);
  });

  it('uses every character of the alphabet over many codes', () => {
    const seen = new Set(Array.from({ length: 400 }, generateJoinCode).join(''));
    expect(seen.size).toBe(JOIN_CODE_ALPHABET.length);
  });

  it('formats codes as ABC-123', () => {
    expect(formatJoinCode('K7M2QX')).toBe('K7M-2QX');
  });

  it('normalizes what people type, and rejects what can\'t be a code', () => {
    expect(normalizeJoinCode('k7m-2qx')).toBe('K7M2QX');
    expect(normalizeJoinCode(' K7M 2QX ')).toBe('K7M2QX');
    expect(normalizeJoinCode('K7M2Q')).toBeNull();
    expect(normalizeJoinCode('K7M2QXX')).toBeNull();
    expect(normalizeJoinCode('O0I1LL')).toBeNull();
  });
});

describe('ids', () => {
  it('accepts UUIDs only', () => {
    expect(isUuid('6f1c2a7e-3b4d-4e5f-8a9b-0c1d2e3f4a5b')).toBe(true);
    expect(isUuid('not-a-uuid')).toBe(false);
    expect(isUuid("1' or '1'='1")).toBe(false);
  });
});
