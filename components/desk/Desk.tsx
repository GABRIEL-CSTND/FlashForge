import type { ReactNode } from 'react';
import CardBox from './CardBox';
import LibraryCard from './LibraryCard';

// The desk every page sits on (desk redesign, phase 1): the card box with the
// navigation tabs at the top left, the library card (account) at the top
// right, and the page itself on a sheet of paper. Later phases turn pages into
// desk objects of their own; until then each page keeps its content on the sheet.
export default function Desk({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      {/* Wraps on phones, where a long row of tabs and the library card don't fit side by side. */}
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 px-3 pt-3 sm:px-8 sm:pt-6">
        <CardBox />
        <LibraryCard />
      </header>
      <div className="flex flex-1 flex-col px-2 pb-6 pt-5 sm:px-6 sm:pb-10 sm:pt-7">
        <div className="desk-sheet sheet mx-auto flex w-full max-w-5xl flex-1 flex-col rounded-md text-foreground">
          {children}
        </div>
      </div>
    </div>
  );
}
