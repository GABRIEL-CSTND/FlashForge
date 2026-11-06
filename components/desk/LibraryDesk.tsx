import type { ReactNode } from 'react';

// The library's pages on the desk (desk redesign, phase 5): My Sets, History
// and My Classes. The page's name on the leather with a line under it, a sticky
// note with a tip on a laptop, then the decks.
export default function LibraryDesk({
  title,
  subline,
  tip,
  children,
}: {
  title: string;
  subline?: ReactNode;
  tip?: string;
  children: ReactNode;
}) {
  return (
    <main className="on-desk w-full pb-12">
      <div className="flex items-start justify-between gap-8">
        <div className="min-w-0">
          <h1 className="text-[34px] font-normal leading-tight text-[#f3ecdd]">{title}</h1>
          {subline && <p className="mt-1 text-[14.5px] text-on-desk/85">{subline}</p>}
        </div>
        {tip && (
          <aside
            aria-label="Tip"
            className="sticky-note paper-shadow hidden w-[210px] shrink-0 rotate-[3deg] rounded-sm px-4 py-3 font-serif text-[15px] italic leading-snug text-[#3a3220] lg:block"
          >
            {tip}
          </aside>
        )}
      </div>
      <div className="mt-8">{children}</div>
    </main>
  );
}

// A note on paper in the middle of the desk: signed out, nothing yet, or a
// load that failed. It arrives like the decks do.
export function DeskNote({ children, role }: { children: ReactNode; role?: 'alert' | 'status' }) {
  return (
    <div role={role} className="desk-arrive paper paper-shadow w-full max-w-md -rotate-[0.6deg] rounded-md px-6 py-5 text-[15px] text-ink">
      {children}
    </div>
  );
}
