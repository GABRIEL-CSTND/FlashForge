import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/roles';
import { ADMIN_ROLES } from '@/lib/role-types';
import { listSets } from '@/lib/admin';
import { errorResponse } from '@/lib/route-helpers';

// Every study set with its owner and number of cards and assignments (#61):
// ?q= searches titles and owners. Admins only.
export async function GET(req: NextRequest) {
  try {
    await requireRole(req, ADMIN_ROLES);
    const search = (req.nextUrl.searchParams.get('q') ?? '').slice(0, 100);
    return NextResponse.json({ sets: await listSets(search) });
  } catch (err) {
    return errorResponse(err, 'admin/sets GET');
  }
}
