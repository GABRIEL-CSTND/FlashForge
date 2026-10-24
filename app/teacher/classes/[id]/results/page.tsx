'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import TeacherOnly from '@/components/TeacherOnly';
import StudentResultsPanel, { type ResultsStudent } from '@/components/StudentResultsPanel';
import { apiFetch, errorMessage } from '@/lib/api-client';
import { studentLabel } from '@/lib/classes-shared';
import { formatDueDate, isOverdue } from '@/lib/due-dates';
import { percent, resultsCsvFilename, resultsToCsv, type ResultSummary } from '@/lib/results-shared';

interface StudentRow extends ResultsStudent {
  // By assignment id.
  results: Record<string, ResultSummary>;
}

interface AssignmentColumn {
  id: string;
  setId: string;
  setTitle: string;
  studyType: string;
  dueAt: string | null;
  average: number | null;
  doneCount: number;
}

interface ClassResults {
  class: { id: string; name: string };
  assignments: AssignmentColumn[];
  students: StudentRow[];
}

type LoadState =
  | { status: 'loading' }
  | { status: 'not-found' }
  | { status: 'error'; message: string }
  | { status: 'ready'; results: ClassResults };

const OFFLINE_MESSAGE = 'Could not reach the server. Check your connection and try again.';

async function fetchResults(id: string): Promise<LoadState> {
  try {
    const res = await apiFetch(`/api/teacher/classes/${id}/results`);
    if (res.status === 404) return { status: 'not-found' };
    return res.ok
      ? { status: 'ready', results: res.data as unknown as ClassResults }
      : { status: 'error', message: errorMessage(res.data) };
  } catch {
    return { status: 'error', message: OFFLINE_MESSAGE };
  }
}

// One class's results (#58): each student's best score, attempts and done /
// late / not started on every assignment, class averages, and a CSV download.
export default function ClassResultsPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <TeacherOnly>
      <ResultsView id={id} />
    </TeacherOnly>
  );
}

function ResultsView({ id }: { id: string }) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [selected, setSelected] = useState<StudentRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchResults(id).then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (state.status === 'loading') {
    return <main className="min-h-screen flex items-center justify-center">Loading...</main>;
  }

  if (state.status === 'not-found' || state.status === 'error') {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
        <p className={state.status === 'error' ? 'text-red-500' : 'text-gray-500'}>
          {state.status === 'error' ? state.message : 'Class not found.'}
        </p>
        <Link href="/teacher" className="text-link hover:underline">
          ← All classes
        </Link>
      </main>
    );
  }

  const { results } = state;
  const { assignments, students } = results;

  // A data: link needs no server round trip, and the file is small.
  const downloadCsv = () => {
    const link = document.createElement('a');
    link.href = `data:text/csv;charset=utf-8,${encodeURIComponent(resultsToCsv(results))}`;
    link.download = resultsCsvFilename(results.class.name);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    // w-full: the body is a flex column, so without it a wide table would stretch
    // the page instead of scrolling inside its box.
    <main className="min-h-screen w-full p-6 max-w-5xl mx-auto space-y-6">
      <Link
        href={`/teacher/classes/${id}`}
        className="inline-block max-w-full truncate align-top text-sm text-gray-500 hover:text-gray-800"
      >
        ← {results.class.name}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold">Student results</h1>
          <p className="break-words text-sm text-gray-500">{results.class.name}</p>
        </div>
        {assignments.length > 0 && students.length > 0 && (
          <button
            type="button"
            onClick={downloadCsv}
            className="btn btn-secondary"
          >
            Download CSV
          </button>
        )}
      </div>

      {assignments.length === 0 ? (
        <div className="rounded-lg border p-6 text-center text-sm text-gray-500">
          Nothing assigned yet. To assign a set, open it from{' '}
          <Link href="/my-sets" className="text-link hover:underline">
            My Sets
          </Link>{' '}
          and choose <span className="font-medium">📌 Assign to class</span>.
        </div>
      ) : students.length === 0 ? (
        <div className="rounded-lg border p-6 text-center text-sm text-gray-500">
          No students yet. Share the join code from the{' '}
          <Link href={`/teacher/classes/${id}`} className="text-link hover:underline">
            class page
          </Link>
          .
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border">
            {/* Borders sit on the cells: the sticky column's background would hide row borders. */}
            <table className="w-full border-separate border-spacing-0 text-sm">
              <caption className="sr-only">Each student&apos;s best score on each assignment in {results.class.name}</caption>
              <thead>
                <tr>
                  <th scope="col" className="sticky left-0 z-10 border-b border-r bg-background px-3 py-2 text-left align-bottom font-medium">
                    Student
                  </th>
                  {assignments.map((a) => (
                    <th key={a.id} scope="col" className="min-w-36 border-b px-3 py-2 text-left align-bottom font-medium">
                      <Link
                        href={`/teacher/classes/${id}/assignments/${a.id}`}
                        title={`Hardest questions in ${a.setTitle}`}
                        className="block max-w-48 truncate text-link hover:underline"
                      >
                        {a.setTitle}
                      </Link>
                      <span className="block text-xs font-normal text-gray-400">
                        {a.dueAt ? `Due ${formatDueDate(a.dueAt)}` : 'No due date'}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.studentId}>
                    <th scope="row" className="sticky left-0 z-10 border-b border-r bg-background px-3 py-2 text-left align-top font-normal">
                      <button
                        type="button"
                        onClick={() => setSelected(s)}
                        className="block max-w-32 sm:max-w-48 truncate text-left font-medium text-link hover:underline"
                      >
                        {studentLabel(s)}
                      </button>
                      {s.displayName && s.email && (
                        <span className="block max-w-32 sm:max-w-48 truncate text-xs text-gray-400">{s.email}</span>
                      )}
                    </th>
                    {assignments.map((a) => (
                      <td key={a.id} className="border-b px-3 py-2 align-top">
                        <ResultCell result={s.results[a.id]} overdue={isOverdue(a.dueAt)} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row" className="sticky left-0 z-10 border-r bg-background px-3 py-2 text-left align-top font-medium">
                    Class average
                  </th>
                  {assignments.map((a) => (
                    <td key={a.id} className="px-3 py-2 align-top">
                      <span className="block font-medium">{a.average === null ? '—' : `${a.average}%`}</span>
                      <span className="block text-xs text-gray-400">
                        {a.doneCount} of {students.length} done
                      </span>
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="text-xs text-gray-400">
            Each cell shows the student&apos;s best score. <span className="font-medium">Late</span> means they first
            finished after the due date. Students who haven&apos;t started aren&apos;t counted in the average.
            Flashcard scores are marked by the students themselves when they flip the cards, and checked when they
            type the answers. Select a student to see every attempt and how it was made, or an assignment to see its
            hardest questions.
          </p>
        </>
      )}

      {selected && (
        <StudentResultsPanel
          key={selected.studentId}
          classId={id}
          student={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </main>
  );
}

// "Not started" is never shown as 0%; it turns red once the due date passes.
function ResultCell({ result, overdue }: { result: ResultSummary | undefined; overdue: boolean }) {
  if (!result?.best) {
    return (
      <span className={overdue ? 'text-red-500' : 'text-gray-400'}>
        Not started
        {overdue && <span className="block text-xs">Past due</span>}
      </span>
    );
  }
  const latest = result.latest;
  return (
    <span
      className="block"
      title={latest ? `Latest: ${latest.score}/${latest.total} on ${new Date(latest.completedAt).toLocaleString()}` : undefined}
    >
      <span className="font-medium">
        {result.best.score}/{result.best.total}
      </span>
      <span className="text-gray-400"> · {percent(result.best)}%</span>
      <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-gray-400">
        {result.attemptCount} {result.attemptCount === 1 ? 'attempt' : 'attempts'}
        {result.status === 'late' && (
          <span className="rounded bg-amber-500/10 px-1.5 py-0.5 font-medium text-amber-600">Late</span>
        )}
      </span>
    </span>
  );
}
