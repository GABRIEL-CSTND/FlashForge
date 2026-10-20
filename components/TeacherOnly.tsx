'use client';

import Link from 'next/link';
import { useProfile } from '@/components/ProfileProvider';
import { canUseTeacherTools } from '@/lib/role-types';

// Wraps teacher pages: children only mount (and only fetch) for teachers and
// admins. This only decides what to show; the API routes enforce access with
// requireRole() and ownership checks.
export default function TeacherOnly({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useProfile();

  if (loading) {
    return <main className="min-h-screen flex items-center justify-center">Loading...</main>;
  }

  if (!user || !canUseTeacherTools(profile?.role)) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-gray-500">
          {user ? 'The teacher dashboard is only for teachers.' : 'Sign in to use the teacher dashboard.'}
        </p>
        <Link href="/" className="text-blue-500 hover:underline">
          ← Back to upload
        </Link>
      </main>
    );
  }

  return <>{children}</>;
}
