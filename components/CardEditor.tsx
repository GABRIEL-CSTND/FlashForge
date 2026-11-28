'use client';

import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  CARD_LIMITS,
  kindFor,
  normalizeChoice,
  toTrueFalse,
  TRUE_FALSE_OPTIONS,
  validateCards,
  type CardKind,
  type StudyType,
} from '@/lib/card-rules';
import { MIXED_PARTS } from '@/lib/study-types';

// "Multiple choice", "True or false", "Identification" (#69).
const KIND_LABELS = Object.fromEntries(MIXED_PARTS.map((p) => [p.kind, p.label])) as Record<CardKind, string>;

export interface EditableCard {
  id: string;
  question: string;
  answer: string;
  options: string[] | null;
  explanation?: string | null;
}

// What PUT /api/sets/[id]/cards expects, in the order the cards should appear.
export interface CardPayload {
  id?: string;
  question: string;
  answer: string;
  options?: string[];
  explanation?: string;
}

export type SaveResult = { ok: true } | { ok: false; error: string; cardIndex: number | null };

export interface SaveOptions {
  keepOpen?: boolean;
}

export type CardEditorTab = 'edit' | 'enter';

interface CardEditorProps {
  studyType: StudyType;
  cards: EditableCard[];
  onSave: (cards: CardPayload[], options?: SaveOptions) => Promise<SaveResult>;
  onCancel: () => void;
  initialTab?: CardEditorTab;
}

interface DraftCard {
  key: string;
  id: string | null;
  // Fixed for each card. Only a mixed quiz (#69) has more than one kind.
  kind: CardKind;
  question: string;
  answer: string;
  choices: string[];
  correctIndex: number | null;
  explanation: string;
}

// React list keys only (never rendered into the page). DOM ids use useId()
// plus the card's position, so server and client HTML match.
let keyCounter = 0;
const newKey = () => `card-${++keyCounter}`;

function toDraft(card: EditableCard, studyType: StudyType): DraftCard {
  const kind = kindFor(studyType, card.options);
  const choices =
    kind === 'multiple_choice'
      ? [...(card.options ?? []), '', '', '', ''].slice(0, CARD_LIMITS.choices)
      : [];
  const correct = choices.findIndex((c) => c && normalizeChoice(c) === normalizeChoice(card.answer));
  return {
    key: newKey(),
    id: card.id,
    kind,
    question: card.question,
    // True or false (#68): "True", "False", or "" until one is picked.
    answer: kind === 'true_false' ? (toTrueFalse(card.answer) ?? '') : card.answer,
    choices,
    correctIndex: correct === -1 ? null : correct,
    explanation: card.explanation ?? '',
  };
}

function emptyDraft(kind: CardKind): DraftCard {
  return {
    key: newKey(),
    id: null,
    kind,
    question: '',
    answer: '',
    choices: kind === 'multiple_choice' ? Array(CARD_LIMITS.choices).fill('') : [],
    correctIndex: null,
    explanation: '',
  };
}

function toPayload(draft: DraftCard): CardPayload {
  const base = draft.id ? { id: draft.id } : {};
  if (draft.kind === 'identification') return { ...base, question: draft.question, answer: draft.answer };
  if (draft.kind === 'true_false') {
    return {
      ...base,
      question: draft.question,
      answer: draft.answer,
      options: [...TRUE_FALSE_OPTIONS],
      explanation: draft.explanation,
    };
  }
  return {
    ...base,
    question: draft.question,
    options: draft.choices,
    answer: draft.correctIndex === null ? '' : draft.choices[draft.correctIndex],
  };
}

// Edit mode for a study set (#55, #105): change, add, delete and reorder cards,
// or switch to the "Enter cards" tab for seamless back-to-back card entry that
// saves each new card without leaving the tab.
export default function CardEditor({
  studyType,
  cards,
  onSave,
  onCancel,
  initialTab = 'edit',
}: CardEditorProps) {
  const initial = useMemo(() => cards.map((c) => toDraft(c, studyType)), [cards, studyType]);
  const [drafts, setDrafts] = useState<DraftCard[]>(initial);
  const [savedSnapshot, setSavedSnapshot] = useState<string>(() => JSON.stringify(initial.map(toPayload)));
  const [activeTab, setActiveTab] = useState<CardEditorTab>(initialTab);
  const [entryKind, setEntryKind] = useState<CardKind>(() => kindFor(studyType, null));
  const [entryQuestion, setEntryQuestion] = useState('');
  const [entryAnswer, setEntryAnswer] = useState('');
  const [entryExplanation, setEntryExplanation] = useState('');
  const [entryChoices, setEntryChoices] = useState<string[]>(() => Array(CARD_LIMITS.choices).fill(''));
  const [entryCorrectIndex, setEntryCorrectIndex] = useState<number | null>(null);
  const [savedConfirmation, setSavedConfirmation] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; cardIndex: number | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const firstEntryInputRef = useRef<HTMLTextAreaElement>(null);
  const idBase = useId();

  const isMixed = studyType === 'mixed';
  const payload = drafts.map(toPayload);
  const dirty = JSON.stringify(payload) !== savedSnapshot;

  const update = (key: string, patch: Partial<DraftCard>) =>
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));

  const move = (index: number, by: -1 | 1) =>
    setDrafts((prev) => {
      const next = [...prev];
      [next[index], next[index + by]] = [next[index + by], next[index]];
      return next;
    });

  const remove = (key: string) => setDrafts((prev) => prev.filter((d) => d.key !== key));

  const add = (kind: CardKind) => setDrafts((prev) => [...prev, emptyDraft(kind)]);

  const handleSave = async () => {
    const checked = validateCards(payload, studyType);
    if (!checked.ok) {
      setError({ message: checked.error, cardIndex: checked.cardIndex });
      return;
    }
    setSaving(true);
    setError(null);
    setSavedConfirmation(null);
    try {
      const result = await onSave(payload);
      if (!result.ok) setError({ message: result.error, cardIndex: result.cardIndex });
      else setSavedSnapshot(JSON.stringify(payload));
    } finally {
      setSaving(false);
    }
  };

  // Seamless back-to-back card entry (#105): validates and saves the newly
  // entered card while keeping the active tab locked on "Enter cards", resets
  // the inputs, returns focus to the first field, and shows "Card saved!".
  const handleQuickAddCard = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (saving) return;

    const newDraft: DraftCard = {
      key: newKey(),
      id: null,
      kind: isMixed ? entryKind : kindFor(studyType, null),
      question: entryQuestion,
      answer: entryAnswer,
      choices: entryChoices,
      correctIndex: entryCorrectIndex,
      explanation: entryExplanation,
    };
    const nextDrafts = [...drafts, newDraft];
    const nextPayload = nextDrafts.map(toPayload);
    const checked = validateCards(nextPayload, studyType);
    if (!checked.ok) {
      setError({ message: checked.error, cardIndex: null });
      setSavedConfirmation(null);
      return;
    }

    setSaving(true);
    setError(null);
    setSavedConfirmation(null);
    try {
      const result = await onSave(nextPayload, { keepOpen: true });
      if (!result.ok) {
        setError({ message: result.error, cardIndex: null });
        return;
      }
      setDrafts(nextDrafts);
      setSavedSnapshot(JSON.stringify(nextPayload));
      setEntryQuestion('');
      setEntryAnswer('');
      setEntryExplanation('');
      setEntryChoices(Array(CARD_LIMITS.choices).fill(''));
      setEntryCorrectIndex(null);
      setSavedConfirmation('Card saved!');
      firstEntryInputRef.current?.focus();
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (dirty && !window.confirm('Discard your changes to these cards?')) return;
    onCancel();
  };

  useEffect(() => {
    if (!savedConfirmation) return;
    const timer = setTimeout(() => setSavedConfirmation(null), 4000);
    return () => clearTimeout(timer);
  }, [savedConfirmation]);

  const currentEntryKind = isMixed ? entryKind : kindFor(studyType, null);
  const entryIsTrueFalse = currentEntryKind === 'true_false';
  const entryIsMultipleChoice = currentEntryKind === 'multiple_choice';

  return (
    <main className="min-h-screen p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Edit cards</h1>
        <div className="flex items-center gap-3">
          {savedConfirmation && (
            <span
              role="status"
              aria-live="polite"
              data-testid="card-saved-badge"
              className="inline-flex items-center rounded-full bg-green-800/15 px-3 py-1 text-xs font-semibold text-green-800"
            >
              ✓ {savedConfirmation}
            </span>
          )}
          <p data-testid="card-counter" className="text-sm text-muted">
            {drafts.length} card{drafts.length === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      <div
        role="tablist"
        aria-label="Card editor tabs"
        className="flex gap-2 border-b border-ink/15 pb-2"
      >
        <button
          type="button"
          role="tab"
          id={`${idBase}-tab-edit`}
          aria-selected={activeTab === 'edit'}
          aria-controls={`${idBase}-panel-edit`}
          onClick={() => {
            setActiveTab('edit');
            setError(null);
          }}
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
            activeTab === 'edit' ? 'bg-accent text-ink' : 'text-muted hover:text-ink'
          }`}
        >
          All cards ({drafts.length})
        </button>
        <button
          type="button"
          role="tab"
          id={`${idBase}-tab-enter`}
          aria-selected={activeTab === 'enter'}
          aria-controls={`${idBase}-panel-enter`}
          onClick={() => {
            setActiveTab('enter');
            setError(null);
            setTimeout(() => firstEntryInputRef.current?.focus(), 0);
          }}
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
            activeTab === 'enter' ? 'bg-accent text-ink' : 'text-muted hover:text-ink'
          }`}
        >
          Enter cards
        </button>
      </div>

      {activeTab === 'enter' ? (
        <section
          id={`${idBase}-panel-enter`}
          role="tabpanel"
          aria-labelledby={`${idBase}-tab-enter`}
          className="space-y-5"
        >
          <form
            aria-label="Enter a new card"
            onSubmit={handleQuickAddCard}
            className="space-y-4 rounded-xl border p-5"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">
                New card (#{drafts.length + 1})
              </h2>
              {isMixed && (
                <select
                  aria-label="New card type"
                  value={entryKind}
                  onChange={(e) => setEntryKind(e.target.value as CardKind)}
                  disabled={saving}
                  className="rounded-lg border bg-transparent px-2.5 py-1 text-xs"
                >
                  {MIXED_PARTS.map((p) => (
                    <option key={p.kind} value={p.kind}>
                      {p.label}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="space-y-1">
              <label
                htmlFor={`${idBase}-entry-question`}
                className="text-xs uppercase tracking-wide text-muted"
              >
                {entryIsTrueFalse ? 'Statement' : 'Question / Definition'}
              </label>
              <textarea
                ref={firstEntryInputRef}
                id={`${idBase}-entry-question`}
                value={entryQuestion}
                onChange={(e) => {
                  setEntryQuestion(e.target.value);
                  if (savedConfirmation) setSavedConfirmation(null);
                }}
                maxLength={CARD_LIMITS.question}
                rows={2}
                disabled={saving}
                placeholder="Type the question, clue, or definition..."
                className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm"
              />
            </div>

            {entryIsTrueFalse ? (
              <>
                <fieldset className="space-y-2" disabled={saving}>
                  <legend className="text-xs uppercase tracking-wide text-muted">Answer</legend>
                  <div className="flex gap-4">
                    {TRUE_FALSE_OPTIONS.map((value) => (
                      <label key={value} className="flex items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name={`${idBase}-entry-truth`}
                          checked={entryAnswer === value}
                          onChange={() => setEntryAnswer(value)}
                          className="h-4 w-4 accent-green-600"
                        />
                        {value}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div className="space-y-1">
                  <label
                    htmlFor={`${idBase}-entry-explanation`}
                    className="text-xs uppercase tracking-wide text-muted"
                  >
                    Explanation (optional)
                  </label>
                  <textarea
                    id={`${idBase}-entry-explanation`}
                    value={entryExplanation}
                    onChange={(e) => setEntryExplanation(e.target.value)}
                    maxLength={CARD_LIMITS.explanation}
                    rows={2}
                    disabled={saving}
                    className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm"
                  />
                </div>
              </>
            ) : entryIsMultipleChoice ? (
              <fieldset className="space-y-2" disabled={saving}>
                <legend className="text-xs uppercase tracking-wide text-muted">
                  Choices: select the correct one
                </legend>
                {entryChoices.map((choice, j) => (
                  <div key={j} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name={`${idBase}-entry-correct`}
                      checked={entryCorrectIndex === j}
                      onChange={() => setEntryCorrectIndex(j)}
                      aria-label={`New card: choice ${j + 1} is correct`}
                      className="h-4 w-4 shrink-0 accent-green-600"
                    />
                    <input
                      value={choice}
                      onChange={(e) =>
                        setEntryChoices((prev) => prev.map((c, k) => (k === j ? e.target.value : c)))
                      }
                      maxLength={CARD_LIMITS.choice}
                      aria-label={`New card: choice ${j + 1}`}
                      className="min-w-0 flex-1 rounded-lg border bg-transparent px-3 py-1.5 text-sm"
                    />
                  </div>
                ))}
              </fieldset>
            ) : (
              <div className="space-y-1">
                <label
                  htmlFor={`${idBase}-entry-answer`}
                  className="text-xs uppercase tracking-wide text-muted"
                >
                  Answer / Term
                </label>
                <input
                  id={`${idBase}-entry-answer`}
                  value={entryAnswer}
                  onChange={(e) => {
                    setEntryAnswer(e.target.value);
                    if (savedConfirmation) setSavedConfirmation(null);
                  }}
                  maxLength={CARD_LIMITS.answer}
                  disabled={saving}
                  placeholder="Type the term or answer..."
                  className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm"
                />
              </div>
            )}

            {error && (
              <p role="alert" className="text-sm text-pencil">
                {error.message}
              </p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={handleCancel}
                disabled={saving}
                className="btn btn-secondary"
              >
                Done entering cards
              </button>
              <button
                type="submit"
                disabled={saving || drafts.length >= CARD_LIMITS.maxCards}
                className="btn btn-primary"
              >
                {saving ? 'Saving...' : 'Save card'}
              </button>
            </div>
          </form>
        </section>
      ) : (
        <>

      <ol className="space-y-4">
        {drafts.map((d, i) => {
          const label = `Card ${i + 1}`;
          const cardError = error && error.cardIndex === i ? error.message : null;
          const isMultipleChoice = d.kind === 'multiple_choice';
          const isTrueFalse = d.kind === 'true_false';
          return (
            <li
              key={d.key}
              aria-label={label}
              className={`space-y-3 rounded-xl border p-4 ${cardError ? 'border-pencil' : ''}`}
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-medium">
                  {label}
                  {isMixed && <span className="font-normal text-muted"> · {KIND_LABELS[d.kind]}</span>}
                </h2>
                <div className="flex items-center gap-1 text-sm">
                  <button
                    type="button"
                    onClick={() => move(i, -1)}
                    disabled={i === 0 || saving}
                    aria-label={`Move ${label} up`}
                    className="rounded px-2 py-1 hover:bg-ink/5 disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    disabled={i === drafts.length - 1 || saving}
                    aria-label={`Move ${label} down`}
                    className="rounded px-2 py-1 hover:bg-ink/5 disabled:opacity-30"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(d.key)}
                    disabled={drafts.length === 1 || saving}
                    aria-label={`Delete ${label}`}
                    title={drafts.length === 1 ? 'A set needs at least one card' : undefined}
                    className="rounded px-2 py-1 text-pencil hover:bg-pencil/10 disabled:opacity-30"
                  >
                    Delete
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label htmlFor={`${idBase}-${i}-question`} className="text-xs uppercase tracking-wide text-muted">
                  {isTrueFalse ? 'Statement' : 'Question'}
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

              {isTrueFalse ? (
                <>
                  <fieldset className="space-y-2" disabled={saving}>
                    <legend className="text-xs uppercase tracking-wide text-muted">Answer</legend>
                    <div className="flex gap-4">
                      {TRUE_FALSE_OPTIONS.map((value) => (
                        <label key={value} className="flex items-center gap-2 text-sm">
                          <input
                            type="radio"
                            name={`${idBase}-${i}-truth`}
                            checked={d.answer === value}
                            onChange={() => update(d.key, { answer: value })}
                            aria-label={`${label} is ${value.toLowerCase()}`}
                            className="h-4 w-4 accent-green-600"
                          />
                          {value}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <div className="space-y-1">
                    <label
                      htmlFor={`${idBase}-${i}-explanation`}
                      className="text-xs uppercase tracking-wide text-muted"
                    >
                      Explanation (optional)
                    </label>
                    <textarea
                      id={`${idBase}-${i}-explanation`}
                      value={d.explanation}
                      onChange={(e) => update(d.key, { explanation: e.target.value })}
                      maxLength={CARD_LIMITS.explanation}
                      rows={2}
                      disabled={saving}
                      placeholder="Shown after answering, e.g. the correct fact"
                      className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm"
                    />
                  </div>
                </>
              ) : isMultipleChoice ? (
                <fieldset className="space-y-2" disabled={saving}>
                  <legend className="text-xs uppercase tracking-wide text-muted">
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
                          d.correctIndex === j ? 'border-green-800' : ''
                        }`}
                      />
                    </div>
                  ))}
                </fieldset>
              ) : (
                <div className="space-y-1">
                  <label htmlFor={`${idBase}-${i}-answer`} className="text-xs uppercase tracking-wide text-muted">
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
                <p role="alert" className="text-sm text-pencil">
                  {cardError}
                </p>
              )}
            </li>
          );
        })}
      </ol>

      {isMixed ? (
        // A mixed quiz (#69) adds a card of any of its three kinds.
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {MIXED_PARTS.map((p) => (
            <button
              key={p.kind}
              type="button"
              onClick={() => add(p.kind)}
              disabled={drafts.length >= CARD_LIMITS.maxCards || saving}
              className="rounded-xl border border-dashed py-3 text-sm font-medium hover:border-accent disabled:opacity-40"
            >
              + {p.label}
            </button>
          ))}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => add(kindFor(studyType, null))}
          disabled={drafts.length >= CARD_LIMITS.maxCards || saving}
          className="w-full rounded-xl border border-dashed py-3 text-sm font-medium hover:border-accent disabled:opacity-40"
        >
          + Add card
        </button>
      )}

      {error && error.cardIndex === null && (
        <p role="alert" className="text-center text-sm text-pencil">
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
        </>
      )}
    </main>
  );
}
