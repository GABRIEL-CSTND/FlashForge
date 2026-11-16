// Helpers for the library pages (desk redesign, phase 5): My Sets, History and
// My Classes lay their decks out on the desk, each with a paper tag.

export interface AttemptScore {
  set_id: string;
  score: number;
  total: number;
}

export interface BestScore {
  score: number;
  total: number;
}

// Each deck's best score: the attempt with the largest share right. A tie goes
// to the bigger total, so 10 of 10 beats 5 of 5.
export function bestByDeck(attempts: AttemptScore[]): Record<string, BestScore> {
  const best: Record<string, BestScore> = {};
  for (const a of attempts) {
    if (!a.set_id || !(a.total > 0)) continue;
    const b = best[a.set_id];
    const share = a.score / a.total;
    const bestShare = b ? b.score / b.total : -1;
    if (share > bestShare || (share === bestShare && a.total > b!.total)) best[a.set_id] = { score: a.score, total: a.total };
  }
  return best;
}

const dayNumber = (d: Date) => Math.round(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 86_400_000);

// When a deck was made or saved, the way a tag says it: "Today", "Yesterday",
// "Oct 29", or "Oct 29, 2025" in another year. In the viewer's own time zone.
export function shortDate(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const daysAgo = dayNumber(now) - dayNumber(d);
  if (daysAgo === 0) return 'Today';
  if (daysAgo === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(d.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  });
}

export const questionsWord = (n: number) => `${n} question${n === 1 ? '' : 's'}`;
