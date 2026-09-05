import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

interface SaveItem {
  question: string;
  answer: string;
  options?: string[] | null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, studyType, sourceFilename, items } = body as {
      title: string;
      studyType: 'flashcard' | 'multiple_choice';
      sourceFilename?: string;
      items: SaveItem[];
    };

    if (!title || !studyType || !Array.isArray(items) || items.length === 0) {
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

    const rows = items.map((item, i) => ({
      set_id: newSet.id,
      question: item.question,
      answer: item.answer,
      options: item.options ?? null,
      position: i,
    }));

    const { error: cardsError } = await supabaseAdmin.from('flashcards').insert(rows);
    if (cardsError) {
      return NextResponse.json({ error: cardsError.message }, { status: 500 });
    }

    return NextResponse.json({ id: newSet.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
