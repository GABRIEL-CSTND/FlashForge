import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { validateCards } from '@/lib/card-rules';
import { isStudyType } from '@/lib/study-types';

interface SaveItem {
  question: string;
  answer: string;
  options?: string[] | null;
  explanation?: string | null;
}

// Save a freshly generated guide (signed-in users only). The cards are checked
// with the same rules as the card editor (lib/card-rules.ts), so only sets the
// study screen can show are saved (#68).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, studyType, sourceFilename, items } = body as {
      title: string;
      studyType: unknown;
      sourceFilename?: string;
      items: SaveItem[];
    };

    if (!title || !isStudyType(studyType) || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    let userId: string | null = null;
    const authHeader = req.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice('Bearer '.length);
      const { data } = await supabaseAdmin.auth.getUser(token);
      userId = data.user?.id ?? null;
    }

    if (!userId) {
      return NextResponse.json(
        { error: 'You must be signed in to save a study guide.' },
        { status: 401 }
      );
    }

    // New cards only: any ids sent along are ignored.
    const checked = validateCards(
      items.map((item) => ({ ...(item && typeof item === 'object' ? item : {}), id: null })),
      studyType
    );
    if (!checked.ok) {
      return NextResponse.json({ error: checked.error }, { status: 400 });
    }

    const { data: newSet, error: setError } = await supabaseAdmin
      .from('flashcard_sets')
      .insert({
        title,
        source_filename: sourceFilename ?? null,
        study_type: studyType,
        user_id: userId,
      })
      .select()
      .single();

    if (setError || !newSet) {
      return NextResponse.json({ error: setError?.message || 'Failed to create set' }, { status: 500 });
    }

    const rows = checked.cards.map((card, i) => ({
      set_id: newSet.id,
      question: card.question,
      answer: card.answer,
      options: card.options,
      explanation: card.explanation,
      position: i,
    }));

    const { error: cardsError } = await supabaseAdmin.from('flashcards').insert(rows);
    if (cardsError) {
      // Don't leave an empty set behind.
      await supabaseAdmin.from('flashcard_sets').delete().eq('id', newSet.id);
      return NextResponse.json({ error: cardsError.message }, { status: 500 });
    }

    return NextResponse.json({ id: newSet.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
