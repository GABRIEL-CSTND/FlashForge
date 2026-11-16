import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/roles';
import { TEACHER_ROLES } from '@/lib/role-types';
import { isUuid, regenerateJoinCode } from '@/lib/classes';
import { errorResponse, notFound } from '@/lib/route-helpers';

// Replace the join code (e.g. if it leaked). The old code stops working
// immediately; students already in the class stay.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole(req, TEACHER_ROLES);
    const { id } = await params;
    const joinCode = isUuid(id) ? await regenerateJoinCode(user.id, id) : null;
    return joinCode ? NextResponse.json({ joinCode }) : notFound('Class');
  } catch (err) {
    return errorResponse(err, 'teacher/classes/[id]/join-code POST');
  }
}
