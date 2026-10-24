import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: {} }));

import { questionStats } from '@/lib/class-results';

describe('questionStats: most common wrong answer', () => {
  const cards = [{ id: 'c1', question: 'Organelle that packages proteins', answer: 'Golgi apparatus' }];

  it('groups typed answers that differ only in capitals, spaces and punctuation (#66)', () => {
    const [stat] = questionStats(cards, [
      [{ cardId: 'c1', typed: 'Golgi body', correct: false }],
      [{ cardId: 'c1', typed: 'golgi  BODY.', correct: false }],
      [{ cardId: 'c1', typed: 'Ribosome', correct: false }],
      [{ cardId: 'c1', typed: 'Golgi aparatus', correct: true }],
      [{ cardId: 'c1', typed: null, correct: false }],
    ]);
    expect(stat).toMatchObject({ answered: 5, wrong: 4, percentWrong: 80, topWrongChoice: { choice: 'Golgi body', count: 2 } });
  });

  it('still counts picked options for multiple choice', () => {
    const [stat] = questionStats(cards, [
      [{ cardId: 'c1', chosen: 'Ribosome', correct: false }],
      [{ cardId: 'c1', chosen: 'Ribosome', correct: false }],
      [{ cardId: 'c1', chosen: 'Lysosome', correct: false }],
    ]);
    expect(stat.topWrongChoice).toEqual({ choice: 'Ribosome', count: 2 });
  });

  it('has no wrong answer to show for a true-or-false card (#68)', () => {
    const tf = [{ id: 'c1', question: 'Cells have walls.', answer: 'False', options: ['True', 'False'] }];
    const [stat] = questionStats(tf, [[{ cardId: 'c1', chosen: 'True', correct: false }], [{ cardId: 'c1', chosen: 'True', correct: false }]]);
    expect(stat).toMatchObject({ wrong: 2, percentWrong: 100, topWrongChoice: null });
  });

  it('has no wrong answer to show for self-marked flashcards', () => {
    const [stat] = questionStats(cards, [[{ cardId: 'c1', correct: false }]]);
    expect(stat).toMatchObject({ wrong: 1, topWrongChoice: null });
  });
});
