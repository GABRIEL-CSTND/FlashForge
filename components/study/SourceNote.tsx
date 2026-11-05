import type { StudyItem } from './logic';

// Where a card comes from in the uploaded file: the sentence it is based on and
// where that sits, e.g. "Page 3". Only shown once the answer is, so it doesn't
// give the answer away. A card with no source shows nothing.
export default function SourceNote({ card, label, className = '' }: { card: StudyItem; label: string; className?: string }) {
  if (!card.source) return null;
  return (
    <div className={`border-l-2 border-accent/40 pl-3 text-left ${className}`}>
      <p className="mb-1 text-xs uppercase tracking-wide text-muted">
        {label}
        {card.sourceLocation ? ` · ${card.sourceLocation}` : ''}
      </p>
      <p className="text-sm italic text-ink/80">&ldquo;{card.source}&rdquo;</p>
    </div>
  );
}
