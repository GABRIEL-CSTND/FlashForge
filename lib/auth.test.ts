// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSignInWithOAuth = vi.fn();
const mockSignOut = vi.fn();
const mockSignInWithPassword = vi.fn();
const mockSignUp = vi.fn();
const mockGetUser = vi.fn().mockResolvedValue({ data: { user: null } });
const mockOnAuthStateChange = vi.fn().mockReturnValue({
  data: { listener: { subscription: { unsubscribe: vi.fn() } } },
});

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithOAuth: (...args: unknown[]) => mockSignInWithOAuth(...args),
      signOut: (...args: unknown[]) => mockSignOut(...args),
      signInWithPassword: (...args: unknown[]) => mockSignInWithPassword(...args),
      signUp: (...args: unknown[]) => mockSignUp(...args),
      getUser: () => mockGetUser(),
      onAuthStateChange: (...args: unknown[]) => mockOnAuthStateChange(...args),
    },
  },
}));

import { signInWithGoogle, signInWithPassword, signOut, signUpWithPassword } from './auth';

describe('lib/auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('signInWithGoogle', () => {
    it('prompts user to select account instead of directly logging into previous account', async () => {
      await signInWithGoogle();

      expect(mockSignInWithOAuth).toHaveBeenCalledOnce();
      expect(mockSignInWithOAuth).toHaveBeenCalledWith({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/`,
          queryParams: {
            prompt: 'select_account',
          },
        },
      });
    });

    it('allows passing custom redirectTo while preserving select_account prompt', async () => {
      await signInWithGoogle({ redirectTo: 'http://localhost:3000/my-sets' });

      expect(mockSignInWithOAuth).toHaveBeenCalledWith({
        provider: 'google',
        options: {
          redirectTo: 'http://localhost:3000/my-sets',
          queryParams: {
            prompt: 'select_account',
          },
        },
      });
    });
  });

  describe('signOut', () => {
    it('calls supabase.auth.signOut', async () => {
      await signOut();
      expect(mockSignOut).toHaveBeenCalledOnce();
    });
  });

  describe('signInWithPassword', () => {
    it('calls supabase.auth.signInWithPassword with credentials', async () => {
      await signInWithPassword('user@example.com', 'mypassword');
      expect(mockSignInWithPassword).toHaveBeenCalledWith({
        email: 'user@example.com',
        password: 'mypassword',
      });
    });
  });

  describe('signUpWithPassword', () => {
    it('calls supabase.auth.signUp with credentials', async () => {
      await signUpWithPassword('new@example.com', 'newpassword');
      expect(mockSignUp).toHaveBeenCalledWith({
        email: 'new@example.com',
        password: 'newpassword',
      });
    });
  });
});
