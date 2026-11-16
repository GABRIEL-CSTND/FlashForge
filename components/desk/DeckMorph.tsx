import type { ReactNode } from 'react';
import { ViewTransition } from './view-transition';

// Picking up a deck (desk redesign, phase 5). The deck in the library and the
// deck the next page opens with carry the same name, so the browser morphs one
// into the other. Names must be unique on a page. Where the browser or React
// can't do it, the deck is just shown.
export default function DeckMorph({ name, children }: { name: string; children: ReactNode }) {
  if (!ViewTransition) return <>{children}</>;
  return (
    <ViewTransition name={name} share="morph" default="none">
      {children}
    </ViewTransition>
  );
}
