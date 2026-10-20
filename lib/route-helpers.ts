import { NextResponse } from 'next/server';
import { AuthError } from '@/lib/roles';

// SERVER-ONLY. Turns anything a route throws into a JSON response: an
// AuthError keeps its 401/403, anything else is logged and becomes a generic
// 500 so database details never reach the browser.
export function errorResponse(err: unknown, tag: string) {
  if (err instanceof AuthError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error(`[${tag}] failed:`, err);
  return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
}

export function notFound(what: string) {
  return NextResponse.json({ error: `${what} not found.` }, { status: 404 });
}

export async function readJsonBody(req: Request): Promise<Record<string, unknown> | null> {
  const body = await req.json().catch(() => null);
  return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
}
