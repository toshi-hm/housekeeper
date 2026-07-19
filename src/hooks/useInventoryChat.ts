import { FunctionsHttpError } from "@supabase/supabase-js";
import { useMutation } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { type ChatHistoryTurn, type ChatResponse, chatResponseSchema } from "@/types/chat";

interface ChatRequestArgs {
  message: string;
  history: ChatHistoryTurn[];
}

export type InventoryChatErrorKind = "tooLong" | "unauthorized" | "generic";

// Classify an error thrown by `askInventoryChat` so the UI can show a
// message that matches the actual failure instead of one generic string.
export const classifyInventoryChatError = (error: unknown): InventoryChatErrorKind => {
  if (error instanceof FunctionsHttpError) {
    const status: unknown = error.context?.status;
    if (status === 400) return "tooLong";
    if (status === 401) return "unauthorized";
  }
  return "generic";
};

// Invoke the `inventory-chat` Edge Function. The user's access token is
// attached automatically by supabase-js, so the function scopes data via RLS.
const askInventoryChat = async ({ message, history }: ChatRequestArgs): Promise<ChatResponse> => {
  const { data, error } = await supabase.functions.invoke<unknown>("inventory-chat", {
    body: { message, history },
  });
  if (error) throw error;
  return chatResponseSchema.parse(data);
};

export const useInventoryChat = () => {
  const mutation = useMutation({ mutationFn: askInventoryChat });
  return {
    ask: mutation.mutateAsync,
    isLoading: mutation.isPending,
    isError: mutation.isError,
    reset: mutation.reset,
  };
};
