'use client';

import { useState } from 'react';
import Link from 'next/link';

type RoleTab = 'Student' | 'Teacher' | 'Admin';

export default function SignUpPage() {
  const [selectedRole, setSelectedRole] = useState<RoleTab>('Student');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Left without function for now
  };

  return (
    <main className="flex min-h-[100dvh] w-full flex-col items-center justify-center px-4 py-12">
      <div className="relative w-full max-w-[420px] rounded-[24px] border border-[#e3d8c8] bg-[#fbf8f0] p-7 shadow-[0_12px_40px_rgba(0,0,0,0.4)] sm:p-9">
        {/* Return to sign in page button */}
        <Link
          href="/sign-in"
          aria-label="Return to sign in page"
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
          Create your account
        </h1>
        <p className="mt-1.5 text-center text-sm text-[#6c6152]">
          Sign up to sync your study decks across devices.
        </p>

        {/* Role tabs: Student | Teacher | Admin (UI selection only) */}
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

        {/* Sign up with Gmail button (no function for now) */}
        <button
          type="button"
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
          <span>Sign up with Gmail</span>
        </button>

        {/* OR EMAIL divider */}
        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-[#ded3be]" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#938472]">OR EMAIL</span>
          <div className="h-px flex-1 bg-[#ded3be]" />
        </div>

        {/* Sign Up Form (no function for now) */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="full-name"
              className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-[#3d3227]"
            >
              FULL NAME
            </label>
            <input
              id="full-name"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Jordan Miller"
              className="w-full rounded-xl border border-[#ded3be] bg-[#f5ede0]/50 px-4 py-2.5 text-sm text-[#1e1915] placeholder-[#a69988] outline-none transition focus:border-[#ad8539] focus:bg-white"
            />
          </div>

          <div>
            <label
              htmlFor="signup-email"
              className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-[#3d3227]"
            >
              EMAIL ADDRESS
            </label>
            <input
              id="signup-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jordan.miller@study.edu"
              className="w-full rounded-xl border border-[#ded3be] bg-[#f5ede0]/50 px-4 py-2.5 text-sm text-[#1e1915] placeholder-[#a69988] outline-none transition focus:border-[#ad8539] focus:bg-white"
            />
          </div>

          <div>
            <label
              htmlFor="signup-password"
              className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-[#3d3227]"
            >
              PASSWORD
            </label>
            <input
              id="signup-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••"
              className="w-full rounded-xl border border-[#ded3be] bg-[#f5ede0]/50 px-4 py-2.5 text-sm text-[#1e1915] placeholder-[#a69988] outline-none transition focus:border-[#ad8539] focus:bg-white"
            />
          </div>

          <div>
            <label
              htmlFor="confirm-password"
              className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-[#3d3227]"
            >
              CONFIRM PASSWORD
            </label>
            <input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••••"
              className="w-full rounded-xl border border-[#ded3be] bg-[#f5ede0]/50 px-4 py-2.5 text-sm text-[#1e1915] placeholder-[#a69988] outline-none transition focus:border-[#ad8539] focus:bg-white"
            />
          </div>

          {/* 3D Gold Action Button */}
          <button
            type="submit"
            className="w-full rounded-xl border border-[#b88c3e] bg-[#cca152] py-2.5 text-sm font-bold text-[#261a0e] shadow-[0_3px_0_#9a7231,0_4px_8px_rgba(0,0,0,0.15)] hover:bg-[#bf9442] active:translate-y-[2px] active:shadow-none transition cursor-pointer"
          >
            Create Account
          </button>
        </form>

        {/* Footer actions */}
        <p className="mt-5 text-center text-xs text-[#706454]">
          Already have an account?{' '}
          <Link href="/sign-in" className="font-semibold text-[#a3792c] hover:underline">
            Sign in
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
