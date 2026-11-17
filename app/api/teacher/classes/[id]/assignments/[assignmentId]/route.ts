import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/roles';
import { TEACHER_ROLES } from '@/lib/role-types';
import { isUuid } from '@/lib/ids';
import { parseDueAt } from '@/lib/due-dates';
import { unassign, updateAssignment, updateAssignmentDue } from '@/lib/assignments';
import { getAssignmentQuestions } from '@/lib/class-results';
import { errorResponse, notFound, readJsonBody } from '@/lib/route-helpers';

type Context = { params: Promise<{ id: string; assignmentId: string }> };

// The assignment's questions, hardest first (#59): how many current students
// got each one wrong (by their latest attempt) and, for multiple choice, the
// wrong answer picked most often.
export async function GET(req: NextRequest, { params }: Context) {
  try {
    const user = await requireRole(req, TEACHER_ROLES);
    const { id, assignmentId } = await params;
    const result =
      isUuid(id) && isUuid(assignmentId)
        ? await getAssignmentQuestions(user.id, id, assignmentId)
        : ({ kind: 'not-found' } as const);
    if (result.kind === 'not-found') return notFound('Assignment');
    const { class: cls, assignment, studentCount, studentsDone, questions } = result;
    return NextResponse.json({ class: cls, assignment, studentCount, studentsDone, questions });
  } catch (err) {
    return errorResponse(err, 'teacher/classes/[id]/assignments/[assignmentId] GET');
  }
}

// Change assignment options: { dueAt?: string | null, allowBack?: boolean } (#56, #102).
export async function PATCH(req: NextRequest, { params }: Context) {
  try {
    const user = await requireRole(req, TEACHER_ROLES);
    const { id, assignmentId } = await params;
    if (!isUuid(id) || !isUuid(assignmentId)) return notFound('Assignment');

    const body = await readJsonBody(req);
    const patch: { dueAt?: string | null; allowBack?: boolean } = {};
    if (body && 'dueAt' in body) {
      const due = parseDueAt(body.dueAt);
      if (!due.ok) return NextResponse.json({ error: due.error }, { status: 400 });
      patch.dueAt = due.dueAt;
    }
    if (body && typeof body.allowBack === 'boolean') {
      patch.allowBack = body.allowBack;
    }

    const updated = await updateAssignment(user.id, id, assignmentId, patch);
    if (!updated) return notFound('Assignment');
    const responseBody: Record<string, unknown> = {};
    if ('dueAt' in patch) responseBody.dueAt = updated.dueAt ?? null;
    if ('allowBack' in patch) responseBody.allowBack = updated.allowBack;
    return NextResponse.json(responseBody);
  } catch (err) {
    return errorResponse(err, 'teacher/classes/[id]/assignments/[assignmentId] PATCH');
  }
}

// Unassign the set from this class. Students lose access to it right away.
export async function DELETE(req: NextRequest, { params }: Context) {
  try {
    const user = await requireRole(req, TEACHER_ROLES);
    const { id, assignmentId } = await params;
    const removed = isUuid(id) && isUuid(assignmentId) && (await unassign(user.id, id, assignmentId));
    return removed ? NextResponse.json({ unassigned: true }) : notFound('Assignment');
  } catch (err) {
    return errorResponse(err, 'teacher/classes/[id]/assignments/[assignmentId] DELETE');
  }
}
