// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { User } from '@supabase/supabase-js';

const mockAuth = vi.hoisted(() => ({
  getUser: vi.fn(),
  onAuthStateChange: vi.fn(),
  signInWithOAuth: vi.fn(),
  signOut: vi.fn(),
  unsubscribe: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: mockAuth.getUser,
      onAuthStateChange: mockAuth.onAuthStateChange,
      signInWithOAuth: mockAuth.signInWithOAuth,
      signOut: mockAuth.signOut,
    },
  },
}));

import { signInWithGoogle, signOut, useUser } from '@/lib/auth';

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.getUser.mockResolvedValue({ data: { user: null } });
  mockAuth.onAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: mockAuth.unsubscribe } },
  });
  mockAuth.signInWithOAuth.mockResolvedValue({ data: {}, error: null });
  mockAuth.signOut.mockResolvedValue({ error: null });
});

afterEach(() => {
  cleanup();
});

describe('auth helpers', () => {
  it('prompts the user to choose a Google account before signing in', async () => {
    await signInWithGoogle();
    expect(mockAuth.signInWithOAuth).toHaveBeenCalledOnce();
    expect(mockAuth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/`,
        queryParams: { prompt: 'select_account' },
      },
    });
  });

  it('signs out via Supabase auth', async () => {
    await signOut();
    expect(mockAuth.signOut).toHaveBeenCalledOnce();
  });

  it('loads the current user and updates on auth state changes', async () => {
    const fakeUser = { id: 'u1', email: 'student@gmail.com' } as User;
    mockAuth.getUser.mockResolvedValue({ data: { user: fakeUser } });
    let authCallback: ((event: string, session: { user: User } | null) => void) | null = null;
    mockAuth.onAuthStateChange.mockImplementation((cb) => {
      authCallback = cb;
      return { data: { subscription: { unsubscribe: mockAuth.unsubscribe } } };
    });

    const { result, unmount } = renderHook(() => useUser());
    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.user).toEqual(fakeUser);

    act(() => {
      authCallback?.('SIGNED_OUT', null);
    });
    expect(result.current.user).toBeNull();

    unmount();
    expect(mockAuth.unsubscribe).toHaveBeenCalledOnce();
  });
});
