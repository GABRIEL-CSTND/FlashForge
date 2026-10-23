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
    return <main className="min-h-screen flex items-center justify-center">Loading...</main>;
  }

  if (state.status === 'not-found' || state.status === 'error') {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
        <p className={state.status === 'error' ? 'text-red-500' : 'text-gray-500'}>
          {state.status === 'error' ? state.message : 'Assignment not found.'}
        </p>
        <Link href="/teacher" className="text-link hover:underline">
          ← All classes
        </Link>
      </main>
    );
  }

  const { class: cls, assignment, studentCount, studentsDone, questions } = state.data;
  const flashcards = assignment.studyType === 'flashcard';

  return (
    // w-full: see the results page; the body is a flex column.
    <main className="min-h-screen w-full p-6 max-w-2xl mx-auto space-y-6">
      <Link
        href={`/teacher/classes/${id}/results`}
        className="inline-block max-w-full truncate align-top text-sm text-gray-500 hover:text-gray-800"
      >
        ← Student results
      </Link>

      <div className="space-y-1">
        <h1 className="break-words text-xl font-semibold">{assignment.setTitle}</h1>
        <p className="break-words text-sm text-gray-500">
          {cls.name} · {assignment.dueAt ? `Due ${formatDueDate(assignment.dueAt)}` : 'No due date'}
        </p>
      </div>

      <p className="text-sm text-gray-500">
        Hardest questions first, from each student&apos;s latest attempt. {studentsDone} of {students(studentCount)}{' '}
        {studentsDone === 1 ? 'has' : 'have'} finished it.
        {flashcards && ' Flashcards count as wrong unless the student marked “Got it”.'}
      </p>

      {studentsDone === 0 ? (
        <div className="rounded-lg border p-6 text-center text-sm text-gray-500">
          No one has finished this assignment yet.
        </div>
      ) : (
        <ol aria-label="Questions, hardest first" className="space-y-3">
          {questions.map((q) => (
            <li key={q.cardId} className="space-y-2 rounded-lg border p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 break-words font-medium">{q.question}</p>
                <span
                  className={`shrink-0 text-sm font-semibold ${
                    q.percentWrong === null ? 'text-gray-400' : q.percentWrong >= 50 ? 'text-red-500' : 'text-gray-500'
                  }`}
                >
                  {q.percentWrong === null ? 'No answers yet' : `${q.percentWrong}% wrong`}
                </span>
              </div>
              {q.percentWrong !== null && (
                <div className="h-1.5 rounded-full bg-gray-500/15" aria-hidden="true">
                  <div className="h-1.5 rounded-full bg-red-500" style={{ width: `${q.percentWrong}%` }} />
                </div>
              )}
              <p className="break-words text-xs text-gray-500">
                Answer: <span className="font-medium">{q.answer}</span>
                {q.answered > 0 && ` · ${q.wrong} of ${students(q.answered)} wrong`}
              </p>
              {q.topWrongChoice && (
                <p className="break-words text-xs text-gray-500">
                  Most picked wrong answer: <span className="font-medium">{q.topWrongChoice.choice}</span> (
                  {students(q.topWrongChoice.count)})
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
