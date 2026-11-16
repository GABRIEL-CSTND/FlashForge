'use client';

import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { ViewTransition } from './view-transition';

// Turning to another page (desk redesign, page turns). It renders the sheet
// the page lies on (className, from the Desk), so every page turns without
// doing anything.
//
// App Router navigations are transitions, so React runs them as view
// transitions. Keyed by the path, each navigation takes the old page away
// (page-out: it fades and sinks a little) and brings the new one (page-in: it
// rises into place); the styles are in app/globals.css. A deck picked up in the
// library still morphs on top (DeckMorph). default="none": nothing else on a
// page animates the whole page. The key remounts the page tree on each new
// path, which the App Router does for a new page anyway; search params don't
// change the path, so they don't turn the page. (With cacheComponents on, Next
// keeps the last pages alive in hidden <Activity> boundaries, and this key
// would drop them. It's off in next.config.ts.)
//
// Back and Forward are different: React renders those at once, so the browser
// can put the scroll back, and runs no view transition. So the sheet rises in
// by hand instead, unless the browser already animated it (a swipe back).
export default function PageTurn({ className, children }: { className: string; children: ReactNode }) {
  const pathname = usePathname();
  const sheet = useRef<HTMLDivElement>(null);
  const popped = useRef(false);

  useEffect(() => {
    const onPop = (event: PopStateEvent) => {
      if ((event as PopStateEvent & { hasUAVisualTransition?: boolean }).hasUAVisualTransition) return;
      popped.current = true;
      // The new page renders before this runs; if only search params changed,
      // nothing turned, and the next click mustn't rise twice.
      setTimeout(() => {
        popped.current = false;
      }, 0);
    };
    // Capture, so this runs before the router's own popstate listener.
    window.addEventListener('popstate', onPop, true);
    return () => window.removeEventListener('popstate', onPop, true);
  }, []);

  useLayoutEffect(() => {
    if (!popped.current) return;
    popped.current = false;
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    sheet.current?.animate?.(
      still
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [
            { opacity: 0, transform: 'translateY(16px)' },
            { opacity: 1, transform: 'none' },
          ],
      { duration: still ? 200 : 420, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    );
  }, [pathname]);

  return (
    <div ref={sheet} className={className}>
      {ViewTransition ? (
        <ViewTransition key={pathname} enter="page-in" exit="page-out" default="none">
          {children}
        </ViewTransition>
      ) : (
        children
      )}
    </div>
  );
}
