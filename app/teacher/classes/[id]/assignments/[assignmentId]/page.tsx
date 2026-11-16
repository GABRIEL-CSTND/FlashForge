'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import TeacherOnly from '@/components/TeacherOnly';
import { apiFetch, errorMessage } from '@/lib/api-client';
import { formatDueDate } from '@/lib/due-dates';

interface QuestionStat {
  cardId: string;
  question: string;
  answer: string;
  answered: number;
  wrong: number;
  percentWrong: number | null;
  topWrongChoice: { choice: string; count: number } | null;
}

interface AssignmentQuestions {
  class: { id: string; name: string };
  assignment: { id: string; setTitle: string; studyType: string; dueAt: string | null };
  studentCount: number;
  studentsDone: number;
  questions: QuestionStat[];
}

type LoadState =
  | { status: 'loading' }
  | { status: 'not-found' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: AssignmentQuestions };

const OFFLINE_MESSAGE = 'Could not reach the server. Check your connection and try again.';

async function fetchQuestions(id: string, assignmentId: string): Promise<LoadState> {
  try {
    const res = await apiFetch(`/api/teacher/classes/${id}/assignments/${assignmentId}`);
    if (res.status === 404) return { status: 'not-found' };
    return res.ok
      ? { status: 'ready', data: res.data as unknown as AssignmentQuestions }
      : { status: 'error', message: errorMessage(res.data) };
  } catch {
    return { status: 'error', message: OFFLINE_MESSAGE };
  }
}

const students = (n: number) => `${n} student${n === 1 ? '' : 's'}`;

// One assignment's questions, hardest first (#59), so the teacher knows what to
// reteach.
export default function AssignmentQuestionsPage() {
  const { id, assignmentId } = useParams<{ id: string; assignmentId: string }>();
  return (
    <TeacherOnly>
      <QuestionsView id={id} assignmentId={assignmentId} />
    </TeacherOnly>
  );
}

function QuestionsView({ id, assignmentId }: { id: string; assignmentId: string }) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    fetchQuestions(id, assignmentId).then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [id, assignmentId]);

  if (state.status === 'loading') {
    return (
      <main className="on-desk w-full py-16">
        <p className="desk-wait text-on-desk/85">Loading...</p>
      </main>
    );
  }

  if (state.status === 'not-found' || state.status === 'error') {
    return (
      <main className="on-desk w-full py-10">
        <div className="paper paper-shadow max-w-md rounded-md px-6 py-5 text-[15px] text-ink">
          <p className={state.status === 'error' ? 'text-pencil' : 'text-ink'}>
            {state.status === 'error' ? state.message : 'Assignment not found.'}
          </p>
          <Link href="/teacher" className="mt-2 inline-block font-semibold text-link hover:underline">
            ← All classes
          </Link>
        </div>
      </main>
    );
  }

  const { class: cls, assignment, studentCount, studentsDone, questions } = state.data;
  const flashcards = assignment.studyType === 'flashcard';

  return (
    // An assignment's cards on the desk (desk redesign, phase 6), hardest first.
    <main className="desk-arrive on-desk w-full space-y-6 pb-12">
      <Link
        href={`/teacher/classes/${id}/results`}
        className="inline-flex min-h-11 max-w-full items-center truncate text-sm font-medium text-on-desk/80 hover:text-on-desk"
      >
        ← Grade book
      </Link>

      <div className="space-y-1">
        <h1 className="break-words text-[34px] font-normal leading-tight text-[#f3ecdd]">
          {assignment.setTitle}
          <span aria-hidden="true" className="ml-2 italic text-[#e2c887]">
            · hardest first
          </span>
        </h1>
        <p className="break-words text-[14.5px] text-on-desk/85">
          {cls.name} · {assignment.dueAt ? `Due ${formatDueDate(assignment.dueAt)}` : 'No due date'}
        </p>
      </div>

      <p className="max-w-3xl text-sm text-on-desk/85">
        Hardest questions first, from each student&apos;s latest attempt. {studentsDone} of {students(studentCount)}{' '}
        {studentsDone === 1 ? 'has' : 'have'} finished it.
        {flashcards &&
          ' Flipped flashcards count as wrong unless the student marked “Got it”; typed and matched answers are checked.'}
      </p>

      {studentsDone === 0 ? (
        <div className="paper paper-shadow max-w-md rounded-md px-6 py-5 text-[15px] text-ink">No one has finished this assignment yet.</div>
      ) : (
        <ol aria-label="Questions, hardest first" className="hardest-cards grid gap-x-7 gap-y-8 [grid-template-columns:repeat(auto-fill,minmax(230px,1fr))]">
          {questions.map((q, i) => (
            <li
              key={q.cardId}
              className="paper paper-shadow flex min-h-[158px] flex-col gap-1.5 rounded-[7px] px-3.5 py-3 text-ink"
              style={{ rotate: ['-1deg', '0.8deg', '-0.4deg', '1.2deg'][i % 4] }}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 break-words font-serif text-[19px] leading-[1.2]">{q.question}</p>
                <span
                  className={`shrink-0 pt-1 text-[13px] font-bold ${
                    q.percentWrong === null ? 'text-muted' : q.percentWrong >= 50 ? 'text-pencil' : 'text-ink/75'
                  }`}
                >
                  {q.percentWrong === null ? 'No answers yet' : `${q.percentWrong}% wrong`}
                </span>
              </div>
              <p className="break-words text-[12.5px] leading-snug text-ink/80">
                Answer: <span className="font-semibold">{q.answer}</span>
                {q.answered > 0 && ` · ${q.wrong} of ${students(q.answered)} wrong`}
              </p>
              {q.topWrongChoice && (
                <p className="break-words text-[12.5px] leading-snug text-ink/80">
                  Most common wrong answer: <span className="font-semibold">{q.topWrongChoice.choice}</span> (
                  {students(q.topWrongChoice.count)})
                </p>
              )}
              {q.percentWrong !== null && (
                <div className="mt-auto h-1 overflow-hidden rounded-sm bg-ink/10" aria-hidden="true">
                  <div className="h-full rounded-sm bg-pencil" style={{ width: `${q.percentWrong}%` }} />
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
