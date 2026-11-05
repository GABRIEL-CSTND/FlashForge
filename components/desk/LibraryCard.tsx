'use client';

import { signInWithGoogle, signOut, useUser } from '@/lib/auth';
import { useProfile } from '@/components/ProfileProvider';
import type { Role } from '@/lib/role-types';

const ROLE_LABELS: Record<Role, string> = {
  student: 'Student',
  teacher: 'Teacher',
  admin: 'Admin',
};

// The account, as a small library card at the top right of the desk: your name
// (or email), your role and Sign out; signed out, the Sign in button.
export default function LibraryCard() {
  const { user, loading } = useUser();
  const { profile } = useProfile();

  return (
    <section
      aria-label="Library card"
      // ml-auto keeps it on the right when a long row of tabs pushes it onto its own line.
      className="paper paper-shadow ml-auto w-48 rotate-[1.5deg] rounded-md px-4 pb-1 pt-3 text-ink sm:w-60"
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brass-ink">Library card</p>
      {user ? (
        <>
          <p
            className="mt-1 truncate border-b border-ink/15 pb-1 font-serif text-lg leading-snug"
            title={user.email ?? undefined}
          >
            {profile?.displayName || user.email}
          </p>
          <div className="flex min-h-11 items-center justify-between gap-2">
            <span className="text-xs text-muted">{profile ? ROLE_LABELS[profile.role] : ''}</span>
            <button
              type="button"
              onClick={() => signOut()}
              className="min-h-11 text-[13px] font-semibold text-brass-ink hover:underline"
            >
              Sign out
            </button>
          </div>
        </>
      ) : loading ? (
        // Same height as the signed-in card, so the desk doesn't jump while the session loads.
        <div aria-hidden="true" className="h-[4.25rem]" />
      ) : (
        <div className="pb-2 pt-1.5">
          <button type="button" onClick={() => signInWithGoogle()} className="btn btn-primary w-full">
            Sign in with Google
          </button>
        </div>
      )}
    </section>
  );
}
