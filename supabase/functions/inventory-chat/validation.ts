import { z } from "npm:zod@4.3.6";

import type { ChatLanguage } from "./types.ts";

const chatLanguageSchema = z.enum(["ja", "en"]);

// The language is client-provided, so accept only the locales supported by the
// app and fall back to i18next's default for missing or unexpected values.
export const parseChatLanguage = (language: unknown): ChatLanguage => {
  const result = chatLanguageSchema.safeParse(language);
  return result.success ? result.data : "ja";
};
