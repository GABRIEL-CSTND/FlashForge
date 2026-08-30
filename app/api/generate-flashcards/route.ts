import { NextRequest, NextResponse } from 'next/server';
import { extractText } from '@/lib/extractText';
import { generateFlashcards } from '@/lib/gemini';
import { supabase } from '@/lib/supabase';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const setId = formData.get('setId') as string | null;

    if (!file || !setId) {
      return NextResponse.json(
        { error: 'Missing file or setId.' },
        { status: 400 }
      );
    }

    const text = await extractText(file);

    if (!text || text.trim().length < 20) {
      return NextResponse.json(
        { error: 'Could not extract enough text from this file.' },
        { status: 422 }
      );
    }

    const cards = await generateFlashcards(text);

    if (cards.length === 0) {
      return NextResponse.json(
        { error: 'AI did not return any flashcards.' },
        { status: 502 }
      );
    }

    const rows = cards.map((card, index) => ({
      set_id: setId,
      question: card.question,
      answer: card.answer,
      position: index,
    }));

    const { error: insertError } = await supabase
      .from('flashcards')
      .insert(rows);

    if (insertError) {
      return NextResponse.json(
        { error: `Failed to save flashcards: ${insertError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ count: rows.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
