'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { signOut } from '@/lib/auth';
import { useProfile } from '@/components/ProfileProvider';
import type { SelfSelectableRole } from '@/lib/role-types';

const OPTIONS: { value: SelfSelectableRole; title: string; description: string }[] = [
  {
    value: 'student',
    title: "I'm a student",
    description: "Turn your notes into flashcards and quizzes, and join your teacher's classes.",
  },
  {
    value: 'teacher',
    title: "I'm a teacher",
    description: 'Create classes, assign study sets, and see how your students are doing.',
  },
];

// One-time "student or teacher?" screen (#52). Rendered once in the root
// layout, so it appears on whatever page a signed-in user who hasn't chosen
// yet lands on, including existing users on their next visit. It sits on top
// of the page instead of navigating, so flows underneath (like finishing a
// save after the Google sign-in redirect) keep running.
export default function RoleChooser() {
  const router = useRouter();
  const { profile, refreshProfile } = useProfile();
  const [selected, setSelected] = useState<SelfSelectableRole | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Only default students who haven't chosen. Never shown to admins or to
  // anyone whose role an admin already set.
  const needsChoice = profile?.role === 'student' && profile.roleChosenAt === null;
  if (!needsChoice) return null;

  const handleContinue = async () => {
    if (!selected) return;
    setSubmitting(true);
    setError('');
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const res = await fetch('/api/profile/role', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ role: selected }),
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok && res.status !== 409) {
        setError(body.error || 'Something went wrong. Please try again.');
        return;
      }

      // 409 means it was already chosen (e.g. in another tab): just pick up
      // whatever is stored.
      await refreshProfile();
      if (res.ok && body.role === 'teacher') router.push('/teacher');
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="role-chooser-title"
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-6"
    >
      <div className="w-full max-w-md space-y-5 rounded-xl border bg-background p-6 shadow-xl">
        <div className="space-y-1 text-center">
          <h2 id="role-chooser-title" className="text-xl font-semibold">
            Welcome to FlashForge!
          </h2>
          <p className="text-sm text-gray-500">Are you a student or a teacher?</p>
        </div>

        <fieldset className="space-y-2" disabled={submitting}>
          <legend className="sr-only">Choose your role</legend>
          {OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={`block cursor-pointer rounded-lg border p-4 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500 ${
                selected === opt.value
                  ? 'border-blue-500 bg-blue-500/10'
                  : 'border-gray-300 hover:border-blue-400'
              }`}
            >
              <input
                type="radio"
                name="role"
                value={opt.value}
                checked={selected === opt.value}
                onChange={() => setSelected(opt.value)}
                className="sr-only"
              />
              <span className="block font-medium">{opt.title}</span>
              <span className="mt-1 block text-sm text-gray-500">{opt.description}</span>
            </label>
          ))}
        </fieldset>

        <p className="text-center text-xs text-gray-400">
          You can only choose once. If you pick the wrong one, ask an admin to change it.
        </p>

        {error && (
          <p role="alert" className="text-center text-sm text-red-500">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={handleContinue}
          disabled={!selected || submitting}
          className="btn btn-primary btn-lg w-full"
        >
          {submitting ? 'Saving...' : 'Continue'}
        </button>

        <p className="text-center text-xs text-gray-400">
          Wrong account?{' '}
          <button type="button" onClick={() => signOut()} className="underline hover:text-gray-600">
            Sign out
          </button>
        </p>
      </div>
    </div>
  );
}
