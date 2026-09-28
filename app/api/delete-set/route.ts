import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function DELETE(request: NextRequest) {
  try {
    const authorization = request.headers.get('authorization');
    const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];

    if (!token) {
      return NextResponse.json(
        { error: 'You must be signed in to delete a study guide.' },
        { status: 401 }
      );
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !authData.user) {
      return NextResponse.json(
        { error: 'Your session is invalid or expired. Sign in again.' },
        { status: 401 }
      );
    }

    const body: unknown = await request.json().catch(() => null);
    const id =
      body && typeof body === 'object' ? (body as { id?: unknown }).id : undefined;

    if (typeof id !== 'string' || id.length === 0) {
      return NextResponse.json({ error: 'Missing set id.' }, { status: 400 });
    }

    // Ownership check: only the user who saved the set may delete it.
    const { data: existing, error: lookupError } = await supabaseAdmin
      .from('flashcard_sets')
      .select('id')
      .eq('id', id)
      .eq('user_id', authData.user.id)
      .maybeSingle();

    if (lookupError) {
      return NextResponse.json({ error: lookupError.message }, { status: 500 });
    }
    if (!existing) {
      return NextResponse.json({ error: 'Saved set not found.' }, { status: 404 });
    }

    // Delete the cards first so this works whether or not the DB cascades.
    const { error: cardsError } = await supabaseAdmin
      .from('flashcards')
      .delete()
      .eq('set_id', id);
    if (cardsError) {
      return NextResponse.json({ error: cardsError.message }, { status: 500 });
    }

    const { error: setError } = await supabaseAdmin
      .from('flashcard_sets')
      .delete()
      .eq('id', id)
      .eq('user_id', authData.user.id);
    if (setError) {
      return NextResponse.json({ error: setError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete the study guide.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
