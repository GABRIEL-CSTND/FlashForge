import { NextRequest, NextResponse } from 'next/server';
import { generateStudyItems, StudyType } from '@/lib/gemini';

export const runtime = 'nodejs';

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

    const text = await extractText(file);
    if (!text || text.trim().length < 20) {
      return NextResponse.json(
        { error: 'Could not extract enough readable text from this file.' },
        { status: 422 }
      );
    }

    const items = await generateStudyItems(text, studyType);

    return NextResponse.json({
      title: file.name.replace(/\.[^/.]+$/, ''),
      sourceFilename: file.name,
      studyType,
      items,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
