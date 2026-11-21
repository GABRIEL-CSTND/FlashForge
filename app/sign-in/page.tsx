'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useUser, signInWithGoogle, signInWithPassword } from '@/lib/auth';

type RoleTab = 'Student' | 'Teacher' | 'Admin';

export default function SignInPage() {
  const router = useRouter();
  const { user } = useUser();
  const [selectedRole, setSelectedRole] = useState<RoleTab>('Student');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // If already signed in, redirect to home / desk (not to role-specific account pages)
  useEffect(() => {
    if (user) {
      router.replace('/');
    }
  }, [user, router]);

  const handleGoogleSignIn = async () => {
    try {
      setError('');
      await signInWithGoogle();
      // OAuth redirects externally and returns to /
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not sign in with Google.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please provide both email and password.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { error: signInErr } = await signInWithPassword(email, password);
      if (signInErr) {
        setError(signInErr.message);
        return;
      }
      // Successfully authenticated: go to the study desk without role redirects
      router.push('/');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-[100dvh] w-full flex-col items-center justify-center px-4 py-12">
      <div className="relative w-full max-w-[420px] rounded-[24px] border border-[#e3d8c8] bg-[#fbf8f0] p-7 shadow-[0_12px_40px_rgba(0,0,0,0.4)] sm:p-9">
        {/* Return to hero page button */}
        <Link
          href="/"
          aria-label="Return to hero page"
          className="absolute left-5 top-5 inline-flex h-9 w-9 items-center justify-center rounded-full text-[#706454] transition hover:bg-[#ede3d1]/80 hover:text-[#1e1915] active:scale-95 sm:left-6 sm:top-6 cursor-pointer"
        >
          <svg
            className="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </Link>

        {/* Top graduation badge */}
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-[#785332] bg-gradient-to-b from-[#5c3e23] to-[#3a2615] shadow-md">
          <svg
            className="h-6 w-6 text-[#fbf8f0]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
            <path d="M6 12v5c3 3 9 3 12 0v-5" />
          </svg>
        </div>

        {/* Heading */}
        <h1 className="mt-4 text-center font-serif text-[26px] font-bold tracking-tight text-[#1e1915] sm:text-[28px]">
          Welcome back
        </h1>
        <p className="mt-1.5 text-center text-sm text-[#6c6152]">
          Sign in to sync your study decks across devices.
        </p>

        {/* Role tabs: Student | Teacher | Admin (Selection only - no redirection) */}
        <div
          role="tablist"
          aria-label="Account type"
          className="mt-6 flex rounded-xl border border-[#ded3bf] bg-[#ede3d1]/70 p-1"
        >
          {(['Student', 'Teacher', 'Admin'] as const).map((role) => {
            const active = selectedRole === role;
            return (
              <button
                key={role}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSelectedRole(role)}
                className={`flex-1 rounded-lg py-2 text-center text-sm transition cursor-pointer ${
                  active
                    ? 'bg-[#201813] font-semibold text-white shadow-sm'
                    : 'font-medium text-[#3b3026] hover:bg-[#e4dac7]/60'
                }`}
              >
                {role}
              </button>
            );
          })}
        </div>

        {/* Sign in with Gmail button */}
        <button
          type="button"
          onClick={handleGoogleSignIn}
          className="mt-4 flex w-full items-center justify-center gap-2.5 rounded-xl border border-[#d8cdb9] bg-[#fcfaf5] py-2.5 px-4 text-sm font-semibold text-[#1f1915] shadow-sm hover:bg-white active:scale-[0.99] transition cursor-pointer"
        >
          <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          <span>Sign in with Gmail</span>
        </button>

        {/* OR EMAIL divider */}
        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-[#ded3be]" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#938472]">OR EMAIL</span>
          <div className="h-px flex-1 bg-[#ded3be]" />
        </div>

        {/* Email & Password Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-[11px] font-bold uppercase tracking-wider text-[#3d3227] mb-1.5"
            >
              EMAIL ADDRESS
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jordan.miller@study.edu"
              className="w-full rounded-xl border border-[#ded3be] bg-[#f5ede0]/50 px-4 py-2.5 text-sm text-[#1e1915] placeholder-[#a69988] outline-none transition focus:border-[#ad8539] focus:bg-white"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-[11px] font-bold uppercase tracking-wider text-[#3d3227] mb-1.5"
            >
              PASSWORD
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••"
              className="w-full rounded-xl border border-[#ded3be] bg-[#f5ede0]/50 px-4 py-2.5 text-sm text-[#1e1915] placeholder-[#a69988] outline-none transition focus:border-[#ad8539] focus:bg-white"
            />
          </div>

          {error && (
            <p role="alert" className="text-xs font-medium text-pencil">
              {error}
            </p>
          )}

          {/* 3D Gold Action Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl border border-[#b88c3e] bg-[#cca152] py-2.5 text-sm font-bold text-[#261a0e] shadow-[0_3px_0_#9a7231,0_4px_8px_rgba(0,0,0,0.15)] hover:bg-[#bf9442] active:translate-y-[2px] active:shadow-none transition cursor-pointer disabled:opacity-60"
          >
            {loading ? 'Please wait...' : 'Sign In'}
          </button>
        </form>

        {/* Footer actions */}
        <p className="mt-5 text-center text-xs text-[#706454]">
          Don&apos;t have an account?{' '}
          <Link href="/sign-up" className="font-semibold text-[#a3792c] hover:underline">
            Sign up free
          </Link>
        </p>

        <div className="mt-2.5 text-center">
          <Link
            href="/"
            className="text-xs text-[#706454] underline hover:text-[#1e1915] transition"
          >
            Continue as guest instead
          </Link>
        </div>
      </div>
    </main>
  );
}
