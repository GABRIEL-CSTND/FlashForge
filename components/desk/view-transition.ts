import * as React from 'react';
import type { ComponentType, ReactNode } from 'react';

export interface ViewTransitionProps {
  name?: string;
  enter?: string;
  exit?: string;
  share?: string;
  update?: string;
  default?: string;
  children: ReactNode;
}

// React's <ViewTransition> is in the canary React that the App Router runs on
// (node_modules/next/dist/docs/01-app/02-guides/view-transitions.md), not in
// the react package the tests use, so it's looked up rather than imported.
// Where it's missing, callers just render their children.
export const ViewTransition = (React as unknown as { ViewTransition?: ComponentType<ViewTransitionProps> })
  .ViewTransition;
