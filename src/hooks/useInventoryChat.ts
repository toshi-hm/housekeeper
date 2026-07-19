import { FunctionsHttpError } from "@supabase/supabase-js";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { supabase } from "@/lib/supabase";
import { type ChatHistoryTurn, type ChatResponse, chatResponseSchema } from "@/types/chat";

interface ChatRequestArgs {
  message: string;
  history: ChatHistoryTurn[];
}

// Derive the "ja" | "en" language sent to the Edge Function from i18n's
// (possibly region-tagged, e.g. "en-US") current language.
export const toChatLanguage = (language: string): "ja" | "en" =>
  language.toLowerCase().startsWith("en") ? "en" : "ja";

// Thrown when the inventory-chat Edge Function responds 429 (per-user rate
// limit, #558) so the UI can show a distinct message instead of the generic
// error fallback.
export class ChatRateLimitError extends Error {
  constructor() {
    super("Rate limit exceeded");
    this.name = "ChatRateLimitError";
  }
}

// Invoke the `inventory-chat` Edge Function. The user's access token is
// attached automatically by supabase-js, so the function scopes data via RLS.
const askInventoryChat = async (
  { message, history }: ChatRequestArgs,
  language: "ja" | "en",
): Promise<ChatResponse> => {
  const { data, error } = await supabase.functions.invoke<unknown>("inventory-chat", {
    body: { message, history, language },
  });
  if (error) {
    if (error instanceof FunctionsHttpError && error.context?.status === 429) {
      throw new ChatRateLimitError();
    }
    throw error;
  }
  return chatResponseSchema.parse(data);
};

export const useInventoryChat = () => {
  const { i18n } = useTranslation();
  const mutation = useMutation({
    mutationFn: (args: ChatRequestArgs) => askInventoryChat(args, toChatLanguage(i18n.language)),
  });
  return {
    ask: mutation.mutateAsync,
    isLoading: mutation.isPending,
    isError: mutation.isError,
    reset: mutation.reset,
  };
};
