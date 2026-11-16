// A study guide made while signed out, kept across the Google sign-in redirect
// (a full page reload) so the upload page can show it again and save it.
// The page reads it with useSyncExternalStore: the server and the first
// hydration render see nothing, then the browser's copy is shown, without an
// effect that sets state (#89).
//
// It stays in sessionStorage until the guide is saved or left, so a reload after
// signing in doesn't lose it either.

const KEY = 'flashforge_pending_result';
const listeners = new Set<() => void>();

export function subscribePendingGuide(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// The stored JSON, or null. A string, so React sees the same value until it changes.
export function pendingGuideJson(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    // Storage blocked (private mode, sandboxed frame): nothing was kept.
    return null;
  }
}

export function serverPendingGuideJson(): null {
  return null;
}

// Keeps the guide (JSON), or forgets it (null), and tells the page.
export function keepPendingGuide(json: string | null): void {
  try {
    if (json === null) sessionStorage.removeItem(KEY);
    else sessionStorage.setItem(KEY, json);
  } catch {
    // Storage blocked: the guide just isn't kept across the redirect.
  }
  for (const listener of listeners) listener();
}
