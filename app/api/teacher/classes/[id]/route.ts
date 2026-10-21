import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/roles';
import { TEACHER_ROLES } from '@/lib/role-types';
import { cleanClassName, CLASS_NAME_MAX_LENGTH } from '@/lib/classes-shared';
import { deleteClass, getClass, isUuid, renameClass } from '@/lib/classes';
import { listClassAssignments } from '@/lib/assignments';
import { errorResponse, notFound, readJsonBody } from '@/lib/route-helpers';

type Context = { params: Promise<{ id: string }> };

// A class with its join code, roster and assignments (#56). Another
// teacher's class is a 404, so its existence isn't revealed.
export async function GET(req: NextRequest, { params }: Context) {
  try {
    const user = await requireRole(req, TEACHER_ROLES);
    const { id } = await params;
    const cls = isUuid(id) ? await getClass(user.id, id) : null;
    if (!cls) return notFound('Class');
    const assignments = (await listClassAssignments(user.id, id)) ?? [];
    return NextResponse.json({ class: { ...cls, assignments } });
  } catch (err) {
    return errorResponse(err, 'teacher/classes/[id] GET');
  }
}

// Rename: { name }.
export async function PATCH(req: NextRequest, { params }: Context) {
  try {
    const user = await requireRole(req, TEACHER_ROLES);
    const { id } = await params;
    const name = cleanClassName((await readJsonBody(req))?.name);
    if (!name) {
      return NextResponse.json(
        { error: `Give the class a name (up to ${CLASS_NAME_MAX_LENGTH} characters).` },
        { status: 400 }
      );
    }
    const renamed = isUuid(id) && (await renameClass(user.id, id, name));
    return renamed ? NextResponse.json({ name }) : notFound('Class');
  } catch (err) {
    return errorResponse(err, 'teacher/classes/[id] PATCH');
  }
}

// Delete the class; its members are removed with it.
export async function DELETE(req: NextRequest, { params }: Context) {
  try {
    const user = await requireRole(req, TEACHER_ROLES);
    const { id } = await params;
    const deleted = isUuid(id) && (await deleteClass(user.id, id));
    return deleted ? NextResponse.json({ deleted: true }) : notFound('Class');
  } catch (err) {
    return errorResponse(err, 'teacher/classes/[id] DELETE');
  }
}
