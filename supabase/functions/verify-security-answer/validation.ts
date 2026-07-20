/** Pure validation/hashing helpers extracted from index.ts for unit testing (#496). */

/** Validates the `email` field of the request body. */
export const isValidEmailInput = (email: unknown): email is string =>
  typeof email === "string" && email.length > 0;

/** Validates the `answer` field of the request body. */
export const isValidAnswerInput = (answer: unknown): answer is string =>
  typeof answer === "string" && answer.length > 0;

/** Validates the `new_password` field of the request body. */
export const isValidNewPasswordInput = (newPassword: unknown): newPassword is string =>
  typeof newPassword === "string" && newPassword.length > 0;

/** Normalizes an email for case-insensitive lookup, matching how it is stored. */
export const normalizeEmail = (email: string): string => email.toLowerCase().trim();

/** SHA-256 hex digest, used to compare the submitted answer against the stored hash. */
export const sha256hex = async (text: string): Promise<string> => {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};
