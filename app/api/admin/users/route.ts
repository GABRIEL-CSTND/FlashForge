import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/roles';
import { ADMIN_ROLES } from '@/lib/role-types';
import { listUsers } from '@/lib/admin';
import { errorResponse } from '@/lib/route-helpers';

// All users with their role, sign-up date and number of sets (#60): ?q= searches
// by email or name. Admins only.
export async function GET(req: NextRequest) {
  try {
    await requireRole(req, ADMIN_ROLES);
    const search = (req.nextUrl.searchParams.get('q') ?? '').slice(0, 100);
    return NextResponse.json({ users: await listUsers(search) });
  } catch (err) {
    return errorResponse(err, 'admin/users GET');
  }
}
