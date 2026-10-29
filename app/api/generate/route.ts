import { after, NextRequest, NextResponse } from 'next/server';
import { generateStudyItems, GeminiError, type Attachment } from '@/lib/gemini';
import { isStudyType, parseDifficulty, parseQuestionCount } from '@/lib/study-types';
import {
  FILE_TYPES,
  fileKind,
  fileProblem,
  isPhoto,
  MIN_SOURCE_CHARS,
  pastedTextProblem,
  SCANNED_PDF_TEXT_CHARS,
  titleFromText,
  topicProblem,
} from '@/lib/sources';
import { docxText, pptxText } from '@/lib/office-text';
import { lineUnits, pageUnits, type SourceUnits } from '@/lib/source-quotes';
import { fetchWebPage, WebPageError } from '@/lib/web-page';
import { findTopic, TopicError } from '@/lib/topic';
import {
  identifyCaller,
  recordGeneration,
  startGeneration,
  type GenerationLog,
  type GenerationState,
} from '@/lib/generation-logs';
import { limitMessage } from '@/lib/generation-limits';
import { encodeEvent, PROGRESS_MIME, type ProgressEvent, type StepEvent } from '@/lib/generation-progress';

export const runtime = 'nodejs';
// Model retries are capped at ~75s (see lib/gemini.ts); leave headroom for upload + PDF parsing.
export const maxDuration = 90;

// `units` says how the text splits into PDF pages or text lines, so a card can say
// where its quote is (lib/source-quotes.ts). Word and PowerPoint files have no
// pages or lines to point at, so they get none.
async function extractText(file: File): Promise<{ text: string; units?: SourceUnits }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  switch (fileKind(file.name, file.type)) {
    case 'pdf': {
      const { extractText: extractPdfText, getDocumentProxy } = await import('unpdf');
      const pdf = await getDocumentProxy(bytes);
      const { text: pages } = await extractPdfText(pdf, { mergePages: false });
      return pageUnits(pages);
    }
    // Word and PowerPoint (#71).
    case 'docx':
      return { text: docxText(bytes) };
    case 'pptx':
      return { text: pptxText(bytes) };
    default:
      return lineUnits(Buffer.from(bytes).toString('utf-8'));
  }
}

// Pure generation endpoint: nothing is saved until the user explicitly saves
// via /api/save-set. The only writes are the usage log (#62) and the daily
// limit check (#63). `report` is told each step as it starts (see POST below).
async function generate(req: NextRequest, report: (event: StepEvent) => void = () => {}): Promise<NextResponse> {
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
  // The usage log is written once the response has gone out, so it never slows
  // generation down, and only once the generation itself has finished. With
  // progress on, the response can end first (the student closes the page) while
  // the AI is still working; logging right then would save a failure that
  // doesn't count toward the daily limit (#63), though the AI was used. after()
  // keeps the server running until this has finished.
  let finish!: () => void;
  const finished = new Promise<void>((resolve) => (finish = resolve));
  after(async () => {
    await finished;
    await recordGeneration(req, state, log);
  });

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    // Pasted notes (#70) come instead of a file. Forms send each line break as
    // CR LF; count it as one character, like the upload page does.
    const pastedRaw = formData.get('text');
    const pasted = typeof pastedRaw === 'string' ? pastedRaw.replace(/\r\n?/g, '\n') : null;
    // A link to a web page (#74) or a topic to look up (#79) also come instead of a file.
    const link = formData.get('url');
    const topic = formData.get('topic');
    const studyTypeRaw = formData.get('studyType');
    const studyType = isStudyType(studyTypeRaw) ? studyTypeRaw : 'flashcard';
    log.studyType = studyType;
    // How many questions (#65): 5 to 30, otherwise the default 10.
    const count = parseQuestionCount(formData.get('count'));
    // Easy, medium or hard (#79); anything else is medium.
    const difficulty = parseDifficulty(formData.get('difficulty'));

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

    report({ type: 'step', step: 'reading' });
    let text: string;
    let title: string;
    let sourceFilename: string | null;
    // Photos (#72) go to the AI as they are, with no text taken out first.
    let attachment: Attachment | undefined;
    // Where a link's page or a topic's article came from, to credit it (#79).
    let source: { name: string; url: string } | null = null;
    // A typed topic: what the guide should focus on in its article.
    let focus: string | undefined;
    // Where each page or line of text is, for saying where a card's quote is from.
    let units: SourceUnits | undefined;
    if (pasted !== null) {
      const problem = pastedTextProblem(pasted);
      if (problem) {
        return done(NextResponse.json({ error: problem }, { status: 422 }), { success: false, errorKind: 'unreadable' });
      }
      ({ text, units } = lineUnits(pasted));
      title = titleFromText(pasted);
      sourceFilename = null;
    } else if (typeof link === 'string') {
      // Fetched only after the daily limit check above, with the protections in lib/web-page.ts.
      try {
        const page = await fetchWebPage(link);
        text = page.text;
        title = page.title ? titleFromText(page.title) : new URL(page.url).hostname;
        sourceFilename = page.url;
        source = { name: title, url: page.url };
      } catch (err) {
        if (!(err instanceof WebPageError)) throw err;
        console.error('[generate] web page failed:', err.message);
        return done(NextResponse.json({ error: err.userMessage }, { status: 422 }), { success: false, errorKind: 'unreadable' });
      }
      if (text.trim().length < MIN_SOURCE_CHARS) {
        return done(
          NextResponse.json(
            { error: "We couldn't find enough text on this page. Pages that need signing in can't be read; try pasting the text." },
            { status: 422 }
          ),
          { success: false, errorKind: 'unreadable' }
        );
      }
    } else if (typeof topic === 'string') {
      // Looked up on Wikipedia (lib/topic.ts), only after the daily limit check above.
      const problem = topicProblem(topic);
      if (problem) {
        return done(NextResponse.json({ error: problem }, { status: 422 }), { success: false, errorKind: 'unreadable' });
      }
      try {
        const article = await findTopic(topic.trim());
        text = article.text;
        title = article.title;
        sourceFilename = article.url;
        source = { name: `Wikipedia: ${article.title}`, url: article.url };
        focus = topic.trim();
      } catch (err) {
        if (!(err instanceof TopicError)) throw err;
        console.error('[generate] topic lookup failed:', err.message);
        return done(NextResponse.json({ error: err.userMessage }, { status: 422 }), { success: false, errorKind: 'unreadable' });
      }
    } else {
      if (!file) {
        return done(NextResponse.json({ error: 'Missing file' }, { status: 400 }), { success: false, errorKind: 'no_file' });
      }
      // The upload page checks this too; this covers anything else that calls the API.
      const problem = fileProblem(file.name, file.type, file.size);
      if (problem) {
        return done(NextResponse.json({ error: problem }, { status: 422 }), { success: false, errorKind: 'unreadable' });
      }
      const kind = fileKind(file.name, file.type);
      try {
        if (isPhoto(kind)) {
          attachment = { mimeType: FILE_TYPES[kind].mime, data: Buffer.from(await file.arrayBuffer()).toString('base64') };
          text = '';
        } else {
          ({ text, units } = await extractText(file));
          // A scanned PDF (#73) is pictures of pages with little or no text in
          // it, so the AI reads the PDF itself.
          if (kind === 'pdf' && text.replace(/\s+/g, '').length < SCANNED_PDF_TEXT_CHARS) {
            attachment = { mimeType: FILE_TYPES.pdf.mime, data: Buffer.from(await file.arrayBuffer()).toString('base64') };
            text = '';
            units = undefined;
          }
        }
      } catch (err) {
        console.error('[generate] text extraction failed:', err);
        return done(
          NextResponse.json(
            { error: "We couldn't read this file. Please try a different file, or paste the text." },
            { status: 422 }
          ),
          { success: false, errorKind: 'unreadable' }
        );
      }
      title = file.name.replace(/\.[^/.]+$/, '');
      sourceFilename = file.name;
    }
    if (!attachment && (!text || text.trim().length < MIN_SOURCE_CHARS)) {
      return done(
        NextResponse.json({ error: 'Could not extract enough readable text from this file.' }, { status: 422 }),
        { success: false, errorKind: 'unreadable' }
      );
    }

    report({ type: 'step', step: 'writing' });
    // Every request after the first is a retry or a switch to the next model.
    let attempts = 0;
    let firstModel = '';
    const { items, model } = await generateStudyItems(text, studyType, {
      count,
      attachment,
      difficulty,
      focus,
      units,
      onRequest: (m) => {
        log.requests[m] = (log.requests[m] ?? 0) + 1;
        attempts += 1;
        if (attempts === 1) firstModel = m;
        else report({ type: 'step', step: 'writing', attempt: attempts, backup: m !== firstModel });
      },
    });

    return done(
      NextResponse.json({
        title,
        sourceFilename,
        // Credit for a web page or Wikipedia article; null for files and pasted notes.
        source,
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
    if (err instanceof GeminiError && err.unreadable) {
      return done(NextResponse.json({ error: err.userMessage }, { status: 422 }), {
        success: false,
        errorKind: 'unreadable',
      });
    }
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
  } finally {
    finish();
  }
}

// Normal requests get the plain JSON answer. The upload page also asks for progress
// (Accept: application/x-ndjson): then each step is sent as it starts, followed by one
// "result" event with the status and body the JSON answer would have had.
export async function POST(req: NextRequest) {
  if (!req.headers.get('accept')?.includes(PROGRESS_MIME)) return generate(req);

  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let open = true;
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
    cancel() {
      // The browser went away; keep generating (the usage log still needs the outcome) but stop writing.
      open = false;
    },
  });
  const send = (event: ProgressEvent) => {
    if (!open) return;
    try {
      controller.enqueue(encoder.encode(encodeEvent(event)));
    } catch {
      open = false;
    }
  };

  // generate() runs up to its first await right here, inside the request, which is
  // where after() (the usage log) has to be called.
  generate(req, send)
    .then(async (res) => send({ type: 'result', status: res.status, body: await res.json().catch(() => ({})) }))
    .catch(() =>
      send({
        type: 'result',
        status: 500,
        body: { error: 'Something went wrong while generating your study guide. Please try again.' },
      })
    )
    .finally(() => {
      if (!open) return;
      open = false;
      try {
        controller.close();
      } catch {
        // already closed
      }
    });

  return new Response(stream, {
    headers: {
      'Content-Type': `${PROGRESS_MIME}; charset=utf-8`,
      'Cache-Control': 'no-cache, no-transform',
      // Ask proxies not to hold the steps back until the end.
      'X-Accel-Buffering': 'no',
    },
  });
}
