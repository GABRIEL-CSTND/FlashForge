import * as React from 'react';
import type { ComponentType, ReactNode } from 'react';

interface ViewTransitionProps {
  name: string;
  share?: string;
  default?: string;
  children: ReactNode;
}

// React's <ViewTransition> is in the canary React that the App Router runs on
// (node_modules/next/dist/docs/01-app/02-guides/view-transitions.md), not in
// the react package the tests use, so it's looked up rather than imported.
const ViewTransition = (React as unknown as { ViewTransition?: ComponentType<ViewTransitionProps> }).ViewTransition;

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
