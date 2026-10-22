import { NextRequest, NextResponse } from 'next/server';
import { getAuthedUser } from '@/lib/roles';
import { isUuid } from '@/lib/ids';
import { listMyAttempts, recordAttempt } from '@/lib/attempts';
import { errorResponse, notFound, readJsonBody } from '@/lib/route-helpers';

// Record a finished study session (#57):
//   { id, setId, assignmentId?, answers: [{ cardId, chosen? | result? }] }
// `id` is chosen by the browser once per finish, so a retry can't create a
// second attempt. The score is worked out on the server from the real cards.
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ error: 'Sign in to save your scores.' }, { status: 401 });

    const body = await readJsonBody(req);
    if (!isUuid(body?.id) || !isUuid(body?.setId)) {
      return NextResponse.json({ error: 'Missing attempt or set id.' }, { status: 400 });
    }

    const result = await recordAttempt(user.id, {
      attemptId: body.id,
      setId: body.setId,
      assignmentId: body.assignmentId,
      answers: body.answers,
    });
    switch (result.kind) {
      case 'not-found':
        return notFound('Study set');
      case 'invalid':
        return NextResponse.json({ error: result.error }, { status: 400 });
      case 'stale':
        return NextResponse.json(
          { error: 'This set changed while you were studying, so the score couldn’t be saved.' },
          { status: 409 }
        );
      case 'conflict':
        return NextResponse.json({ error: 'That attempt id is already used.' }, { status: 409 });
      default:
        return NextResponse.json({ attempt: result.attempt }, { status: result.kind === 'created' ? 201 : 200 });
    }
  } catch (err) {
    return errorResponse(err, 'attempts POST');
  }
}

// The signed-in user's own recent attempts on one set: ?setId=…
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 });
    const setId = req.nextUrl.searchParams.get('setId');
    if (!isUuid(setId)) return NextResponse.json({ error: 'Missing set id.' }, { status: 400 });
    return NextResponse.json({ attempts: await listMyAttempts(user.id, setId) });
  } catch (err) {
    return errorResponse(err, 'attempts GET');
  }
}
