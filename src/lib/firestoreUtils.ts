/** Firestore rejects an explicit `undefined` field value (throws "Unsupported field value: undefined") but accepts `null` -- every hook's create/update input goes through this before being written. */
export function sanitizeForFirestore<T extends object>(input: T): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    result[key] = value === undefined ? null : value;
  }
  return result;
}
