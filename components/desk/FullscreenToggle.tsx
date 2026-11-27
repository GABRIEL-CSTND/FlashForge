'use client';

import { useState, useSyncExternalStore } from 'react';

function subscribe(onChange: () => void) {
  document.addEventListener('fullscreenchange', onChange);
  return () => document.removeEventListener('fullscreenchange', onChange);
}

function getFullscreenState() {
  if (document.fullscreenElement) return 'fullscreen';
  if (document.fullscreenEnabled && typeof document.documentElement.requestFullscreen === 'function') {
    return 'windowed';
  }
  return 'unavailable';
}

const getServerState = () => 'unavailable' as const;

export default function FullscreenToggle() {
  const state = useSyncExternalStore(subscribe, getFullscreenState, getServerState);
  const [error, setError] = useState('');

  if (state === 'unavailable') return null;

  const isFullscreen = state === 'fullscreen';
  const label = isFullscreen ? 'Exit full screen' : 'Enter full screen';

  async function toggleFullscreen() {
    setError('');
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      setError(isFullscreen ? 'Could not exit full screen.' : 'Could not enter full screen.');
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={label}
        title={label}
        onClick={toggleFullscreen}
        className="brass-ring flex size-9 cursor-pointer items-center justify-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e7c97e]"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-4">
          <path d={isFullscreen ? 'M9 3v6H3m12-6v6h6M9 21v-6H3m12 6v-6h6' : 'M9 3H3v6m12-6h6v6M9 21H3v-6m12 6h6v-6'} />
        </svg>
      </button>
      {error && (
        <p role="alert" className="paper absolute right-0 top-full z-20 mt-2 w-max max-w-56 rounded-md px-3 py-2 text-xs text-ink">
          {error}
        </p>
      )}
    </div>
  );
}
