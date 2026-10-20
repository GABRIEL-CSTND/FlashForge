// Shared by server and client code (lib/roles.ts is server-only).
export type Role = 'student' | 'teacher' | 'admin';

export const ROLES: readonly Role[] = ['student', 'teacher', 'admin'];

// What a user may pick for themselves at sign-up (#52). Admin is never
// self-selectable; admins are seeded or promoted by another admin.
export const SELF_SELECTABLE_ROLES = ['student', 'teacher'] as const;
export type SelfSelectableRole = (typeof SELF_SELECTABLE_ROLES)[number];

export function isSelfSelectableRole(value: unknown): value is SelfSelectableRole {
  return (SELF_SELECTABLE_ROLES as readonly unknown[]).includes(value);
}

export function canUseTeacherTools(role: Role | null | undefined): boolean {
  return role === 'teacher' || role === 'admin';
}
