'use client';

import Link from 'next/link';
import AdminOnly from '@/components/AdminOnly';

// Admin home (#60): links to the admin tools.
export default function AdminPage() {
  return (
    <AdminOnly>
      <main className="min-h-screen w-full p-6 max-w-md mx-auto space-y-6">
        <Link href="/" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800">
          ← Home
        </Link>
        <h1 className="text-xl font-semibold">Admin</h1>
        <ul className="space-y-3">
          <li>
            <Link href="/admin/users" className="block rounded-lg border p-4 hover:border-blue-400">
              <span className="block font-medium">👥 Users and roles</span>
              <span className="block text-sm text-gray-500">Find users, make teachers and admins.</span>
            </Link>
          </li>
        </ul>
      </main>
    </AdminOnly>
  );
}
