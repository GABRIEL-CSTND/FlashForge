import { NextRequest, NextResponse } from 'next/server';
import { chooseOwnRole, getAuthedUser } from '@/lib/roles';
import { isSelfSelectableRole } from '@/lib/role-types';

// One-time role choice at sign-up (#52): a default student picks "student" or
// "teacher" exactly once. Admin is never accepted here, and after the choice
// only an admin can change a user's role.
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthedUser(req);
    if (!user) {
      return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const role = body?.role;
    if (!isSelfSelectableRole(role)) {
      return NextResponse.json({ error: 'Choose either student or teacher.' }, { status: 400 });
    }

    const result = await chooseOwnRole(user.id, role);
    if (result === 'already-chosen') {
      return NextResponse.json(
        { error: 'Your role has already been set. Ask an admin if it needs to change.' },
        { status: 409 }
      );
    }

    return NextResponse.json({ role });
  } catch (err) {
    console.error('[profile/role] failed:', err);
    return NextResponse.json(
      { error: 'Something went wrong while saving your choice. Please try again.' },
      { status: 500 }
    );
  }
}
