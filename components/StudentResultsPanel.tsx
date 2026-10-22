'use client';

import { useEffect, useState } from 'react';
import { apiFetch, errorMessage } from '@/lib/api-client';
import { studentLabel } from '@/lib/classes-shared';
import { formatDueDate } from '@/lib/due-dates';
import { percent, STATUS_LABELS, type ResultStatus, type ResultSummary } from '@/lib/results-shared';

export interface ResultsStudent {
  studentId: string;
  displayName: string | null;
  email: string | null;
  joinedAt: string;
}

interface AssignmentAttempts {
  id: string;
  setTitle: string;
  dueAt: string | null;
  result: ResultSummary;
  // Newest first.
  attempts: { id: string; score: number; total: number; completedAt: string; late: boolean }[];
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; assignments: AssignmentAttempts[] };

const STATUS_CLASSES: Record<ResultStatus, string> = {
  done: 'bg-green-500/10 text-green-600',
  late: 'bg-amber-500/10 text-amber-600',
  'not-started': 'bg-gray-500/10 text-gray-500',
};

// One student's attempts on the class's assignments (#58), opened from the
// results table.
export default function StudentResultsPanel({
  classId,
  student,
  onClose,
}: {
  classId: string;
  student: ResultsStudent;
  onClose: () => void;
}) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    apiFetch(`/api/teacher/classes/${classId}/students/${student.studentId}`)
      .then((res) => {
        if (cancelled) return;
        setState(
          res.ok
            ? { status: 'ready', assignments: res.data.assignments as AssignmentAttempts[] }
            : { status: 'error', message: errorMessage(res.data) }
        );
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error', message: 'Could not reach the server. Check your connection and try again.' });
      });
    return () => {
      cancelled = true;
    };
  }, [classId, student.studentId]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="student-results-title"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-6"
    >
      <div className="w-full max-w-md space-y-4 rounded-xl border bg-background p-6 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <h2 id="student-results-title" className="truncate text-lg font-semibold">
              {studentLabel(student)}
            </h2>
            <p className="truncate text-sm text-gray-500">
              {student.displayName && student.email ? `${student.email} · ` : ''}
              Joined {new Date(student.joinedAt).toLocaleDateString()}
            </p>
          </div>
          <button
            type="button"
            autoFocus
            onClick={onClose}
            className="shrink-0 rounded-lg border px-3 py-1.5 text-sm font-medium"
          >
            Close
          </button>
        </div>

        {state.status === 'loading' && <p className="text-sm text-gray-500">Loading attempts...</p>}

        {state.status === 'error' && (
          <p role="alert" className="text-sm text-red-500">
            {state.message}
          </p>
        )}

        {state.status === 'ready' && state.assignments.length === 0 && (
          <p className="text-sm text-gray-500">Nothing is assigned to this class yet.</p>
        )}

        {state.status === 'ready' && state.assignments.length > 0 && (
          <ul className="space-y-4">
            {state.assignments.map((a) => (
              <li key={a.id} className="space-y-1.5">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="min-w-0 break-words font-medium">{a.setTitle}</h3>
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-medium ${STATUS_CLASSES[a.result.status]}`}>
                    {STATUS_LABELS[a.result.status]}
                  </span>
                </div>
                <p className="text-xs text-gray-400">
                  {a.dueAt ? `Due ${formatDueDate(a.dueAt)}` : 'No due date'}
                  {a.result.best && ` · best ${a.result.best.score}/${a.result.best.total}`}
                </p>
                {a.attempts.length > 0 && (
                  <ol aria-label={`Attempts on ${a.setTitle}`} className="divide-y rounded-lg border text-sm">
                    {a.attempts.map((t) => (
                      <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2">
                        {/* Same format as the due date above, so late finishes are easy to spot. */}
                        <span className="text-gray-500">{formatDueDate(t.completedAt)}</span>
                        <span className="flex shrink-0 items-center gap-2">
                          {t.late && (
                            <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-xs font-medium text-amber-600">
                              Late
                            </span>
                          )}
                          <span className="font-medium">
                            {t.score}/{t.total}
                          </span>
                          <span className="w-10 text-right text-gray-400">{percent(t)}%</span>
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
