'use client';

import Link from 'next/link';
import { useProfile } from '@/components/ProfileProvider';
import { canUseTeacherTools } from '@/lib/role-types';

// Where teachers land after choosing their role (#52). Classes come in #53.
// This client-side check only decides what to show; real class data will come
// from routes guarded by requireRole() and RLS.
export default function TeacherDashboardPage() {
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

  return (
    <main className="min-h-screen p-6 max-w-md mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Teacher dashboard</h1>
        <Link href="/" className="text-sm text-blue-500 hover:underline">
          + New set
        </Link>
      </div>

      <section className="space-y-2">
        <h2 className="font-medium">Your classes</h2>
        <div className="border rounded-lg p-6 text-center text-sm text-gray-500">
          No classes yet. Soon you&apos;ll be able to create a class here and share a join code with
          your students.
        </div>
      </section>

      <p className="text-center text-sm">
        <Link href="/my-sets" className="text-blue-500 hover:underline">
          My Sets
        </Link>
      </p>
    </main>
  );
}
