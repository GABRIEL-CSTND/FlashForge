// The pencil lying on the desk: opens the card editor (desk redesign, phase 2).
// Shown on the flashcard and quiz desks to the set's owner.
export default function Pencil({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="desk-pencil flex min-h-11 flex-col items-start gap-1.5 text-xs font-medium text-on-desk/80 hover:text-on-desk">
      <svg width="132" height="22" viewBox="0 0 132 22" aria-hidden="true" className="-rotate-6 drop-shadow-[0_4px_4px_rgb(0_0_0/0.45)]">
        <path d="M1 11 L17 4 L17 18 Z" fill="#e8cfa6" />
        <path d="M1 11 L7 8.4 L7 13.6 Z" fill="#3a332a" />
        <rect x="17" y="4" width="87" height="14" fill="#d9a23f" />
        <rect x="17" y="9.5" width="87" height="3" fill="#c38c2c" />
        <rect x="104" y="3.5" width="12" height="15" rx="1" fill="#c9a45c" />
        <rect x="116" y="3.5" width="14" height="15" rx="3" fill="#c9786a" />
      </svg>
      Edit cards
    </button>
  );
}
