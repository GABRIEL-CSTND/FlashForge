import { NextRequest, NextResponse } from 'next/server';
import { getAuthedUser } from '@/lib/roles';
import { isUuid } from '@/lib/ids';
import { validateCards } from '@/lib/card-rules';
import { getOwnedSet, replaceSetCards, SetCardsError } from '@/lib/sets';
import { errorResponse, notFound, readJsonBody } from '@/lib/route-helpers';

// Save the owner's edited cards (#55): { cards: [{ id?, question, answer, options? }] }
// in the order they should appear. Cards without an id are new; existing
// cards left out are deleted. All of it is saved, or none of it.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 });

    const { id } = await params;
    const set = isUuid(id) ? await getOwnedSet(user.id, id) : null;
    if (!set) return notFound('Study set');

    const result = validateCards((await readJsonBody(req))?.cards, set.studyType);
    if (!result.ok) {
      return NextResponse.json({ error: result.error, cardIndex: result.cardIndex }, { status: 400 });
    }

    try {
      return NextResponse.json({ cards: await replaceSetCards(user.id, set.id, result.cards) });
    } catch (err) {
      if (err instanceof SetCardsError && err.kind === 'not-found') return notFound('Study set');
      if (err instanceof SetCardsError && err.kind === 'stale') {
        return NextResponse.json(
          { error: 'This set changed since you opened it. Reload the page and try again.', cardIndex: null },
          { status: 409 }
        );
      }
      throw err;
    }
  } catch (err) {
    return errorResponse(err, 'sets/[id]/cards PUT');
  }
}
