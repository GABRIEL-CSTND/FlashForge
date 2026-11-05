import type { ReactNode } from 'react';

// One card of cream card stock with two faces (desk redesign). Flipping turns
// an inner layer around its vertical axis; the face turned away is hidden from
// screen readers and can't be clicked or focused, so only the side you see is
// there to use.
export default function PaperCard({ flipped, front, back }: { flipped: boolean; front: ReactNode; back: ReactNode }) {
  return (
    <div className="paper-card">
      <div className="paper-card-inner" style={flipped ? { transform: 'rotateY(180deg)' } : undefined}>
        <div className="paper paper-card-face" aria-hidden={flipped || undefined} inert={flipped}>
          {front}
        </div>
        <div className="paper paper-card-face paper-card-back" aria-hidden={!flipped || undefined} inert={!flipped}>
          {back}
        </div>
      </div>
    </div>
  );
}
