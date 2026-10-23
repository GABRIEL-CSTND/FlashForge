import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/roles';
import { ADMIN_ROLES, ROLES, type Role } from '@/lib/role-types';
import { isUuid } from '@/lib/ids';
import { changeUserRole } from '@/lib/admin';
import { errorResponse, notFound, readJsonBody } from '@/lib/route-helpers';

// Change a user's role: { role: 'student' | 'teacher' | 'admin' } (#60). Admins
// only. The last admin can't be demoted, and every change is logged.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireRole(req, ADMIN_ROLES);
    const { id } = await params;
    if (!isUuid(id)) return notFound('User');
    const role = (await readJsonBody(req))?.role;
    if (typeof role !== 'string' || !ROLES.includes(role as Role)) {
      return NextResponse.json({ error: 'Choose student, teacher or admin.' }, { status: 400 });
    }

    const result = await changeUserRole(admin.id, id, role as Role);
    if (result.ok) return NextResponse.json({ from: result.from, role: result.to });
    if (result.reason === 'not-found') return notFound('User');
    return NextResponse.json(
      { error: "The last admin can't be removed. Make someone else an admin first." },
      { status: 409 }
    );
  } catch (err) {
    return errorResponse(err, 'admin/users/[id] PATCH');
  }
}
