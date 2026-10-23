import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getAuthedUser } from '@/lib/roles';
import type { StudyType } from '@/lib/gemini';

// SERVER-ONLY. One row per generation in generation_logs (#62), for the admin
// usage dashboard. /api/generate calls this with after(), once the response has
// been sent, so logging never slows a generation down.

export type GenerationErrorKind = 'no_file' | 'unreadable' | 'ai_busy' | 'ai_failed' | 'server_error';

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

// Never throws: a lost log line must not break anything.
export async function logGeneration(
  req: Request,
  log: GenerationLog,
  client: SupabaseClient = supabaseAdmin
): Promise<void> {
  try {
    const user = await getAuthedUser(req, client);
    const { error } = await client.from('generation_logs').insert({
      user_id: user?.id ?? null,
      role: user?.role ?? null,
      model: log.model,
      study_type: log.studyType,
      duration_ms: Math.max(0, Math.round(log.durationMs)),
      success: log.success,
      error_kind: log.errorKind,
      requests: log.requests,
    });
    if (error) throw error;
  } catch (err) {
    console.error('[generation-logs] could not log a generation:', err);
  }
}
