/** Pure validation/normalization helpers extracted from index.ts for unit testing (#496). */

/** Validates the `email` field of the request body. */
export const isValidEmailInput = (email: unknown): email is string =>
  typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

/** Normalizes an email for case-insensitive lookup, matching how it is stored. */
export const normalizeEmail = (email: string): string => email.toLowerCase().trim();
