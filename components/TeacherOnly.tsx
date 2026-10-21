'use client';

import RoleGate from '@/components/RoleGate';
import { TEACHER_ROLES } from '@/lib/role-types';

// Teacher pages: children only mount (and only fetch) for teachers and admins.
export default function TeacherOnly({ children }: { children: React.ReactNode }) {
  return (
    <RoleGate
      allow={TEACHER_ROLES}
      signedOutMessage="Sign in to use the teacher dashboard."
      deniedMessage="The teacher dashboard is only for teachers."
    >
      {children}
    </RoleGate>
  );
}
