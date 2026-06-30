// Subset of the items row needed to build inventory context for the chat.
export interface InventoryItem {
  id: string;
  name: string;
  category_id: string | null;
  storage_location_id: string | null;
  units: number;
  content_amount: number;
  content_unit: string;
  opened_remaining: number | null;
  expiry_date: string | null;
  deleted_at: string | null;
  categories: { name: string } | null;
  storage_locations: { name: string } | null;
}

// Recently consumed item (fully consumed within past 2 months).
export interface RecentlyConsumedItem {
  item_id: string;
  item_name: string;
  last_consumed_at: string; // ISO timestamp
}

// One turn of the chat history sent from the client.
export interface ChatHistoryTurn {
  role: "user" | "model";
  text: string;
}

// Request body sent by the web client.
export interface ChatRequest {
  message: string;
  history?: ChatHistoryTurn[];
}

// A matched inventory item returned to the client for chip/card display.
export interface ChatMatchedItem {
  id: string;
  name: string;
  total_remaining?: string;
  expiry_date?: string | null;
  storage_location?: string | null;
}

// Response body returned to the web client.
export interface ChatResponse {
  reply: string;
  items: ChatMatchedItem[];
}

// Gemini API request/response wire types.
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
    // Gemini 3.x uses thinkingLevel ("low" | "medium" | "high"); 2.5 used thinkingBudget.
    thinkingConfig?: { thinkingLevel?: string; thinkingBudget?: number };
  };
}

export interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string; thought?: boolean }>;
    };
  }>;
}

// Gemini structured output for the chat.
export interface GeminiChatResult {
  reply: string;
  items: ChatMatchedItem[];
}

// Discriminated union for Gemini query results.
export type GeminiResult =
  | { kind: "ok"; data: GeminiChatResult }
  | { kind: "timeout" }
  | { kind: "error" };
