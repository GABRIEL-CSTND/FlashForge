'use client';

import { useState, useRef } from 'react';
import { FILE_ACCEPT, fileKind, MAX_SOURCE_CHARS, type TypedSource } from '@/lib/sources';
import SlipDropdown from '@/components/desk/SlipDropdown';
import type { SlipOption } from '@/components/desk/SlipMenu';
import {
  DIFFICULTIES,
  DIFFICULTY_HINTS,
  DIFFICULTY_LABELS,
  type Difficulty,
  type StudyType,
} from '@/lib/study-types';

export const DECK_WORDS: Record<StudyType, string> = {
  flashcard: 'flashcards',
  multiple_choice: 'multiple-choice questions',
  true_false: 'true-or-false statements',
  mixed: 'mixed-quiz questions',
};

const FILE_KIND_NAMES = {
  pdf: 'PDF',
  docx: 'Word document',
  pptx: 'PowerPoint slides',
  txt: 'Text file',
  jpeg: 'Photo of your notes',
  png: 'Photo of your notes',
  webp: 'Photo of your notes',
} as const;

function fileMeta(file: File): string {
  const kind = fileKind(file.name, file.type);
  const kb = Math.max(1, Math.round(file.size / 1024));
  const size = kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`;
  return `${kind ? FILE_KIND_NAMES[kind] : 'File'} · ${size}`;
}

const MODE_SLIP_OPTIONS: SlipOption<'flashcards' | 'quiz'>[] = [
  {
    value: 'flashcards',
    label: 'Flashcards',
    hint: 'A clue on the front and a short term on the back. Flip, type or match them.',
  },
  {
    value: 'quiz',
    label: 'Quiz',
    hint: 'Practice questions: multiple choice, true or false, or mixed quizzes.',
  },
];

const TEST_TYPE_SLIP_OPTIONS: SlipOption<StudyType>[] = [
  {
    value: 'multiple_choice',
    label: 'Multiple choice',
    hint: 'Pick the right answer out of 4.',
  },
  {
    value: 'true_false',
    label: 'True or false',
    hint: 'Decide whether each statement is true or false, and see the correction.',
  },
  {
    value: 'mixed',
    label: 'Mixed quiz',
    hint: 'Like a school exam: Part I multiple choice, Part II true or false, Part III identification.',
  },
];

const COUNT_SLIP_OPTIONS: SlipOption<number>[] = [
  { value: 5, label: '5' },
  { value: 10, label: '10' },
  { value: 15, label: '15' },
  { value: 20, label: '20' },
  { value: 30, label: '30' },
];

const DIFFICULTY_SLIP_OPTIONS: SlipOption<Difficulty>[] = [
  {
    value: 'easy',
    label: 'Easy',
    hint: 'The main terms and ideas, with clear clues.',
  },
  {
    value: 'medium',
    label: 'Medium',
    hint: 'A mix of main ideas and details.',
  },
  {
    value: 'hard',
    label: 'Hard',
    hint: 'Specific details and how ideas connect, with tricky choices.',
  },
];

const QUIZ_TYPE_DISPLAY: Record<StudyType, string> = {
  flashcard: 'Flashcards',
  multiple_choice: 'Multiple Choice',
  true_false: 'True or False',
  mixed: 'Mixed Quiz',
};

export default function DeckMaker({
  file,
  onFile,
  onRemoveFile,
  notes,
  onNotes,
  asNotes,
  onAsNotes,
  detected,
  sourceLine,
  difficulty,
  onDifficulty,
  studyType,
  onStudyType,
  count,
  onCount,
  canMake,
  making,
  onMake,
  waitNote,
  error,
}: {
  file: File | null;
  onFile: (file: File) => void;
  onRemoveFile: () => void;
  notes: string;
  onNotes: (notes: string) => void;
  asNotes: boolean;
  onAsNotes: (asNotes: boolean) => void;
  detected: TypedSource | null;
  sourceLine: string;
  difficulty: Difficulty;
  onDifficulty: (difficulty: Difficulty) => void;
  studyType: StudyType;
  onStudyType: (studyType: StudyType) => void;
  count: number;
  onCount: (count: number) => void;
  canMake: boolean;
  making: boolean;
  onMake: () => void;
  waitNote: string;
  error: string;
}) {
  const [dragging, setDragging] = useState(false);
  const [showNotesInput, setShowNotesInput] = useState(Boolean(notes));
  const [lastQuizType, setLastQuizType] = useState<StudyType>(
    studyType === 'flashcard' ? 'multiple_choice' : studyType
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isQuiz = studyType !== 'flashcard';
  const currentQuizType = isQuiz ? studyType : lastQuizType;

  const handleModeChange = (mode: 'flashcards' | 'quiz') => {
    if (mode === 'flashcards') {
      onStudyType('flashcard');
    } else {
      onStudyType(lastQuizType);
    }
  };

  const handleQuizTypeChange = (newType: StudyType) => {
    setLastQuizType(newType);
    onStudyType(newType);
  };

  const kind = asNotes ? 'text' : detected;
  const over = notes.length > MAX_SOURCE_CHARS;

  const sentence =
    kind === 'link'
      ? 'Looks like a link. We’ll read the page.'
      : kind === 'topic'
        ? 'Looks like a topic. We’ll look it up on Wikipedia.'
        : asNotes
          ? 'Using it as notes'
          : 'Looks like notes';

  return (
    <section
      aria-label="Make a study deck"
      className="paper paper-shadow relative w-full rounded-2xl border border-[#e5dcce] bg-[#fbf8f0] p-6 text-ink sm:p-8 md:p-10"
    >
      {/* Header */}
      <div>
        <h1 className="font-serif text-[24px] font-bold leading-tight tracking-tight text-[#1e1915] sm:text-[28px]">
          Upload Material to Build Study Deck
        </h1>
        <p className="mt-1 text-sm text-[#6c6256] sm:text-[14px]">
          Drop lecture notes, chapter PDFs, or TXT files to automatically extract terms, definitions, and practice sets.
        </p>
      </div>

      {/* Dashed Dropzone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!making) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const dropped = e.dataTransfer.files?.[0];
          if (dropped && !making) onFile(dropped);
        }}
        className={`mt-5 rounded-2xl border-2 border-dashed transition-colors ${
          dragging
            ? 'border-[#b08b46] bg-[#f5ecdc]'
            : 'border-[#cdbeaa] bg-[#f8f3e8]/50 hover:bg-[#f8f3e8]/80'
        } px-6 py-8 text-center sm:py-9`}
      >
        <span className="sr-only">PDF, Word, PowerPoint, TXT or a photo</span>
        <input
          ref={fileInputRef}
          id="file-input"
          type="file"
          accept={FILE_ACCEPT}
          disabled={making}
          onChange={(e) => {
            const chosen = e.target.files?.[0];
            if (chosen) onFile(chosen);
            e.target.value = '';
          }}
          className="sr-only"
        />

        {file ? (
          <div className="flex flex-col items-center">
            {/* Selected File Card */}
            <div className="flex w-full max-w-md items-center justify-between gap-4 rounded-xl border border-[#d6c7b5] bg-white/80 px-4 py-3 shadow-sm">
              <div className="flex items-center gap-3 overflow-hidden text-left">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#faf5eb] text-brass-ink">
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[#1e1915]">{file.name}</p>
                  <p className="text-xs text-[#786f63]">{fileMeta(file)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={making}
                  className="rounded px-2 py-1 text-xs font-medium text-brass-ink hover:underline cursor-pointer"
                >
                  Change
                </button>
                <button
                  type="button"
                  onClick={onRemoveFile}
                  disabled={making}
                  aria-label="Take the file off the sheet"
                  className="rounded p-1 text-[#8b8275] hover:text-[#1e1915] cursor-pointer"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    aria-hidden="true"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>
            <p className="mt-2 text-xs text-[#786f63]">File ready to parse into cards &amp; quizzes.</p>
          </div>
        ) : (
          <div className="flex flex-col items-center">
            {/* Open Book Icon */}
            <div className="text-[#b08b46]">
              <svg
                width="34"
                height="34"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
              </svg>
            </div>

            <p className="mt-2.5 text-[15px] font-bold text-[#1f1a15] sm:text-base">
              Drag &amp; drop PDF, DOCX, or TXT notes here
            </p>
            <p className="mt-0.5 text-xs text-[#7a7165] sm:text-[12.5px]">
              Up to 10MB · auto-parsed into cards &amp; quizzes
            </p>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={making}
              className="mt-3.5 inline-flex items-center justify-center rounded-lg border border-[#d6c7b5] bg-[#fbf9f4] px-5 py-1.5 text-sm font-semibold text-[#1e1915] shadow-sm hover:bg-white active:scale-[0.98] transition cursor-pointer"
            >
              Browse files
            </button>

            {!showNotesInput && !notes && (
              <button
                type="button"
                onClick={() => setShowNotesInput(true)}
                className="mt-3 text-xs font-medium text-brass-ink hover:underline cursor-pointer"
              >
                Or type / paste notes, a link, or a topic
              </button>
            )}
          </div>
        )}

        {/* Text / Notes Input Area */}
        <div className={`mt-4 border-t border-[#d6c7b5]/60 pt-4 text-left ${showNotesInput || notes ? 'block' : 'hidden'}`}>
          <div className="flex items-center justify-between">
            <label htmlFor="notes-sheet" className="text-xs font-semibold uppercase tracking-wider text-brass-ink">
              Your notes, a link or a topic
            </label>
            <button
              type="button"
              onClick={() => {
                setShowNotesInput(false);
                onNotes('');
              }}
              className="text-xs text-muted hover:text-ink cursor-pointer"
            >
              Close
            </button>
          </div>
          <textarea
            id="notes-sheet"
            aria-label="Your notes, a link or a topic"
            rows={3}
            value={notes}
            onChange={(e) => onNotes(e.target.value)}
            placeholder="Drop your notes here, or type or paste notes, a link or a topic..."
            disabled={making}
            className="mt-1.5 w-full rounded-lg border border-[#d6c7b5] bg-white/70 p-3 text-sm text-ink outline-none focus:border-brass-ink focus:ring-1 focus:ring-brass-ink"
          />
          {notes.trim() && (
            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
              <span>
                <span aria-live="polite">{sentence}</span>
                {kind === 'text' && (
                  <>
                    {' · '}
                    <span className={over ? 'font-semibold text-pencil' : ''}>
                      {notes.length.toLocaleString('en-US')} / {MAX_SOURCE_CHARS.toLocaleString('en-US')} characters
                    </span>
                  </>
                )}
              </span>
              {(asNotes ? detected !== 'text' : kind !== 'text') && (
                <button
                  type="button"
                  onClick={() => onAsNotes(!asNotes)}
                  disabled={making}
                  className="font-semibold text-brass-ink underline hover:opacity-80 cursor-pointer"
                >
                  {!asNotes ? 'Use it as notes' : detected === 'link' ? 'Read it as a link' : 'Look it up as a topic'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Controls Row */}
      <div className="mt-6 flex flex-wrap items-start gap-x-6 gap-y-4">
        {/* MODE */}
        <div>
          <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-[#736a5e]">
            MODE
          </span>
          <SlipDropdown
            name="Mode"
            label={isQuiz ? 'Quiz' : 'Flashcards'}
            options={MODE_SLIP_OPTIONS}
            value={isQuiz ? 'quiz' : 'flashcards'}
            onChange={handleModeChange}
            disabled={making}
            minWidth="min-w-[130px]"
            menuWidth="w-72"
          />
        </div>

        {/* TEST TYPE - only shown in Quiz mode */}
        {isQuiz && (
          <div>
            <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-[#736a5e]">
              TEST TYPE
            </span>
            <SlipDropdown
              name="Test type"
              label={QUIZ_TYPE_DISPLAY[currentQuizType] ?? 'Multiple Choice'}
              options={TEST_TYPE_SLIP_OPTIONS}
              value={currentQuizType}
              onChange={handleQuizTypeChange}
              disabled={making}
              minWidth="min-w-[155px]"
              menuWidth="w-72"
            />
          </div>
        )}

        {/* QUESTIONS / FLASHCARDS COUNT */}
        <div>
          <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-[#736a5e]">
            {isQuiz ? 'QUESTIONS' : 'FLASHCARDS'}
          </span>
          <SlipDropdown
            name={isQuiz ? 'Questions' : 'Flashcards'}
            label={String(count)}
            options={COUNT_SLIP_OPTIONS}
            value={count}
            onChange={onCount}
            disabled={making}
            minWidth="min-w-[85px]"
            menuWidth="w-40"
          />
        </div>

        {/* DIFFICULTY */}
        <div>
          <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-[#736a5e]">
            DIFFICULTY
          </span>
          <SlipDropdown
            name="Difficulty"
            label={DIFFICULTY_LABELS[difficulty]}
            options={DIFFICULTY_SLIP_OPTIONS}
            value={difficulty}
            onChange={onDifficulty}
            disabled={making}
            minWidth="min-w-[125px]"
            menuWidth="w-72"
          />
          <p className="mt-1 text-[11.5px] text-[#736a5e] max-w-[240px]">
            {DIFFICULTY_HINTS[difficulty]}
          </p>
        </div>
      </div>

      {/* Source summary note */}
      {sourceLine && (
        <p className="mt-3 text-xs sm:text-[13px] text-[#7a7165]">
          {sourceLine}
        </p>
      )}

      {/* Error / Feedback alerts */}
      {error && (
        <p role="alert" className="mt-3 text-sm font-medium text-pencil">
          {error}
        </p>
      )}

      {/* Action Button */}
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={onMake}
          disabled={!canMake || making}
          aria-label={making ? 'Generating Study Deck' : 'Generate Study Deck'}
          className="inline-flex items-center justify-center rounded-xl border border-[#b88c3e] bg-[#cca152] px-6 py-2.5 sm:py-3 text-[15px] font-bold text-[#261a0e] shadow-[0_4px_0_#9a7231,0_6px_10px_rgba(0,0,0,0.12)] hover:bg-[#bf9442] hover:shadow-[0_3px_0_#9a7231,0_4px_6px_rgba(0,0,0,0.12)] hover:translate-y-[1px] active:translate-y-[4px] active:shadow-none disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none disabled:translate-y-0 transition-all cursor-pointer"
        >
          {making ? 'Generating Study Deck…' : 'Generate Study Deck'}
        </button>

        {making && <span className="text-sm text-muted">{waitNote}</span>}
      </div>
    </section>
  );
}
