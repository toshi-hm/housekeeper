import type { ItemType } from "../_shared/itemType.ts";

// Subset of the items row needed to build the meal-planning context.
export interface PantryItem {
  id: string;
  name: string;
  units: number;
  content_amount: number;
  content_unit: string;
  opened_remaining: number | null;
  expiry_date: string | null;
  item_type: ItemType | null;
  categories: { name: string; kind: ItemType | null } | null;
  storage_locations: { name: string } | null;
}

// One turn of the chat history sent from the client.
export interface ChatHistoryTurn {
  role: "user" | "model";
  text: string;
}

// UI language, mirrors the client's i18n supportedLngs.
export type ChatLanguage = "ja" | "en";

// Request body sent by the web client (same shape as inventory-chat).
export interface MealChatRequest {
  message: string;
  history?: ChatHistoryTurn[];
  language?: ChatLanguage;
}

// A pantry item used by the proposed menu, returned for chip display.
export interface MealChatItem {
  id: string;
  name: string;
  total_remaining?: string;
  expiry_date?: string | null;
  storage_location?: string | null;
}

// Response body returned to the web client (same shape as inventory-chat so
// the client can share its response schema).
export interface MealChatResponse {
  reply: string;
  items: MealChatItem[];
}

// Gemini API wire types.
export interface GeminiContent {
  parts: Array<{ text: string }>;
  role: "user" | "model";
}

export interface GeminiRequest {
  contents: GeminiContent[];
  systemInstruction?: { parts: Array<{ text: string }> };
  generationConfig?: {
    responseMimeType?: string;
    responseSchema?: unknown;
    temperature?: number;
    thinkingConfig?: { thinkingBudget?: number };
  };
}

export interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string; thought?: boolean }>;
    };
  }>;
}

export type GeminiResult =
  | { kind: "ok"; data: MealChatResponse }
  | { kind: "timeout" }
  | { kind: "error" };
