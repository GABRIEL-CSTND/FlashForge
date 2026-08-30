'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';

interface FlashcardSet {
  id: string;
  title: string;
  source_filename: string | null;
  study_type: 'flashcard' | 'multiple_choice';
}

interface Flashcard {
  id: string;
  question: string;
  answer: string;
  options: string[] | null;
  position: number;
}

type ViewMode = 'study' | 'browse';
type BrowseCount = 1 | 'all' | number;

export default function SetPage() {
  const params = useParams<{ id: string }>();
  const [set, setSet] = useState<FlashcardSet | null>(null);
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Study mode (one at a time, scored)
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, boolean>>({});
  const [studyView, setStudyView] = useState<'card' | 'summary'>('card');

  // Top-level mode: study (scored, 1-at-a-time) vs browse (unscored, batch)
  const [mode, setMode] = useState<ViewMode>('study');

  // Browse mode state
  const [browseCount, setBrowseCount] = useState<BrowseCount>(1);
  const [customCount, setCustomCount] = useState('');
  const [browseIndex, setBrowseIndex] = useState(0);
  const [browseFlipped, setBrowseFlipped] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const load = async () => {
      const { data: setData, error: setError } = await supabase
        .from('flashcard_sets')
        .select('*')
        .eq('id', params.id)
        .single();

      if (setError || !setData) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setSet(setData);

      const { data: cardData } = await supabase
        .from('flashcards')
        .select('*')
        .eq('set_id', params.id)
        .order('position', { ascending: true });

      setCards(cardData || []);
      setLoading(false);
    };
    load();
  }, [params.id]);

  const resetCardState = () => {
    setFlipped(false);
    setSelectedOption(null);
  };

  const goNext = () => {
    if (index < cards.length - 1) {
      resetCardState();
      setIndex((i) => i + 1);
    } else {
      setStudyView('summary');
    }
  };

  const goPrev = () => {
    if (index > 0) {
      resetCardState();
      setIndex((i) => i - 1);
    }
  };

  const restart = () => {
    setResults({});
    setIndex(0);
    resetCardState();
    setStudyView('card');
  };

  const selectMcOption = (card: Flashcard, opt: string) => {
    if (selectedOption !== null) return;
    setSelectedOption(opt);
    setResults((r) => ({ ...r, [card.id]: opt === card.answer }));
  };

  const selfMark = (card: Flashcard, correct: boolean) => {
    setResults((r) => ({ ...r, [card.id]: correct }));
  };

  const toggleBrowseFlip = (id: string) =>
    setBrowseFlipped((prev) => ({ ...prev, [id]: !prev[id] }));

  const effectiveBrowseCount: number =
    browseCount === 'all' ? cards.length : (browseCount as number);

  const browseMaxIndex = Math.max(0, cards.length - effectiveBrowseCount);

  const visibleBrowseCards =
    browseCount === 'all'
      ? cards
      : cards.slice(browseIndex, browseIndex + effectiveBrowseCount);

  if (loading) {
    return <main className="min-h-screen flex items-center justify-center">Loading...</main>;
  }

  if (notFound || !set) {
    return <main className="min-h-screen flex items-center justify-center">Set not found.</main>;
  }

  const isMultipleChoice = set.study_type === 'multiple_choice';

  if (studyView === 'summary' && mode === 'study') {
    const answered = Object.keys(results).length;
    const correct = Object.values(results).filter(Boolean).length;
    const pct = cards.length > 0 ? Math.round((correct / cards.length) * 100) : 0;

    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-md text-center space-y-6">
          <h1 className="text-xl font-semibold">{set.title}</h1>
          <div className="border rounded-xl p-8 space-y-2">
            <p className="text-4xl font-bold">
              {correct} / {cards.length}
            </p>
            <p className="text-gray-500">{pct}% correct</p>
            {answered < cards.length && (
              <p className="text-xs text-gray-400 mt-2">
                {cards.length - answered} card{cards.length - answered === 1 ? '' : 's'} skipped without answering
              </p>
            )}
          </div>
          <button
            onClick={restart}
            className="w-full py-3 rounded-lg bg-blue-600 text-white font-medium"
          >
            Try Again
          </button>
          {!isMultipleChoice && (
            <button
              onClick={() => setMode('browse')}
              className="w-full py-2 text-sm text-gray-500 underline"
            >
              Browse cards instead
            </button>
          )}
        </div>
      </main>
    );
  }

  const card = cards[index];
  const isLast = index === cards.length - 1;
  const mcAnswered = selectedOption !== null;
  const selfAnswered = card ? results[card.id] !== undefined : false;

  return (
    <main className="min-h-screen p-6 max-w-md mx-auto flex flex-col justify-center min-h-screen space-y-6">
      <div className="text-center">
        <h1 className="text-xl font-semibold">{set.title}</h1>
        {cards.length > 0 && mode === 'study' && (
          <p className="text-sm text-gray-500 mt-1">
            Card {index + 1} of {cards.length}
          </p>
        )}
      </div>

      {!isMultipleChoice && cards.length > 0 && (
        <div className="flex justify-center gap-2">
          <button
            onClick={() => setMode('study')}
            className={`px-3 py-1 rounded-md text-sm border ${
              mode === 'study'
                ? 'bg-blue-600 text-white border-blue-600'
                : 'border-gray-300 text-gray-600'
            }`}
          >
            Study (scored)
          </button>
          <button
            onClick={() => setMode('browse')}
            className={`px-3 py-1 rounded-md text-sm border ${
              mode === 'browse'
                ? 'bg-blue-600 text-white border-blue-600'
                : 'border-gray-300 text-gray-600'
            }`}
          >
            Browse
          </button>
        </div>
      )}

      {cards.length === 0 ? (
        <div className="border rounded-lg p-6 text-center text-gray-500">
          No items yet for this set.
        </div>
      ) : mode === 'browse' ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              onClick={() => { setBrowseCount(1); setBrowseIndex(0); }}
              className={`px-3 py-1 rounded-md text-sm border ${
                browseCount === 1
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'border-gray-300 text-gray-600'
              }`}
            >
              1 at a time
            </button>
            <button
              onClick={() => { setBrowseCount('all'); setBrowseIndex(0); }}
              className={`px-3 py-1 rounded-md text-sm border ${
                browseCount === 'all'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'border-gray-300 text-gray-600'
              }`}
            >
              All cards
            </button>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const n = parseInt(customCount, 10);
                if (n > 0) {
                  setBrowseCount(Math.min(n, cards.length));
                  setBrowseIndex(0);
                }
              }}
              className="flex items-center gap-1"
            >
              <input
                type="number"
                min={1}
                max={cards.length}
                value={customCount}
                onChange={(e) => setCustomCount(e.target.value)}
                placeholder="#"
                className="w-14 px-2 py-1 rounded-md border border-gray-300 text-sm"
              />
              <button
                type="submit"
                className="px-3 py-1 rounded-md text-sm border border-gray-300 text-gray-600"
              >
                Go
              </button>
            </form>
          </div>

          <div className="grid gap-3">
            {visibleBrowseCards.map((c) => (
              <div
                key={c.id}
                onClick={() => toggleBrowseFlip(c.id)}
                className="border rounded-xl p-6 cursor-pointer select-none min-h-[100px] flex items-center justify-center text-center hover:border-blue-400 transition-colors"
              >
                <p className="font-medium">
                  {browseFlipped[c.id] ? c.answer : c.question}
                </p>
              </div>
            ))}
          </div>

          {browseCount !== 'all' && cards.length > effectiveBrowseCount && (
            <div className="flex justify-between items-center pt-2">
              <button
                onClick={() => setBrowseIndex((i) => Math.max(0, i - effectiveBrowseCount))}
                disabled={browseIndex === 0}
                className="px-4 py-2 rounded-md border text-sm disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-sm text-gray-500">
                {browseIndex + 1}-{Math.min(browseIndex + effectiveBrowseCount, cards.length)} of {cards.length}
              </span>
              <button
                onClick={() => setBrowseIndex((i) => Math.min(browseMaxIndex, i + effectiveBrowseCount))}
                disabled={browseIndex >= browseMaxIndex}
                className="px-4 py-2 rounded-md border text-sm disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}

          <p className="text-xs text-gray-400 text-center">Click a card to flip it.</p>
        </div>
      ) : isMultipleChoice ? (
        <>
          <div className="w-full min-h-[220px] border rounded-xl p-8 flex flex-col justify-center space-y-4">
            <p className="text-lg font-medium text-center">{card.question}</p>
            <div className="space-y-2">
              {(card.options ?? []).map((opt) => {
                const isSelected = selectedOption === opt;
                const isCorrect = opt === card.answer;
                const showState = selectedOption !== null;
                return (
                  <button
                    key={opt}
                    onClick={() => selectMcOption(card, opt)}
                    disabled={selectedOption !== null}
                    className={`w-full text-left px-4 py-2 rounded-lg border transition-colors ${
                      showState && isCorrect
                        ? 'border-green-500 bg-green-500/10'
                        : showState && isSelected && !isCorrect
                        ? 'border-red-500 bg-red-500/10'
                        : 'border-gray-300'
                    }`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex justify-between items-center gap-4">
            <button
              onClick={goPrev}
              disabled={index === 0}
              className="flex-1 py-3 rounded-lg border font-medium disabled:opacity-30 disabled:cursor-not-allowed"
            >
              ← Prev
            </button>
            <button
              onClick={goNext}
              disabled={!mcAnswered}
              className="flex-1 py-3 rounded-lg bg-blue-600 text-white font-medium disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {isLast ? 'Finish' : 'Next →'}
            </button>
          </div>
        </>
      ) : (
        <>
          <button
            onClick={() => setFlipped((f) => !f)}
            className="w-full min-h-[220px] border rounded-xl p-8 flex flex-col items-center justify-center text-center hover:border-blue-400 transition-colors"
          >
            <p className="text-xs uppercase tracking-wide text-gray-400 mb-3">
              {flipped ? 'Answer' : 'Question'}
            </p>
            <p className="text-lg font-medium">{flipped ? card.answer : card.question}</p>
            {!flipped && <p className="text-xs text-gray-400 mt-4">Tap to flip</p>}
          </button>

          {flipped && (
            <div className="flex gap-3">
              <button
                onClick={() => selfMark(card, false)}
                className={`flex-1 py-2 rounded-lg border font-medium ${
                  results[card.id] === false
                    ? 'border-red-500 bg-red-500/10'
                    : 'border-gray-300'
                }`}
              >
                Got it wrong
              </button>
              <button
                onClick={() => selfMark(card, true)}
                className={`flex-1 py-2 rounded-lg border font-medium ${
                  results[card.id] === true
                    ? 'border-green-500 bg-green-500/10'
                    : 'border-gray-300'
                }`}
              >
                Got it right
              </button>
            </div>
          )}

          <div className="flex justify-between items-center gap-4">
            <button
              onClick={goPrev}
              disabled={index === 0}
              className="flex-1 py-3 rounded-lg border font-medium disabled:opacity-30 disabled:cursor-not-allowed"
            >
              ← Prev
            </button>
            <button
              onClick={goNext}
              disabled={!selfAnswered}
              className="flex-1 py-3 rounded-lg bg-blue-600 text-white font-medium disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {isLast ? 'Finish' : 'Next →'}
            </button>
          </div>
        </>
      )}
    </main>
  );
}
