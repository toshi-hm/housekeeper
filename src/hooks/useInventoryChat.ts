import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { supabase } from "@/lib/supabase";
import {
  type ChatHistoryTurn,
  type ChatLang,
  type ChatResponse,
  chatResponseSchema,
} from "@/types/chat";

interface ChatRequestArgs {
  message: string;
  history: ChatHistoryTurn[];
}

// Normalize i18next's `language` (e.g. "en-US") to the "ja" | "en" the Edge
// Function understands. Falls back to "ja" (the app's fallbackLng).
export const resolveChatLang = (i18nLanguage: string): ChatLang =>
  i18nLanguage.startsWith("en") ? "en" : "ja";

// Invoke the `inventory-chat` Edge Function. The user's access token is
// attached automatically by supabase-js, so the function scopes data via RLS.
// The current UI language is sent along so the AI reply matches it instead
// of always being Japanese (#555).
export const askInventoryChat = async (
  { message, history }: ChatRequestArgs,
  lang: ChatLang,
): Promise<ChatResponse> => {
  const { data, error } = await supabase.functions.invoke<unknown>("inventory-chat", {
    body: { message, history, lang },
  });
  if (error) throw error;
  return chatResponseSchema.parse(data);
};

export const useInventoryChat = () => {
  const { i18n } = useTranslation();
  const mutation = useMutation({
    mutationFn: (args: ChatRequestArgs) => askInventoryChat(args, resolveChatLang(i18n.language)),
  });
  return {
    ask: mutation.mutateAsync,
    isLoading: mutation.isPending,
    isError: mutation.isError,
    reset: mutation.reset,
  };
};
