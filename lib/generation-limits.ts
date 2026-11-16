// Daily generation limits per role (#63), shared by server and client. Stored
// in app_settings ('generation_limits'); null means no limit. Counted per
// quota day (Pacific time, when the free Gemini quota resets).

export const LIMIT_ROLES = ['anonymous', 'student', 'teacher', 'admin'] as const;
export type LimitRole = (typeof LIMIT_ROLES)[number];
export type GenerationLimits = Record<LimitRole, number | null>;

export const MAX_DAILY_LIMIT = 1000;

export const LIMIT_LABELS: Record<LimitRole, string> = {
  anonymous: 'Signed out',
  student: 'Students',
  teacher: 'Teachers',
  admin: 'Admins',
};

// The same rules as public.admin_set_generation_limits(): exactly these four
// roles, each null or a whole number from 0 to MAX_DAILY_LIMIT.
export function parseGenerationLimits(raw: unknown): GenerationLimits | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const keys = Object.keys(raw);
  if (keys.length !== LIMIT_ROLES.length || !LIMIT_ROLES.every((r) => keys.includes(r))) return null;
  const limits = {} as GenerationLimits;
  for (const role of LIMIT_ROLES) {
    const value = (raw as Record<string, unknown>)[role];
    if (value === null) limits[role] = null;
    else if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_DAILY_LIMIT) limits[role] = value;
    else return null;
  }
  return limits;
}

// Why public.start_generation() refused: the caller made their guides for the
// day, or as many of their guides failed after asking the AI (#41).
export type LimitReason = 'guides' | 'failures';

export function limitMessage(limit: number, reason: LimitReason = 'guides'): string {
  if (reason === 'failures') {
    return "Too many of your study guides couldn't be made today, so new ones are paused to save the AI's daily quota.";
  }
  return `You've reached today's limit of ${limit} study guide${limit === 1 ? '' : 's'}.`;
}

// What the upload page shows when /api/generate fails. Over the daily limit it
// adds when more can be made, in the viewer's own time zone.
export function generateErrorText(status: number, body: { error?: unknown; resetsAt?: unknown }): string {
  const message = typeof body.error === 'string' && body.error ? body.error : 'Failed to generate study guide.';
  if (status !== 429 || typeof body.resetsAt !== 'string' || Number.isNaN(Date.parse(body.resetsAt))) return message;
  const when = new Date(body.resetsAt).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  return `${message} You can make more after ${when}.`;
}
