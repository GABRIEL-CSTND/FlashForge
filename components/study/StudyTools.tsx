import type { ReactNode } from 'react';
import { FLASHCARD_MODE_LABELS, FLASHCARD_MODES, type FlashcardMode } from '@/lib/study-types';

const ICON_PROPS = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

const ICONS: Record<FlashcardMode | 'speak', ReactNode> = {
  flip: (
    <svg {...ICON_PROPS}>
      <path d="M3 12a9 9 0 0 1 15.5-6.2L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15.5 6.2L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  ),
  type: (
    <svg {...ICON_PROPS}>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M7 10h.01" />
      <path d="M11 10h.01" />
      <path d="M15 10h.01" />
      <path d="M7 14h10" />
    </svg>
  ),
  match: (
    <svg {...ICON_PROPS}>
      <rect x="3" y="4" width="8" height="10" rx="1.5" />
      <rect x="13" y="10" width="8" height="10" rx="1.5" />
      <path d="M11 9h2.5" />
      <path d="M13 15h-2.5" />
    </svg>
  ),
  speak: (
    <svg {...ICON_PROPS}>
      <path d="M11 5 6 9H3v6h3l5 4z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M18.5 5.5a9 9 0 0 1 0 13" />
    </svg>
  ),
};

// A round brass button with its name underneath. The whole thing is the
// button, so the touch target is the icon and the word.
function Tool({ label, icon, pressed, onClick }: { label: string; icon: ReactNode; pressed?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={pressed} className="desk-tool flex w-[68px] flex-col items-center gap-1.5 text-xs font-medium text-on-desk/85">
      <span aria-hidden="true" className={`inline-flex h-[52px] w-[52px] items-center justify-center rounded-full ${pressed ? 'brass' : 'brass-ring'}`}>
        {icon}
      </span>
      {label}
    </button>
  );
}

// Flip, Type and Match (changing one starts the deck over), then Read aloud
// and its Auto switch (#77) where the browser can speak. Quizzes have one way
// to answer, so they leave out `mode` and get only Read aloud.
export default function StudyTools({
  mode,
  onMode,
  speechAvailable,
  onSpeak,
  autoRead,
  onAutoRead,
}: {
  mode?: FlashcardMode;
  onMode?: (mode: FlashcardMode) => void;
  speechAvailable: boolean;
  onSpeak: () => void;
  autoRead: boolean;
  onAutoRead: (on: boolean) => void;
}) {
  return (
    <div className="flex flex-wrap items-start justify-center gap-x-2 gap-y-3 sm:gap-x-4">
      {mode && onMode && (
        <div role="group" aria-label="How do you want to study?" className="flex gap-1 sm:gap-2">
          {FLASHCARD_MODES.map((m) => (
            <Tool key={m} label={FLASHCARD_MODE_LABELS[m]} icon={ICONS[m]} pressed={mode === m} onClick={() => onMode(m)} />
          ))}
        </div>
      )}
      {speechAvailable && (
        <div className="flex items-start gap-1">
          <Tool label="Read aloud" icon={ICONS.speak} onClick={onSpeak} />
          <button
            type="button"
            onClick={() => onAutoRead(!autoRead)}
            aria-pressed={autoRead}
            title="Read each card aloud as it appears"
            className={`mt-1 min-h-11 rounded-full px-3.5 text-xs font-semibold ${autoRead ? 'brass' : 'brass-ring'}`}
          >
            Auto
          </button>
        </div>
      )}
    </div>
  );
}
