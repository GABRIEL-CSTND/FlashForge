// Making a study guide with the AI (/api/generate), the way the home page does
// it: checking what it's made from, reading a PDF here in the browser, building
// the request, and reading the steps and the first cards as they arrive.
// The live game's lobby (#26) makes its decks with it; the home page moves onto
// it once its redesign (#108) has settled.

import type { StudyItem } from '@/components/study/logic';
import { generateErrorText } from '@/lib/generation-limits';
import { PROGRESS_MIME, readGeneration, type StepEvent } from '@/lib/generation-progress';
import { planPdfUpload } from '@/lib/prepare-pdf';
import { fileKind, linkFromInput, linkProblem, pastedTextProblem, topicProblem, type SourceKind } from '@/lib/sources';
import { DEFAULT_QUESTION_COUNT, type Difficulty, type StudyType } from '@/lib/study-types';
import { supabase } from '@/lib/supabase';

export interface GeneratedGuide {
  title: string;
  // Null for pasted notes (#70).
  sourceFilename: string | null;
  // Credit for a web page or a topic's Wikipedia article (#79).
  source?: { name: string; url: string } | null;
  studyType: StudyType;
  items: StudyItem[];
  // Its entry in History (/history); null or missing when made signed out.
  historyId?: string | null;
}

export interface GuideSource {
  kind: SourceKind;
  // Pasted notes, a link or a topic, as typed.
  notes: string;
  file: File | null;
}

export interface GuideSettings {
  studyType: StudyType;
  count: number;
  difficulty: Difficulty;
}

export const UNREACHABLE = 'Could not reach the server. Check your connection and try again.';

// Past this point the main AI is probably out of quota and the slower backup
// model is answering, so it can take up to a minute.
export const slowNoticeMs = (count: number) => 15_000 + Math.max(0, count - DEFAULT_QUESTION_COUNT) * 1_000;

// Notes (#70), links (#74) and topics (#79) are checked before anything is
// sent. A file was checked when it was picked.
export function guideSourceProblem(source: GuideSource): string | null {
  switch (source.kind) {
    case 'text':
      return pastedTextProblem(source.notes);
    case 'link':
      return linkProblem(linkFromInput(source.notes));
    case 'topic':
      return topicProblem(source.notes);
    case 'file':
      return source.file ? null : 'Pick a file first.';
  }
}

export type GuideForm = { kind: 'form'; form: FormData } | { kind: 'problem'; message: string };

// The request for /api/generate. A PDF is read here, in the browser, and only
// its text is sent (#44), so a big lecture file can't fail the request-size
// limit; onPdfRead counts its pages.
export async function guideForm(
  source: GuideSource,
  settings: GuideSettings,
  onPdfRead?: (done: number, total: number) => void
): Promise<GuideForm> {
  const problem = guideSourceProblem(source);
  if (problem) return { kind: 'problem', message: problem };
  const { kind, notes, file } = source;
  const form = new FormData();
  if (kind === 'file' && file && fileKind(file.name, file.type) === 'pdf') {
    const plan = await planPdfUpload(file, onPdfRead);
    if (plan.kind === 'problem') return { kind: 'problem', message: plan.message };
    if (plan.kind === 'pages') {
      form.append('pages', JSON.stringify(plan.pages));
      form.append('fileName', file.name);
    } else {
      // Scanned, or not readable here: the server reads the file itself.
      form.append('file', file);
    }
  } else if (kind === 'file') form.append('file', file!);
  else if (kind === 'text') form.append('text', notes);
  else if (kind === 'link') form.append('url', linkFromInput(notes));
  else form.append('topic', notes.trim());
  form.append('studyType', settings.studyType);
  form.append('count', String(settings.count));
  form.append('difficulty', settings.difficulty);
  return { kind: 'form', form };
}

export type GuideOutcome =
  | { ok: true; guide: GeneratedGuide }
  // `partial`: the cards that arrived before it went wrong, if any.
  | { ok: false; message: string; partial: GeneratedGuide | null };

// Sends the request and follows it to the end. `cards` gets the deck so far each
// time the AI sends more of it. Signed in, the session token goes along, so the
// guide lands in History and counts toward that account's daily limit.
export async function requestGuide(
  form: FormData,
  on: { step?: (event: StepEvent) => void; cards?: (guide: GeneratedGuide) => void; signal?: AbortSignal } = {}
): Promise<GuideOutcome> {
  let partial: GeneratedGuide | null = null;
  let outcome: { status: number; body: Record<string, unknown> };
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const res = await fetch('/api/generate', {
      method: 'POST',
      body: form,
      signal: on.signal,
      // Asking for progress: the server then reports each step as it starts.
      headers: { Accept: PROGRESS_MIME, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    outcome = await readGeneration(
      res,
      (step) => on.step?.(step),
      (event) => {
        partial = {
          title: event.title,
          sourceFilename: event.sourceFilename,
          source: event.source,
          studyType: event.studyType as StudyType,
          items: event.items as unknown as StudyItem[],
        };
        on.cards?.(partial);
      }
    );
  } catch {
    return { ok: false, message: UNREACHABLE, partial };
  }
  if (outcome.status < 200 || outcome.status >= 300) {
    return { ok: false, message: generateErrorText(outcome.status, outcome.body), partial };
  }
  return { ok: true, guide: outcome.body as unknown as GeneratedGuide };
}
