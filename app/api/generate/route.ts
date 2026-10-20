import { NextRequest, NextResponse } from 'next/server';
import { generateStudyItems, GeminiError, StudyType } from '@/lib/gemini';

export const runtime = 'nodejs';
// Model retries are capped at ~75s (see lib/gemini.ts); leave headroom for upload + PDF parsing.
export const maxDuration = 90;

async function extractText(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());

  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    const { extractText: extractPdfText, getDocumentProxy } = await import('unpdf');
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractPdfText(pdf, { mergePages: true });
    return text;
  }

  return buffer.toString('utf-8');
}

const VALID_TYPES: StudyType[] = ['flashcard', 'multiple_choice'];

// Pure generation endpoint — no database writes here.
// Nothing is persisted until the user explicitly saves via /api/save-set.
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const studyTypeRaw = formData.get('studyType') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'Missing file' }, { status: 400 });
    }

    const studyType: StudyType = VALID_TYPES.includes(studyTypeRaw as StudyType)
      ? (studyTypeRaw as StudyType)
      : 'flashcard';

    let text: string;
    try {
      text = await extractText(file);
    } catch (err) {
      console.error('[generate] text extraction failed:', err);
      return NextResponse.json(
        { error: "We couldn't read this file. Please try a different PDF or TXT file." },
        { status: 422 }
      );
    }
    if (!text || text.trim().length < 20) {
      return NextResponse.json(
        { error: 'Could not extract enough readable text from this file.' },
        { status: 422 }
      );
    }

    const { items, model } = await generateStudyItems(text, studyType);

    return NextResponse.json({
      title: file.name.replace(/\.[^/.]+$/, ''),
      sourceFilename: file.name,
      studyType,
      items,
      // Which model produced this guide (Gemini, or the Gemma backup).
      model,
    });
  } catch (err) {
    // Never send raw API errors to the browser; log the details server-side instead.
    console.error('[generate] failed:', err);
    if (err instanceof GeminiError) {
      return NextResponse.json({ error: err.userMessage }, { status: err.retryable ? 503 : 502 });
    }
    return NextResponse.json(
      { error: 'Something went wrong while generating your study guide. Please try again.' },
      { status: 500 }
    );
  }
}
