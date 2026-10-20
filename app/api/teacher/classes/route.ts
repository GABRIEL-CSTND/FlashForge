import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/roles';
import { TEACHER_ROLES } from '@/lib/role-types';
import { cleanClassName, CLASS_NAME_MAX_LENGTH } from '@/lib/classes-shared';
import { createClass, listClasses, MAX_CLASSES_PER_TEACHER } from '@/lib/classes';
import { errorResponse, readJsonBody } from '@/lib/route-helpers';

// The signed-in teacher's classes (#53). Only their own, newest first.
export async function GET(req: NextRequest) {
  try {
    const user = await requireRole(req, TEACHER_ROLES);
    return NextResponse.json({ classes: await listClasses(user.id) });
  } catch (err) {
    return errorResponse(err, 'teacher/classes GET');
  }
}

// Create a class with a fresh join code.
export async function POST(req: NextRequest) {
  try {
    const user = await requireRole(req, TEACHER_ROLES);
    const name = cleanClassName((await readJsonBody(req))?.name);
    if (!name) {
      return NextResponse.json(
        { error: `Give the class a name (up to ${CLASS_NAME_MAX_LENGTH} characters).` },
        { status: 400 }
      );
    }

    const result = await createClass(user.id, name);
    if (!result.ok) {
      return NextResponse.json(
        { error: `You can have up to ${MAX_CLASSES_PER_TEACHER} classes. Delete one to make room.` },
        { status: 409 }
      );
    }
    return NextResponse.json({ class: result.class }, { status: 201 });
  } catch (err) {
    return errorResponse(err, 'teacher/classes POST');
  }
}
