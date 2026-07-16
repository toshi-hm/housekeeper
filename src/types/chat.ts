import { z } from "zod";

// A single matched inventory item returned by the chat function.
const chatMatchedItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  total_remaining: z.string().optional(),
  expiry_date: z.string().nullable().optional(),
  storage_location: z.string().nullable().optional(),
});

// Response body from the `inventory-chat` Edge Function.
export const chatResponseSchema = z.object({
  reply: z.string(),
  items: z.array(chatMatchedItemSchema),
});

type ChatMatchedItem = z.infer<typeof chatMatchedItemSchema>;
export type ChatResponse = z.infer<typeof chatResponseSchema>;

export type ChatRole = "user" | "assistant";

// A message rendered in the chat panel.
export interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  items?: ChatMatchedItem[];
  isError?: boolean;
}

// History turn sent to the Edge Function (Gemini roles: user / model).
export interface ChatHistoryTurn {
  role: "user" | "model";
  text: string;
}
