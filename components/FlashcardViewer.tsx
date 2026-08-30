'use client';

import { useState } from 'react';

interface Flashcard {
  id: string;
  question: string;
  answer: string;
}

type ViewMode = 1 | 5 | 'all';

export default function FlashcardViewer({ cards }: { cards: Flashcard[] }) {
  const [mode, setMode] = useState<ViewMode>(1);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState<Record<string, boolean>>({});

  const toggleFlip = (id: string) =>
    setFlipped((prev) => ({ ...prev, [id]: !prev[id] }));

  const visibleCards =
    mode === 'all'
      ? cards
      : cards.slice(index, index + (mode as number));

  const maxIndex = mode === 'all' ? 0 : Math.max(0, cards.length - (mode as number));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {([1, 5, 'all'] as ViewMode[]).map((m) => (
            <button
              key={m}
              onClick={() => {
                setMode(m);
                setIndex(0);
              }}
              className={`px-3 py-1 rounded-md text-sm border ${
                mode === m
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'border-gray-300 text-gray-600'
              }`}
            >
              {m === 'all' ? 'All cards' : `${m} at a time`}
            </button>
          ))}
        </div>
        <span className="text-sm text-gray-500">{cards.length} cards</span>
      </div>

      <div className="grid gap-3">
        {visibleCards.map((card) => (
          <div
            key={card.id}
            onClick={() => toggleFlip(card.id)}
            className="border rounded-xl p-6 cursor-pointer select-none min-h-[100px] flex items-center justify-center text-center hover:border-blue-400 transition-colors"
          >
            <p className="font-medium">
              {flipped[card.id] ? card.answer : card.question}
            </p>
          </div>
        ))}
      </div>

      {mode !== 'all' && cards.length > (mode as number) && (
        <div className="flex justify-between items-center pt-2">
          <button
            onClick={() => setIndex((i) => Math.max(0, i - (mode as number)))}
            disabled={index === 0}
            className="px-4 py-2 rounded-md border text-sm disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-sm text-gray-500">
            {index + 1}-{Math.min(index + (mode as number), cards.length)} of {cards.length}
          </span>
          <button
            onClick={() => setIndex((i) => Math.min(maxIndex, i + (mode as number)))}
            disabled={index >= maxIndex}
            className="px-4 py-2 rounded-md border text-sm disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}

      <p className="text-xs text-gray-400 text-center">Click a card to flip it.</p>
    </div>
  );
}
