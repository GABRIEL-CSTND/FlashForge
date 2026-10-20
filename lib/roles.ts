import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase-admin';

// SERVER-ONLY (uses the service-role client). Roles live in public.profiles and
// can only be changed through server routes; RLS stops users from editing
// their own role.
export type Role = 'student' | 'teacher' | 'admin';

export const ROLES: readonly Role[] = ['student', 'teacher', 'admin'];

export interface AuthedUser {
  id: string;
  email: string | null;
  role: Role;
}

export class AuthError extends Error {
  status: 401 | 403;

  constructor(status: 401 | 403, message: string) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
  }
}

function bearerToken(req: Request): string | null {
  const header = req.headers.get('authorization');
  return header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
}

// Returns null when the request has no valid session. A user without a
// profile row is treated as a student (least privilege), so a missing row can
// never grant extra access.
export async function getAuthedUser(
  req: Request,
  client: SupabaseClient = supabaseAdmin
): Promise<AuthedUser | null> {
  const token = bearerToken(req);
  if (!token) return null;

  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;

  const { data: profile } = await client
    .from('profiles')
    .select('role')
    .eq('id', data.user.id)
    .maybeSingle();

  const role = ROLES.includes(profile?.role) ? (profile!.role as Role) : 'student';
  return { id: data.user.id, email: data.user.email ?? null, role };
}

// Throws AuthError(401) without a valid session and AuthError(403) when the
// user's role isn't allowed. Use at the top of every teacher/admin route:
//
//   const user = await requireRole(req, ['teacher', 'admin']);
export async function requireRole(
  req: Request,
  allowed: readonly Role[],
  client: SupabaseClient = supabaseAdmin
): Promise<AuthedUser> {
  const user = await getAuthedUser(req, client);
  if (!user) throw new AuthError(401, 'You must be signed in.');
  if (!allowed.includes(user.role)) {
    throw new AuthError(403, "You don't have permission to do that.");
  }
  return user;
}
