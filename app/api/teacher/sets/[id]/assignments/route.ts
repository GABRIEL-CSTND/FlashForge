import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/roles';
import { TEACHER_ROLES } from '@/lib/role-types';
import { isUuid } from '@/lib/ids';
import { parseDueAt } from '@/lib/due-dates';
import { assignSet, getSetAssignments } from '@/lib/assignments';
import { errorResponse, notFound, readJsonBody } from '@/lib/route-helpers';

type Context = { params: Promise<{ id: string }> };

// The teacher's classes, and which of them this set is assigned to (#56).
export async function GET(req: NextRequest, { params }: Context) {
  try {
    const user = await requireRole(req, TEACHER_ROLES);
    const { id } = await params;
    const view = isUuid(id) ? await getSetAssignments(user.id, id) : null;
    return view ? NextResponse.json(view) : notFound('Study set');
  } catch (err) {
    return errorResponse(err, 'teacher/sets/[id]/assignments GET');
  }
}

// Assign the set to classes: { classIds: string[], dueAt: string | null }.
// Classes that already have it are left as they are and listed in alreadyAssigned.
export async function POST(req: NextRequest, { params }: Context) {
  try {
    const user = await requireRole(req, TEACHER_ROLES);
    const { id } = await params;
    if (!isUuid(id)) return notFound('Study set');

    const body = await readJsonBody(req);
    const classIds = body?.classIds;
    if (!Array.isArray(classIds) || classIds.length === 0 || !classIds.every(isUuid)) {
      return NextResponse.json({ error: 'Pick at least one class.' }, { status: 400 });
    }
    const due = parseDueAt(body?.dueAt);
    if (!due.ok) return NextResponse.json({ error: due.error }, { status: 400 });

    const result = await assignSet(user.id, id, classIds, due.dueAt);
    if (!result.ok) return notFound(result.reason === 'set-not-found' ? 'Study set' : 'Class');
    return NextResponse.json(result, { status: result.assigned.length > 0 ? 201 : 200 });
  } catch (err) {
    return errorResponse(err, 'teacher/sets/[id]/assignments POST');
  }
}
