import { webcrypto } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isUuid, newId } from '@/lib/ids';

afterEach(() => vi.unstubAllGlobals());

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('newId', () => {
  it('makes a different v4 UUID each time', () => {
    const [a, b] = [newId(), newId()];
    expect(a).toMatch(V4);
    expect(isUuid(a)).toBe(true);
    expect(a).not.toBe(b);
  });

  // crypto.randomUUID is missing on plain-http pages, e.g. testing on a phone at
  // http://192.168.x.x:3000.
  it('still makes v4 UUIDs where crypto.randomUUID is missing', () => {
    vi.stubGlobal('crypto', { getRandomValues: (a: Uint8Array) => webcrypto.getRandomValues(a) });
    const ids = Array.from({ length: 50 }, () => newId());
    for (const id of ids) expect(id).toMatch(V4);
    expect(new Set(ids).size).toBe(50);
  });
});
