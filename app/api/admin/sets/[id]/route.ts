import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/roles';
import { ADMIN_ROLES } from '@/lib/role-types';
import { isUuid } from '@/lib/ids';
import { deleteAnySet } from '@/lib/admin';
import { errorResponse, notFound } from '@/lib/route-helpers';

// Delete any study set (#61). Admins only. Its cards, assignments and saved
// results go with it, and the deletion is logged.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireRole(req, ADMIN_ROLES);
    const { id } = await params;
    const deleted = isUuid(id) ? await deleteAnySet(admin.id, id) : null;
    return deleted ? NextResponse.json({ deleted: true, assignments: deleted.assignments }) : notFound('Study set');
  } catch (err) {
    return errorResponse(err, 'admin/sets/[id] DELETE');
  }
}
