import { after, NextRequest, NextResponse } from 'next/server';
import { generateStudyItems, GeminiError } from '@/lib/gemini';
import { isStudyType, parseQuestionCount } from '@/lib/study-types';
import {
  identifyCaller,
  recordGeneration,
  startGeneration,
  type GenerationLog,
  type GenerationState,
} from '@/lib/generation-logs';
import { limitMessage } from '@/lib/generation-limits';

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

// Pure generation endpoint: nothing is saved until the user explicitly saves
// via /api/save-set. The only writes are the usage log (#62) and the daily
// limit check (#63).
export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  const log: GenerationLog = {
    studyType: 'flashcard',
    model: null,
    success: false,
    errorKind: 'server_error',
    durationMs: 0,
    requests: {},
  };
  const state: GenerationState = { caller: null, reservedId: null, refused: false };
  const done = (res: NextResponse, outcome: Pick<GenerationLog, 'success' | 'errorKind'> & { model?: string }) => {
    Object.assign(log, outcome, { durationMs: Date.now() - startedAt });
    return res;
  };
  // Runs once the response has gone out, so logging never slows generation down.
  after(() => recordGeneration(req, state, log));

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const studyTypeRaw = formData.get('studyType');
    const studyType = isStudyType(studyTypeRaw) ? studyTypeRaw : 'flashcard';
    log.studyType = studyType;
    // How many questions (#65): 5 to 30, otherwise the default 10.
    const count = parseQuestionCount(formData.get('count'));

    // Daily limit per role (#63), checked before any AI request.
    state.caller = await identifyCaller(req);
    try {
      const slot = await startGeneration(state.caller, studyType);
      if (!slot.allowed) {
        state.refused = true;
        return done(
          NextResponse.json(
            { error: limitMessage(slot.limit), limit: slot.limit, resetsAt: slot.resetsAt },
            { status: 429 }
          ),
          { success: false, errorKind: 'limit' }
        );
      }
      state.reservedId = slot.id;
    } catch (err) {
      // The limits are about fairness: if checking them fails, generate anyway.
      console.error('[generate] daily limit check failed:', err);
    }

    if (!file) {
      return done(NextResponse.json({ error: 'Missing file' }, { status: 400 }), { success: false, errorKind: 'no_file' });
    }

    let text: string;
    try {
      text = await extractText(file);
    } catch (err) {
      console.error('[generate] text extraction failed:', err);
      return done(
        NextResponse.json(
          { error: "We couldn't read this file. Please try a different PDF or TXT file." },
          { status: 422 }
        ),
        { success: false, errorKind: 'unreadable' }
      );
    }
    if (!text || text.trim().length < 20) {
      return done(
        NextResponse.json({ error: 'Could not extract enough readable text from this file.' }, { status: 422 }),
        { success: false, errorKind: 'unreadable' }
      );
    }

    const { items, model } = await generateStudyItems(text, studyType, {
      count,
      onRequest: (m) => {
        log.requests[m] = (log.requests[m] ?? 0) + 1;
      },
    });

    return done(
      NextResponse.json({
        title: file.name.replace(/\.[^/.]+$/, ''),
        sourceFilename: file.name,
        studyType,
        items,
        // Which model produced this guide (Gemini, or the Gemma backup).
        model,
      }),
      { success: true, errorKind: null, model }
    );
  } catch (err) {
    // Never send raw API errors to the browser; log the details server-side instead.
    console.error('[generate] failed:', err);
    if (err instanceof GeminiError) {
      return done(NextResponse.json({ error: err.userMessage }, { status: err.retryable ? 503 : 502 }), {
        success: false,
        errorKind: err.retryable ? 'ai_busy' : 'ai_failed',
      });
    }
    return done(
      NextResponse.json(
        { error: 'Something went wrong while generating your study guide. Please try again.' },
        { status: 500 }
      ),
      { success: false, errorKind: 'server_error' }
    );
  }
}
