import { NextRequest, NextResponse } from 'next/server';
import { getAuthedUser } from '@/lib/roles';
import { deleteUserData } from '@/lib/user-data';

// DELETE /api/profile/data (#88): Permanently deletes the signed-in user's
// account and all associated data (sets, cards, history, attempts, classes).
export async function DELETE(req: NextRequest) {
  try {
    const user = await getAuthedUser(req);
    if (!user) {
      return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    if (!body || body.confirm !== true) {
      return NextResponse.json(
        { error: 'Confirmation is required to delete your account data.' },
        { status: 400 }
      );
    }

    const result = await deleteUserData(user.id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }

    return NextResponse.json({ deleted: true });
  } catch (err) {
    console.error('[profile/data] delete failed:', err);
    return NextResponse.json(
      { error: 'Something went wrong while deleting your data. Please try again.' },
      { status: 500 }
    );
  }
}
