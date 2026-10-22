import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/roles';
import { TEACHER_ROLES } from '@/lib/role-types';
import { isUuid, removeStudent } from '@/lib/classes';
import { getStudentResults } from '@/lib/class-results';
import { errorResponse, notFound } from '@/lib/route-helpers';

type Context = { params: Promise<{ id: string; studentId: string }> };

// One student's attempts on this class's assignments (#58), grouped by
// assignment, newest first. Only for students in the teacher's own class.
export async function GET(req: NextRequest, { params }: Context) {
  try {
    const user = await requireRole(req, TEACHER_ROLES);
    const { id, studentId } = await params;
    if (!isUuid(id)) return notFound('Class');
    if (!isUuid(studentId)) return notFound('Student');

    const result = await getStudentResults(user.id, id, studentId);
    if (result.kind === 'class-not-found') return notFound('Class');
    if (result.kind === 'student-not-found') return notFound('Student');
    return NextResponse.json({ student: result.student, assignments: result.assignments });
  } catch (err) {
    return errorResponse(err, 'teacher/classes/[id]/students/[studentId] GET');
  }
}

// Remove a student from one of the teacher's classes.
export async function DELETE(req: NextRequest, { params }: Context) {
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
