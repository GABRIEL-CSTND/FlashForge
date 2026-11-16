import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/roles';
import { STUDENT_ROLES } from '@/lib/role-types';
import { isUuid } from '@/lib/classes';
import { leaveClass } from '@/lib/student-classes';
import { errorResponse, notFound } from '@/lib/route-helpers';

// Leave a class (#54). Rejoining needs the class's current code.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole(req, STUDENT_ROLES);
    const { id } = await params;
    const left = isUuid(id) && (await leaveClass(user.id, id));
    return left ? NextResponse.json({ left: true }) : notFound('Class');
  } catch (err) {
    return errorResponse(err, 'student/classes/[id] DELETE');
  }
}
