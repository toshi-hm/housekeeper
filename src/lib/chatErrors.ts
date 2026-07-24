// Classifies an `inventory-chat` Edge Function invocation error into a
// UX-relevant kind so `InventoryChatPanel` can show a message that actually
// explains what happened instead of one generic fallback for every failure.
//
// `supabase.functions.invoke` throws a `FunctionsHttpError` (from
// @supabase/functions-js) whose `context` is the raw, unread `Response` for
// any non-2xx status. See `supabase/functions/inventory-chat/index.ts`:
// - 400 `{ error: "message is too long" }` when MAX_MESSAGE_LENGTH (500) is
//   exceeded
// - 401 when the request is unauthenticated (missing/expired session)
// - 502 (`ai_error`) / 504 (`timeout`) / any other status are treated as
//   temporary, retry-later failures
// Network errors (`FunctionsFetchError`), relay errors, and anything without
// a `Response` context also fall back to "temporary".
export type ChatErrorKind = "tooLong" | "unauthorized" | "temporary";

interface FunctionsErrorLike {
  context?: unknown;
}

const hasResponseContext = (error: unknown): error is FunctionsErrorLike & { context: Response } =>
  typeof error === "object" &&
  error !== null &&
  "context" in error &&
  (error as FunctionsErrorLike).context instanceof Response;

export const classifyChatError = async (error: unknown): Promise<ChatErrorKind> => {
  if (!hasResponseContext(error)) return "temporary";

  const { status } = error.context;
  if (status === 401) return "unauthorized";

  if (status === 400) {
    try {
      const body: unknown = await error.context.json();
      const message =
        body && typeof body === "object" && "error" in body
          ? (body as { error?: unknown }).error
          : undefined;
      if (message === "message is too long") return "tooLong";
    } catch {
      // Response body wasn't JSON (or couldn't be read) — fall through to
      // the generic temporary-error message.
    }
  }

  return "temporary";
};
