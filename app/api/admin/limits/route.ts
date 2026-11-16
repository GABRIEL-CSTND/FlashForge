import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/roles';
import { ADMIN_ROLES } from '@/lib/role-types';
import { setGenerationLimits } from '@/lib/admin';
import { MAX_DAILY_LIMIT, parseGenerationLimits } from '@/lib/generation-limits';
import { errorResponse, readJsonBody } from '@/lib/route-helpers';

const INVALID = `Each limit must be a whole number from 0 to ${MAX_DAILY_LIMIT}, or empty for no limit.`;

// Replace the daily generation limits (#63):
//   { limits: { anonymous, student, teacher, admin } }, each a number or null.
// Admins only. Takes effect on the next request, and the change is logged.
export async function PUT(req: NextRequest) {
  try {
    const admin = await requireRole(req, ADMIN_ROLES);
    const limits = parseGenerationLimits((await readJsonBody(req))?.limits);
    if (!limits) return NextResponse.json({ error: INVALID }, { status: 400 });
    const saved = await setGenerationLimits(admin.id, limits);
    return saved ? NextResponse.json({ limits: saved }) : NextResponse.json({ error: INVALID }, { status: 400 });
  } catch (err) {
    return errorResponse(err, 'admin/limits PUT');
  }
}
