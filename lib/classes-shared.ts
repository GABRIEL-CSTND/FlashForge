// Class rules shared by server and client code (lib/classes.ts is server-only).
// They match the checks on public.classes in
// supabase/migrations/20261020000200_classes.sql.

export const CLASS_NAME_MAX_LENGTH = 80;

// No look-alikes (0/O, 1/I/L) so codes are easy to read aloud and type.
export const JOIN_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const JOIN_CODE_LENGTH = 6;

const JOIN_CODE_PATTERN = new RegExp(`^[${JOIN_CODE_ALPHABET}]{${JOIN_CODE_LENGTH}}$`);

// Trims and collapses whitespace. Returns null if nothing is left or it's too long.
export function cleanClassName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.trim().replace(/\s+/g, ' ');
  return name.length > 0 && name.length <= CLASS_NAME_MAX_LENGTH ? name : null;
}

// Stored as "K7M2QX", shown as "K7M-2QX".
export function formatJoinCode(code: string): string {
  return `${code.slice(0, 3)}-${code.slice(3)}`;
}

// Turns what someone typed ("k7m-2qx", "K7M 2QX") into the stored form, or
// null if it can't be a join code.
export function normalizeJoinCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s-]/g, '');
  return JOIN_CODE_PATTERN.test(code) ? code : null;
}
