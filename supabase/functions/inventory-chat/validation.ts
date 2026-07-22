import type { ChatLanguage } from "./types.ts";

const SUPPORTED_LANGUAGES = new Set<string>(["ja", "en"] satisfies ChatLanguage[]);

// The language is client-provided, so accept only the locales supported by the
// app and fall back to i18next's default for missing or unexpected values.
export const parseChatLanguage = (language: unknown): ChatLanguage =>
  typeof language === "string" && SUPPORTED_LANGUAGES.has(language)
    ? (language as ChatLanguage)
    : "ja";
