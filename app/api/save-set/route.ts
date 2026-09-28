import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

type StudyType = 'flashcard' | 'multiple_choice';

interface SaveItem {
  question: string;
  answer: string;
  options?: string[] | null;
}

interface SaveRequest {
  title: string;
  sourceFilename?: string;
  studyType: StudyType;
  items: SaveItem[];
}

function isSaveRequest(value: unknown): value is SaveRequest {
  if (!value || typeof value !== 'object') return false;

  const body = value as Partial<SaveRequest>;
  return (
    typeof body.title === 'string' &&
    body.title.trim().length > 0 &&
    body.title.length <= 200 &&
    (body.sourceFilename === undefined ||
      (typeof body.sourceFilename === 'string' && body.sourceFilename.length <= 255)) &&
    (body.studyType === 'flashcard' || body.studyType === 'multiple_choice') &&
    Array.isArray(body.items) &&
    body.items.length > 0 &&
    body.items.length <= 100 &&
    body.items.every(
      (item) =>
        item &&
        typeof item.question === 'string' &&
        item.question.trim().length > 0 &&
        typeof item.answer === 'string' &&
        item.answer.trim().length > 0 &&
        (item.options === undefined ||
          item.options === null ||
          (Array.isArray(item.options) && item.options.every((option) => typeof option === 'string')))
    )
  );
}

export async function POST(request: NextRequest) {
  try {
    const authorization = request.headers.get('authorization');
    const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];

    if (!token) {
      return NextResponse.json(
        { error: 'You must be signed in to save a study guide.' },
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

    const body: unknown = await request.json();
    if (!isSaveRequest(body)) {
      return NextResponse.json({ error: 'Invalid study guide data.' }, { status: 400 });
    }

    const { data: newSet, error: setError } = await supabaseAdmin
      .from('flashcard_sets')
      .insert({
        title: body.title.trim(),
        source_filename: body.sourceFilename?.trim() || null,
        study_type: body.studyType,
        user_id: authData.user.id,
      })
      .select('id')
      .single();

    if (setError || !newSet) {
      return NextResponse.json(
        { error: setError?.message || 'Failed to save the study guide.' },
        { status: 500 }
      );
    }

    const cards = body.items.map((item, position) => ({
      set_id: newSet.id,
      question: item.question.trim(),
      answer: item.answer.trim(),
      options: item.options ?? null,
      position,
    }));

    const { error: cardsError } = await supabaseAdmin.from('flashcards').insert(cards);
    if (cardsError) {
      await supabaseAdmin.from('flashcard_sets').delete().eq('id', newSet.id);
      return NextResponse.json({ error: cardsError.message }, { status: 500 });
    }

    return NextResponse.json({ id: newSet.id }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save the study guide.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
