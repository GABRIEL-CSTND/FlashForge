import { useSyncExternalStore } from 'react';

// BROWSER-ONLY. Reading cards aloud (#77) with the browser's built-in speech
// (the Web Speech API): free, no AI requests, and on most phones it works
// offline. Where the browser can't speak, the study screen hides the controls.

export function canSpeak(): boolean {
  return (
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof window.SpeechSynthesisUtterance === 'function'
  );
}

// Reads the text, cutting off whatever was still being read.
export function speak(text: string): void {
  if (!canSpeak() || !text.trim()) return;
  window.speechSynthesis.cancel();
  const utterance = new window.SpeechSynthesisUtterance(text);
  utterance.rate = 0.95;
  window.speechSynthesis.speak(utterance);
}

export function stopSpeaking(): void {
  if (canSpeak()) window.speechSynthesis.cancel();
}

const neverChanges = () => () => {};

// False while rendering on the server, so the browser's first render matches.
export function useCanSpeak(): boolean {
  return useSyncExternalStore(neverChanges, canSpeak, () => false);
}

// "Auto": read each card as it appears. Remembered on this device; if storage
// is blocked (some private windows), it lasts until the page is closed.
const AUTO_KEY = 'flashforge_read_aloud';
const AUTO_EVENT = 'flashforge-read-aloud';
let autoInMemory = false;

function readAuto(): boolean {
  try {
    const saved = localStorage.getItem(AUTO_KEY);
    return saved === null ? autoInMemory : saved === '1';
  } catch {
    return autoInMemory;
  }
}

function subscribeAuto(onChange: () => void): () => void {
  window.addEventListener('storage', onChange);
  window.addEventListener(AUTO_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(AUTO_EVENT, onChange);
  };
}

export function useAutoRead(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribeAuto, readAuto, () => false);
  const setOn = (next: boolean) => {
    autoInMemory = next;
    try {
      localStorage.setItem(AUTO_KEY, next ? '1' : '0');
    } catch {
      // Storage blocked: the in-memory value is used instead.
    }
    window.dispatchEvent(new Event(AUTO_EVENT));
  };
  return [on, setOn];
}
