import { createHmac } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getAuthedUser } from '@/lib/roles';
import type { Role } from '@/lib/role-types';
import type { StudyType } from '@/lib/study-types';
import type { LimitReason } from '@/lib/generation-limits';

// SERVER-ONLY. One row per generation in generation_logs (#62), and the daily
// limits (#63). /api/generate reserves a row with startGeneration() before
// using the AI (refused once the caller reaches their limit), then fills it in
// with recordGeneration() through after(), once the response has been sent.

export type GenerationErrorKind = 'no_file' | 'unreadable' | 'ai_busy' | 'ai_failed' | 'server_error' | 'limit';

export interface GenerationLog {
  studyType: StudyType;
  // The model that produced the guide; null if none did.
  model: string | null;
  success: boolean;
  errorKind: GenerationErrorKind | null;
  durationMs: number;
  // Requests made to each model, retries and fallbacks included.
  requests: Record<string, number>;
}

// Who is generating: a signed-in user, or a signed-out visitor counted by a
// keyed hash of their IP. The IP itself is never stored.
export interface Caller {
  userId: string | null;
  role: Role | null;
  ipHash: string | null;
}

// On Vercel the platform sets x-forwarded-for to the client's address.
function clientIp(req: Request): string | null {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || req.headers.get('x-real-ip');
}

export function hashIp(ip: string): string {
  const secret = process.env.IP_HASH_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return createHmac('sha256', secret).update(ip).digest('hex');
}

export async function identifyCaller(req: Request, client: SupabaseClient = supabaseAdmin): Promise<Caller> {
  const user = await getAuthedUser(req, client);
  if (user) return { userId: user.id, role: user.role, ipHash: null };
  const ip = clientIp(req);
  return { userId: null, role: null, ipHash: ip ? hashIp(ip) : null };
}

export type GenerationSlot =
  | { allowed: true; id: number }
  | { allowed: false; limit: number; resetsAt: string; reason: LimitReason };

// public.start_generation() counts the caller's guides for the quota day (and
// requests still running), and their failed guides that asked the AI (#41),
// and reserves a row, or refuses, in one locked step.
export async function startGeneration(
  caller: Caller,
  studyType: StudyType,
  client: SupabaseClient = supabaseAdmin
): Promise<GenerationSlot> {
  const { data, error } = await client.rpc('start_generation', {
    p_user_id: caller.userId,
    p_role: caller.role,
    p_ip_hash: caller.ipHash,
    p_study_type: studyType,
  });
  if (error) throw error;
  const slot = data as { allowed: boolean; id?: number; limit?: number; resets_at?: string; reason?: string };
  return slot.allowed
    ? { allowed: true, id: Number(slot.id) }
    : {
        allowed: false,
        limit: Number(slot.limit),
        resetsAt: String(slot.resets_at),
        reason: slot.reason === 'failures' ? 'failures' : 'guides',
      };
}

export interface GenerationState {
  caller: Caller | null;
  // The row start_generation() reserved, if it got that far.
  reservedId: number | null;
  // Refused for the daily limit: start_generation() already logged it.
  refused: boolean;
}

// Called through after(): fills in the reserved row, or logs a new one if the
// request ended before a row was reserved. Never throws: a lost log line must
// not break anything.
export async function recordGeneration(
  req: Request,
  state: GenerationState,
  log: GenerationLog,
  client: SupabaseClient = supabaseAdmin
): Promise<void> {
  if (state.refused) return;
  try {
    const outcome = {
      model: log.model,
      duration_ms: Math.max(0, Math.round(log.durationMs)),
      success: log.success,
      error_kind: log.errorKind,
      requests: log.requests,
    };
    if (state.reservedId !== null) {
      const { error } = await client.from('generation_logs').update(outcome).eq('id', state.reservedId);
      if (error) throw error;
      return;
    }
    const caller = state.caller ?? (await identifyCaller(req, client));
    const { error } = await client.from('generation_logs').insert({
      ...outcome,
      user_id: caller.userId,
      role: caller.role,
      ip_hash: caller.ipHash,
      study_type: log.studyType,
    });
    if (error) throw error;
  } catch (err) {
    console.error('[generation-logs] could not log a generation:', err);
  }
}
