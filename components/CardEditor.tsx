'use client';

import { useId, useMemo, useState } from 'react';
import { CARD_LIMITS, normalizeChoice, validateCards, type StudyType } from '@/lib/card-rules';

export interface EditableCard {
  id: string;
  question: string;
  answer: string;
  options: string[] | null;
}

// What PUT /api/sets/[id]/cards expects, in the order the cards should appear.
export interface CardPayload {
  id?: string;
  question: string;
  answer: string;
  options?: string[];
}

export type SaveResult = { ok: true } | { ok: false; error: string; cardIndex: number | null };

interface CardEditorProps {
  studyType: StudyType;
  cards: EditableCard[];
  onSave: (cards: CardPayload[]) => Promise<SaveResult>;
  onCancel: () => void;
}

interface DraftCard {
  key: string;
  id: string | null;
  question: string;
  answer: string;
  choices: string[];
  correctIndex: number | null;
}

// React list keys only (never rendered into the page). DOM ids use useId()
// plus the card's position, so server and client HTML match.
let keyCounter = 0;
const newKey = () => `card-${++keyCounter}`;

function toDraft(card: EditableCard, studyType: StudyType): DraftCard {
  const choices =
    studyType === 'multiple_choice'
      ? [...(card.options ?? []), '', '', '', ''].slice(0, CARD_LIMITS.choices)
      : [];
  const correct = choices.findIndex((c) => c && normalizeChoice(c) === normalizeChoice(card.answer));
  return {
    key: newKey(),
    id: card.id,
    question: card.question,
    answer: card.answer,
    choices,
    correctIndex: correct === -1 ? null : correct,
  };
}

function emptyDraft(studyType: StudyType): DraftCard {
  return {
    key: newKey(),
    id: null,
    question: '',
    answer: '',
    choices: studyType === 'multiple_choice' ? Array(CARD_LIMITS.choices).fill('') : [],
    correctIndex: null,
  };
}

function toPayload(draft: DraftCard, studyType: StudyType): CardPayload {
  const base = draft.id ? { id: draft.id } : {};
  if (studyType === 'flashcard') return { ...base, question: draft.question, answer: draft.answer };
  return {
    ...base,
    question: draft.question,
    options: draft.choices,
    answer: draft.correctIndex === null ? '' : draft.choices[draft.correctIndex],
  };
}

// Edit mode for a study set (#55): change, add, delete and reorder cards, then
// save them all at once. Uses the same rules as the server (lib/card-rules.ts).
export default function CardEditor({ studyType, cards, onSave, onCancel }: CardEditorProps) {
  const initial = useMemo(() => cards.map((c) => toDraft(c, studyType)), [cards, studyType]);
  const [drafts, setDrafts] = useState<DraftCard[]>(initial);
  const [error, setError] = useState<{ message: string; cardIndex: number | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const idBase = useId();

  const isMultipleChoice = studyType === 'multiple_choice';
  const payload = drafts.map((d) => toPayload(d, studyType));
  const dirty = JSON.stringify(payload) !== JSON.stringify(initial.map((d) => toPayload(d, studyType)));

  const update = (key: string, patch: Partial<DraftCard>) =>
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));

  const move = (index: number, by: -1 | 1) =>
    setDrafts((prev) => {
      const next = [...prev];
      [next[index], next[index + by]] = [next[index + by], next[index]];
      return next;
    });

  const remove = (key: string) => setDrafts((prev) => prev.filter((d) => d.key !== key));

  const add = () => setDrafts((prev) => [...prev, emptyDraft(studyType)]);

  const handleSave = async () => {
    const checked = validateCards(payload, studyType);
    if (!checked.ok) {
      setError({ message: checked.error, cardIndex: checked.cardIndex });
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await onSave(payload);
      if (!result.ok) setError({ message: result.error, cardIndex: result.cardIndex });
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (dirty && !window.confirm('Discard your changes to these cards?')) return;
    onCancel();
  };

  return (
    <main className="min-h-screen p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Edit cards</h1>
        <p className="text-sm text-gray-500">
          {drafts.length} card{drafts.length === 1 ? '' : 's'}
        </p>
      </div>

      <ol className="space-y-4">
        {drafts.map((d, i) => {
          const label = `Card ${i + 1}`;
          const cardError = error && error.cardIndex === i ? error.message : null;
          return (
            <li
              key={d.key}
              aria-label={label}
              className={`space-y-3 rounded-xl border p-4 ${cardError ? 'border-red-500' : ''}`}
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-medium">{label}</h2>
                <div className="flex items-center gap-1 text-sm">
                  <button
                    type="button"
                    onClick={() => move(i, -1)}
                    disabled={i === 0 || saving}
                    aria-label={`Move ${label} up`}
                    className="rounded px-2 py-1 hover:bg-gray-500/10 disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    disabled={i === drafts.length - 1 || saving}
                    aria-label={`Move ${label} down`}
                    className="rounded px-2 py-1 hover:bg-gray-500/10 disabled:opacity-30"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(d.key)}
                    disabled={drafts.length === 1 || saving}
                    aria-label={`Delete ${label}`}
                    title={drafts.length === 1 ? 'A set needs at least one card' : undefined}
                    className="rounded px-2 py-1 text-red-500 hover:bg-red-500/10 disabled:opacity-30"
                  >
                    Delete
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label htmlFor={`${idBase}-${i}-question`} className="text-xs uppercase tracking-wide text-gray-400">
                  Question
                </label>
                <textarea
                  id={`${idBase}-${i}-question`}
                  value={d.question}
                  onChange={(e) => update(d.key, { question: e.target.value })}
                  maxLength={CARD_LIMITS.question}
                  rows={2}
                  disabled={saving}
                  className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm"
                />
              </div>

              {isMultipleChoice ? (
                <fieldset className="space-y-2" disabled={saving}>
                  <legend className="text-xs uppercase tracking-wide text-gray-400">
                    Choices: select the correct one
                  </legend>
                  {d.choices.map((choice, j) => (
                    <div key={j} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name={`${idBase}-${i}-correct`}
                        checked={d.correctIndex === j}
                        onChange={() => update(d.key, { correctIndex: j })}
                        aria-label={`${label}: choice ${j + 1} is correct`}
                        className="h-4 w-4 shrink-0 accent-green-600"
                      />
                      <input
                        value={choice}
                        onChange={(e) =>
                          update(d.key, { choices: d.choices.map((c, k) => (k === j ? e.target.value : c)) })
                        }
                        maxLength={CARD_LIMITS.choice}
                        aria-label={`${label}: choice ${j + 1}`}
                        className={`min-w-0 flex-1 rounded-lg border bg-transparent px-3 py-1.5 text-sm ${
                          d.correctIndex === j ? 'border-green-600' : ''
                        }`}
                      />
                    </div>
                  ))}
                </fieldset>
              ) : (
                <div className="space-y-1">
                  <label htmlFor={`${idBase}-${i}-answer`} className="text-xs uppercase tracking-wide text-gray-400">
                    Answer
                  </label>
                  <input
                    id={`${idBase}-${i}-answer`}
                    value={d.answer}
                    onChange={(e) => update(d.key, { answer: e.target.value })}
                    maxLength={CARD_LIMITS.answer}
                    disabled={saving}
                    className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm"
                  />
                </div>
              )}

              {cardError && (
                <p role="alert" className="text-sm text-red-500">
                  {cardError}
                </p>
              )}
            </li>
          );
        })}
      </ol>

      <button
        type="button"
        onClick={add}
        disabled={drafts.length >= CARD_LIMITS.maxCards || saving}
        className="w-full rounded-xl border border-dashed py-3 text-sm font-medium hover:border-blue-400 disabled:opacity-40"
      >
        + Add card
      </button>

      {error && error.cardIndex === null && (
        <p role="alert" className="text-center text-sm text-red-500">
          {error.message}
        </p>
      )}

      <div className="sticky bottom-0 flex gap-3 bg-background py-3">
        <button
          type="button"
          onClick={handleCancel}
          disabled={saving}
          className="btn btn-secondary btn-lg flex-1"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !dirty}
          className="btn btn-primary btn-lg flex-1"
        >
          {saving ? 'Saving...' : 'Save changes'}
        </button>
      </div>
    </main>
  );
}
