import type { ChatHistoryTurn, ChatLanguage } from "./types.ts";

export const MAX_MESSAGE_LENGTH = 500;

const SUPPORTED_LANGUAGES = new Set<string>(["ja", "en"] satisfies ChatLanguage[]);
const HISTORY_ROLES = new Set(["user", "model"]);

// The language is client-provided, so accept only the locales supported by the
// app and fall back to i18next's default for missing or unexpected values.
export const parseChatLanguage = (language: unknown): ChatLanguage =>
  typeof language === "string" && SUPPORTED_LANGUAGES.has(language)
    ? (language as ChatLanguage)
    : "ja";

export const sanitizeHistory = (history: unknown): ChatHistoryTurn[] => {
  if (!Array.isArray(history)) return [];
  return history.flatMap((turn): ChatHistoryTurn[] => {
    if (!turn || typeof turn !== "object") return [];
    const t = turn as Record<string, unknown>;
    if (!HISTORY_ROLES.has(t.role as string) || typeof t.text !== "string") return [];
    return [{ role: t.role as "user" | "model", text: t.text.slice(0, MAX_MESSAGE_LENGTH) }];
  });
};
