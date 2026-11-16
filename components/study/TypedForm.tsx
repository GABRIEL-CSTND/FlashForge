'use client';

import { useState } from 'react';
import { CARD_LIMITS } from '@/lib/card-rules';

// The answer written on the card, on the line under the clue: flashcards in
// Type mode (#66) and Part III of a mixed quiz (#69). "I don't know" checks it
// as not answered.
export default function TypedForm({ onCheck }: { onCheck: (typed: string | null) => void }) {
  const [draft, setDraft] = useState('');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (draft.trim()) onCheck(draft.trim());
      }}
      className="flex flex-wrap items-end gap-x-2.5 gap-y-2"
    >
      <label className="flex min-w-0 flex-1 basis-40 flex-col gap-0.5 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-brass-ink">
        <span aria-hidden="true">Your answer</span>
        <input
          aria-label="Your answer"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={CARD_LIMITS.answer}
          autoFocus
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          className="min-h-10 w-full border-0 border-b-[1.5px] border-[#8c8270] bg-transparent px-0.5 pb-1 pt-0.5 font-serif text-2xl font-normal normal-case italic tracking-normal text-[#1f2a44]"
        />
      </label>
      <button type="button" onClick={() => onCheck(null)} className="min-h-11 px-1.5 text-[13.5px] font-semibold text-muted hover:underline">
        I don&apos;t know
      </button>
      <button type="submit" disabled={!draft.trim()} className="btn btn-primary min-h-11 rounded-full px-[18px]">
        Check
      </button>
    </form>
  );
}
