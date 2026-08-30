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

export default function SetPage() {
  const params = useParams<{ id: string }>();
  const [set, setSet] = useState<FlashcardSet | null>(null);
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, boolean>>({});
  const [view, setView] = useState<'card' | 'summary'>('card');
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

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
      setView('summary');
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
    setView('card');
  };

  const selectMcOption = (card: Flashcard, opt: string) => {
    if (selectedOption !== null) return;
    setSelectedOption(opt);
    setResults((r) => ({ ...r, [card.id]: opt === card.answer }));
  };

  const selfMark = (card: Flashcard, correct: boolean) => {
    setResults((r) => ({ ...r, [card.id]: correct }));
  };

  if (loading) {
    return <main className="min-h-screen flex items-center justify-center">Loading...</main>;
  }

  if (notFound || !set) {
    return <main className="min-h-screen flex items-center justify-center">Set not found.</main>;
  }

  if (view === 'summary') {
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
        </div>
      </main>
    );
  }

  const card = cards[index];
  const isMultipleChoice = set.study_type === 'multiple_choice';
  const isLast = index === cards.length - 1;
  const mcAnswered = selectedOption !== null;
  const selfAnswered = results[card?.id] !== undefined;

  return (
    <main className="min-h-screen p-6 max-w-md mx-auto flex flex-col justify-center min-h-screen space-y-6">
      <div className="text-center">
        <h1 className="text-xl font-semibold">{set.title}</h1>
        {cards.length > 0 && (
          <p className="text-sm text-gray-500 mt-1">
            Card {index + 1} of {cards.length}
          </p>
        )}
      </div>

      {cards.length === 0 ? (
        <div className="border rounded-lg p-6 text-center text-gray-500">
          No items yet for this set.
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
