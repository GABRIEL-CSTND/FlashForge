import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/roles';
import { TEACHER_ROLES } from '@/lib/role-types';
import { isUuid } from '@/lib/ids';
import { parseDueAt } from '@/lib/due-dates';
import { isClassContentCategory } from '@/lib/classes-shared';
import { unassign, updateAssignmentCategory, updateAssignmentDue, updateAssignmentSourceSharing } from '@/lib/assignments';
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

// Change a category, due date, or source sharing setting.
export async function PATCH(req: NextRequest, { params }: Context) {
  try {
    const user = await requireRole(req, TEACHER_ROLES);
    const { id, assignmentId } = await params;
    if (!isUuid(id) || !isUuid(assignmentId)) return notFound('Assignment');
    const body = await readJsonBody(req);
    if (body?.allowSourceMaterial !== undefined) {
      const allow = body.allowSourceMaterial;
      if (typeof allow !== 'boolean' || body.category !== undefined || body.dueAt !== undefined) {
        return NextResponse.json({ error: 'Change source sharing on its own.' }, { status: 400 });
      }
      const updated = await updateAssignmentSourceSharing(user.id, id, assignmentId, allow);
      return updated ? NextResponse.json({ allowSourceMaterial: allow }) : notFound('Assignment');
    }
    if (body?.category !== undefined) {
      if (!isClassContentCategory(body.category) || body.dueAt !== undefined) {
        return NextResponse.json({ error: 'Choose a category without changing the due date.' }, { status: 400 });
      }
      const updated = await updateAssignmentCategory(user.id, id, assignmentId, body.category);
      return updated ? NextResponse.json(updated) : notFound('Assignment');
    }
    const due = parseDueAt(body?.dueAt);
    if (!due.ok) return NextResponse.json({ error: due.error }, { status: 400 });

    const updated = await updateAssignmentDue(user.id, id, assignmentId, due.dueAt);
    return updated ? NextResponse.json({ dueAt: due.dueAt }) : notFound('Assignment');
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
