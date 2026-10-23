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

export function limitMessage(limit: number): string {
  return `You've reached today's limit of ${limit} study guide${limit === 1 ? '' : 's'}.`;
}
