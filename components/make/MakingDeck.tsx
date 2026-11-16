import type { CSSProperties } from 'react';

// The deck being made, on the desk while the AI writes the study guide: a
// pencil writes a card, the card goes onto the deck, the deck is riffle
// shuffled, and a fresh card comes up, over and over until the deck arrives.
// The API sends every card at once (see DeckSpread), so this shows the work
// going on, not how far along it is: the steps underneath say that.
// Decorative, so it's hidden from screen readers. The motion is CSS (".making-"
// in app/globals.css, on one 5.6 s loop); with reduced motion the card just
// lies there written, with the pencil beside it.

// Pencil lines that look like handwriting: words made of humps (m, n) with the
// odd tall stroke (l, h), on a baseline at y = 11 in a 16 px high box. Seeded,
// so the server and the browser draw the same lines.
function handwriting(width: number, seed: number) {
  let s = seed;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  const f = (n: number) => Number(n.toFixed(1));
  const words: string[] = [];
  let x = 1;
  while (x < width - 12) {
    const len = Math.min(16 + rand() * 30, width - 1 - x);
    if (len < 10) break;
    let d = `M${f(x)} 11`;
    const start = x;
    while (x < start + len - 2) {
      const w = 3.2 + rand() * 2.4;
      const top = rand() < 0.2 ? 1.5 + rand() * 1.5 : 5 + rand() * 2;
      const mid = x + w / 2;
      d += ` C${f(x + w * 0.1)} ${f(11 - (11 - top) * 0.85)} ${f(mid - w * 0.15)} ${f(top)} ${f(mid)} ${f(top)}`;
      d += ` S${f(x + w * 0.95)} 11 ${f(x + w)} 11`;
      x += w;
    }
    words.push(d);
    x += 6 + rand() * 4;
  }
  return words.join(' ');
}

// Three lines of a clue, the last one short. Their places on the card are set
// in globals.css (.making-line-1 to -3), where the pencil's path follows them.
const LINES = [
  { width: 236, d: handwriting(236, 7) },
  { width: 212, d: handwriting(212, 23) },
  { width: 128, d: handwriting(128, 41) },
];

const DECK = [0, 1, 2, 3, 4];
const DECK_TILTS = ['-1.5deg', '1deg', '-0.5deg', '1.5deg', '0.5deg'];

export default function MakingDeck({ label }: { label: string }) {
  return (
    <div aria-hidden="true" className="making-scene">
      {DECK.map((i) => (
        <span
          key={i}
          className="making-deck-card paper"
          style={{ '--i': i, '--side': i % 2 ? 1 : -1, '--r': DECK_TILTS[i] } as CSSProperties}
        />
      ))}
      <div className="making-card paper">
        <span className="making-card-label">{label}</span>
        {LINES.map((line, k) => (
          <svg key={k} className={`making-line making-line-${k + 1}`} width={line.width} height="16" viewBox={`0 0 ${line.width} 16`}>
            <path d={line.d} />
          </svg>
        ))}
      </div>
      <div className="making-pencil">
        <svg className="making-pencil-body" width="119" height="16" viewBox="0 -1 119 16">
          <polygon points="22,0 22,14 5,8.6 5,5.4" fill="#e3c08a" />
          <polygon points="5,5.4 5,8.6 0,7" fill="#3b3832" />
          <rect x="22" y="0" width="76" height="14" fill="#c99a4a" />
          <rect x="22" y="1.5" width="76" height="3.5" fill="#ddb46a" />
          <rect x="22" y="9.5" width="76" height="3" fill="#a87c36" />
          <rect x="98" y="-0.5" width="11" height="15" fill="#b8964f" />
          <path d="M101 -0.5v15M104 -0.5v15M107 -0.5v15" stroke="#8f7136" strokeWidth="0.8" />
          <rect x="109" y="0.5" width="9" height="13" rx="2.5" fill="#c4756a" />
        </svg>
      </div>
    </div>
  );
}
