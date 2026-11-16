'use client';

import RoleGate from '@/components/RoleGate';
import { ADMIN_ROLES } from '@/lib/role-types';

// Admin pages (#60): children only mount (and only fetch) for admins.
export default function AdminOnly({ children }: { children: React.ReactNode }) {
  return (
    <RoleGate
      allow={ADMIN_ROLES}
      signedOutMessage="Sign in to use the admin pages."
      deniedMessage="The admin pages are only for admins."
    >
      {children}
    </RoleGate>
  );
}
