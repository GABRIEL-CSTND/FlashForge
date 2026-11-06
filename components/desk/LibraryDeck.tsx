import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import DeckMorph from './DeckMorph';
import PaperTag, { type TagTone } from './PaperTag';

// Small tilts, so decks look laid down by hand.
const TILTS = ['-1.2deg', '0.9deg', '-0.5deg', '1.4deg', '-1.6deg', '0.6deg'];

export interface LibraryDeckProps {
  href: string;
  // The name it morphs by when it's picked up (DeckMorph). Left out when the
  // same set lies twice on one page, as names must be unique.
  morph?: string;
  // What kind of deck it is: "Flashcards", "Multiple choice".
  kind: string;
  title: string;
  meta: string;
  tag?: { text: string; tone: TagTone };
  // Its place on the desk, for its tilt and when it arrives.
  index: number;
  // Buttons on the desk under it (save, delete, remove).
  actions?: ReactNode;
}

// A deck lying in the library (desk redesign, phase 5): a stack of paper cards
// with its kind, title and one line about it on top, and a paper tag tied to
// its corner. The whole deck is the link that picks it up; the tag is part of
// the link, so it's read with it. Decks arrive on the desk one after another
// once the page has loaded them (.desk-arrive).
export default function LibraryDeck({ href, morph, kind, title, meta, tag, index, actions }: LibraryDeckProps) {
  const deck = (
    <Link
      href={href}
      aria-label={`Pick up ${title}, ${kind}, ${meta}${tag ? `. ${tag.text}` : ''}`}
      className="library-deck relative block aspect-[258/161] w-full max-w-[258px] rounded-[7px]"
      style={{ rotate: TILTS[index % TILTS.length] }}
    >
      <span aria-hidden="true" className="paper deck-layer deck-layer-2 absolute inset-0 rounded-[7px]" />
      <span aria-hidden="true" className="paper deck-layer deck-layer-1 absolute inset-0 rounded-[7px]" />
      <span className="paper deck-top absolute inset-0 flex flex-col justify-between gap-1 rounded-[7px] px-[18px] pb-3.5 pt-[15px] text-left text-ink">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-brass-ink">{kind}</span>
        <span className="line-clamp-2 font-serif text-[22px] leading-[1.15] [overflow-wrap:anywhere]">{title}</span>
        <span className="truncate text-[12.5px] text-muted">{meta}</span>
      </span>
      {tag && (
        <PaperTag tone={tag.tone} tilt={index % 2 ? '2.5deg' : '-2deg'} className="absolute -bottom-[15px] -right-2 z-10">
          {tag.text}
        </PaperTag>
      )}
    </Link>
  );
  return (
    <li className="desk-arrive flex min-w-0 flex-col items-start" style={{ '--i': index } as CSSProperties}>
      {morph ? <DeckMorph name={morph}>{deck}</DeckMorph> : deck}
      {actions && <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-1">{actions}</div>}
    </li>
  );
}

// The empty place for a new deck at the end of My Sets: it goes to making one.
// index: its place after the decks, so it arrives last.
export function NewDeckSpot({ index = 0 }: { index?: number }) {
  return (
    <li className="desk-arrive flex min-w-0 flex-col items-start" style={{ '--i': index } as CSSProperties}>
      <Link
        href="/"
        className="new-deck flex aspect-[258/161] w-full max-w-[258px] flex-col items-center justify-center gap-1 rounded-[7px] text-center"
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#e2c887" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
        <span className="font-serif text-[21px] text-[#f3ecdd]">New deck</span>
        <span className="text-[12.5px] text-on-desk/85">Drop your notes on the desk</span>
      </Link>
    </li>
  );
}

// A quiet word-button on the leather under a deck: Delete, Remove, Leave.
export const DESK_TEXT_BUTTON =
  'min-h-11 px-0.5 text-[13.5px] font-semibold text-on-desk/80 underline-offset-[3px] hover:text-on-desk hover:underline disabled:opacity-50';
