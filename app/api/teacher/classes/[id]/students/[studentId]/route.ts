import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/roles';
import { TEACHER_ROLES } from '@/lib/role-types';
import { isUuid, removeStudent } from '@/lib/classes';
import { errorResponse, notFound } from '@/lib/route-helpers';

// Remove a student from one of the teacher's classes.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; studentId: string }> }
) {
  try {
    const user = await requireRole(req, TEACHER_ROLES);
    const { id, studentId } = await params;
    if (!isUuid(id)) return notFound('Class');
    if (!isUuid(studentId)) return notFound('Student');

    const result = await removeStudent(user.id, id, studentId);
    if (result === 'class-not-found') return notFound('Class');
    if (result === 'student-not-found') return notFound('Student');
    return NextResponse.json({ removed: true });
  } catch (err) {
    return errorResponse(err, 'teacher/classes/[id]/students/[studentId] DELETE');
  }
}
