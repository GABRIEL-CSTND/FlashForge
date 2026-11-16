import { Fragment, type ReactNode } from 'react';
import { ViewTransition } from './view-transition';

// One view of a page giving way to another without a navigation: on the home
// page, the notes sheet becomes the deck being made, then the new cards (or the
// notes sheet again, if it failed). Keyed by the view's name, so when it changes
// inside a transition (startTransition), the old view turns away like a page
// (page-out) and the new one rises in (page-in), as PageTurn does between pages.
// Outside a transition, or where view transitions don't run, the view just
// changes.
export default function DeskTurn({ view, children }: { view: string; children: ReactNode }) {
  if (!ViewTransition) return <Fragment key={view}>{children}</Fragment>;
  return (
    <ViewTransition key={view} enter="page-in" exit="page-out" default="none">
      {children}
    </ViewTransition>
  );
}
