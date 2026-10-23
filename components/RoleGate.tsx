'use client';

import Link from 'next/link';
import { useProfile } from '@/components/ProfileProvider';
import type { Role } from '@/lib/role-types';

interface GateLink {
  href: string;
  label: string;
}

interface RoleGateProps {
  allow: readonly Role[];
  signedOutMessage: string;
  // Shown to signed-in users whose role isn't in `allow`.
  deniedMessage: string;
  deniedLink?: GateLink;
  children: React.ReactNode;
}

const BACK_HOME: GateLink = { href: '/', label: '← Back to upload' };

function GateMessage({ message, link, tone = 'muted' }: { message: string; link: GateLink; tone?: 'muted' | 'error' }) {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
      <p className={tone === 'error' ? 'text-red-500' : 'text-gray-500'}>{message}</p>
      <Link href={link.href} className="text-link hover:underline">
        {link.label}
      </Link>
    </main>
  );
}

// Wraps role-specific pages: children only mount (and only fetch) for allowed
// roles. This only decides what to show; API routes enforce access with
// requireRole() and ownership checks.
export default function RoleGate({ allow, signedOutMessage, deniedMessage, deniedLink, children }: RoleGateProps) {
  const { user, profile, loading } = useProfile();

  if (loading) {
    return <main className="min-h-screen flex items-center justify-center">Loading...</main>;
  }
  if (!user) return <GateMessage message={signedOutMessage} link={BACK_HOME} />;
  if (!profile) {
    return <GateMessage tone="error" message="Couldn't load your account. Refresh the page to try again." link={BACK_HOME} />;
  }
  if (!allow.includes(profile.role)) return <GateMessage message={deniedMessage} link={deniedLink ?? BACK_HOME} />;

  return <>{children}</>;
}
