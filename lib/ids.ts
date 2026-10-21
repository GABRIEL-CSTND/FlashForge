// Shared by server and client code.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Ids in URLs and request bodies are checked before they reach a query, so a
// malformed id is a clean 404/400 instead of a database error.
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}
