'use client';

import { useEffect, useState } from 'react';
import {
  PROGRESS_STEP_IDS,
  pdfSendingLabel,
  progressLabels,
  retryNote,
  stepStatus,
  type PdfReadState,
  type ProgressState,
} from '@/lib/generation-progress';
import type { SourceKind } from '@/lib/sources';

interface Props {
  progress: ProgressState;
  source: SourceKind;
  // A photo is read by the AI itself, so its steps are worded differently.
  photo: boolean;
  // Set while a PDF is read in the browser, and until its text has gone up (#44).
  pdfRead?: PdfReadState | null;
}

// The steps of making a study guide, so a long wait shows movement: what is done,
// what is happening now, what is next, and how long it has been.
export default function GenerationProgress({ progress, source, photo, pdfRead = null }: Props) {
  const labels = progressLabels(source, photo);
  if (pdfRead) labels.sending = pdfSendingLabel(pdfRead);
  const note = retryNote(progress);
  const [seconds, setSeconds] = useState(0);

  // Mounted only while generating, so it counts from the moment the wait began.
  useEffect(() => {
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="paper paper-shadow rounded-md px-5 py-4 space-y-2 text-ink">
      {/* The steps are announced to screen readers; the ticking clock is not. */}
      <div role="status" aria-live="polite" className="space-y-2">
        <ol aria-label="Progress" className="space-y-2">
          {PROGRESS_STEP_IDS.map((id) => {
            const status = stepStatus(progress.step, id);
            return (
              <li
                key={id}
                aria-current={status === 'current' ? 'step' : undefined}
                className={`flex items-center gap-3 text-sm ${status === 'pending' ? 'text-muted' : ''} ${
                  status === 'current' ? 'font-medium text-link' : ''
                }`}
              >
                <span aria-hidden="true" className="flex h-5 w-5 shrink-0 items-center justify-center">
                  {status === 'done' && <span className="text-brass-ink">✓</span>}
                  {status === 'current' && (
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none" />
                  )}
                  {status === 'pending' && <span className="text-muted">○</span>}
                </span>
                <span>
                  {labels[id]}
                  {status === 'done' && <span className="sr-only"> (done)</span>}
                </span>
              </li>
            );
          })}
        </ol>
        {note && <p className="pl-8 text-sm text-muted">{note}</p>}
      </div>
      <p aria-hidden="true" className="pl-8 text-xs text-muted tabular-nums">
        Working for {seconds}s
      </p>
    </div>
  );
}
