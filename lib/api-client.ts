import { supabase } from '@/lib/supabase';

// Browser helper for our own API routes: adds the signed-in user's access
// token (routes check it with getAuthedUser/requireRole) and a JSON body.
export async function apiFetch(
  path: string,
  init: { method?: string; body?: unknown } = {}
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;

  const res = await fetch(path, {
    method: init.method ?? 'GET',
    headers: {
      ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

// The message to show for a failed call.
export function errorMessage(data: Record<string, unknown>, fallback = 'Something went wrong. Please try again.') {
  return typeof data.error === 'string' && data.error ? data.error : fallback;
}
