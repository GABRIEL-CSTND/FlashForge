import type { ReactNode } from 'react';

export type TagTone = 'ink' | 'brass' | 'pencil' | 'muted';

const TONES: Record<TagTone, string> = {
  ink: 'text-ink',
  brass: 'text-brass-ink',
  pencil: 'text-pencil',
  muted: 'text-muted',
};

// A small paper tag tied to something on the desk (desk redesign, phase 5): a
// deck's best score, whether a guide was saved, when an assignment is due.
export default function PaperTag({
  tone = 'ink',
  tilt = '-2deg',
  className = '',
  children,
}: {
  tone?: TagTone;
  tilt?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`paper paper-tag inline-block whitespace-nowrap rounded px-[11px] py-1 text-[12.5px] font-semibold ${TONES[tone]} ${className}`}
      style={{ rotate: tilt }}
    >
      {children}
    </span>
  );
}
