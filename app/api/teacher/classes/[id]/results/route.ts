import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/roles';
import { TEACHER_ROLES } from '@/lib/role-types';
import { isUuid } from '@/lib/ids';
import { getClassResults } from '@/lib/class-results';
import { errorResponse, notFound } from '@/lib/route-helpers';

// Each current student's results on each of the class's assignments, with
// class averages (#58). Another teacher's class is a 404.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole(req, TEACHER_ROLES);
    const { id } = await params;
    const results = isUuid(id) ? await getClassResults(user.id, id) : null;
    return results ? NextResponse.json(results) : notFound('Class');
  } catch (err) {
    return errorResponse(err, 'teacher/classes/[id]/results GET');
  }
}
