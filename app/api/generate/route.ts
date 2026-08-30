import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { generateStudyItems, StudyType } from '@/lib/gemini';
import { extractText } from '@/lib/extractText';

export const runtime = 'nodejs';

const VALID_TYPES: StudyType[] = ['flashcard', 'multiple_choice'];

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const setId = formData.get('setId') as string | null;
    const studyTypeRaw = formData.get('studyType') as string | null;

    if (!file || !setId) {
      return NextResponse.json({ error: 'Missing file or setId' }, { status: 400 });
    }

    const studyType: StudyType = VALID_TYPES.includes(studyTypeRaw as StudyType)
      ? (studyTypeRaw as StudyType)
      : 'flashcard';

    const text = await extractText(file);
    if (!text || text.trim().length < 20) {
      return NextResponse.json(
        { error: 'Could not extract enough readable text from this file.' },
        { status: 422 }
      );
    }

    const items = await generateStudyItems(text, studyType);

    const rows = items.map((item, i) => ({
      set_id: setId,
      question: item.question,
      answer: item.answer,
      options: item.options ?? null,
      position: i,
    }));

    const { error: insertError } = await supabase.from('flashcards').insert(rows);
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ count: rows.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
