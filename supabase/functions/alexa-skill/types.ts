export interface AlexaSlot {
  name: string;
  value?: string;
  confirmationStatus?: "NONE" | "CONFIRMED" | "DENIED";
}

export interface AlexaIntent {
  name: string;
  confirmationStatus?: "NONE" | "CONFIRMED" | "DENIED";
  slots?: Record<string, AlexaSlot>;
}

export interface AlexaRequest {
  version: string;
  session?: {
    new: boolean;
    sessionId: string;
    application: { applicationId: string };
    attributes?: Record<string, unknown>;
    user: { userId: string };
  };
  context: {
    System: {
      application: { applicationId: string };
      user: { userId: string };
    };
  };
  request:
    | {
        type: "LaunchRequest";
        requestId: string;
        timestamp: string;
      }
    | {
        type: "IntentRequest";
        requestId: string;
        timestamp: string;
        intent: AlexaIntent;
      }
    | {
        type: "SessionEndedRequest";
        requestId: string;
        timestamp: string;
        reason: string;
      };
}

export interface AlexaOutputSpeech {
  type: "PlainText" | "SSML";
  text?: string;
  ssml?: string;
}

export interface AlexaResponse {
  version: string;
  sessionAttributes?: Record<string, unknown>;
  response: {
    outputSpeech: AlexaOutputSpeech;
    reprompt?: {
      outputSpeech: AlexaOutputSpeech;
    };
    shouldEndSession: boolean;
    card?: {
      type: string;
      title?: string;
      content?: string;
    };
  };
}

// Supabase item type for Edge Function (subset of full DB type)
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

// Gemini API types
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
    thinkingConfig?: { thinkingBudget: number };
  };
}

export interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<{ text: string }>;
    };
  }>;
}

// Recently consumed item (fully consumed within past 2 months)
export interface RecentlyConsumedItem {
  item_id: string;
  item_name: string;
  last_consumed_at: string; // ISO timestamp
}

// Gemini structured output schema
export interface GeminiMatchResult {
  matchedItems: Array<{
    id: string;
    name: string;
    units: number;
    content_amount: number;
    content_unit: string;
    opened_remaining?: number | null;
    expiry_date?: string | null;
    category?: string | null;
    storage_location?: string | null;
  }>;
  speech: string;
  confidence: "exact" | "fuzzy" | "none";
  stockStatus: "in_stock" | "out_of_stock" | "not_found" | "recently_consumed";
}

// Session attributes for multi-turn dialog
export interface PendingShoppingItem {
  id: string | null;
  name: string;
  units: number;
  content_amount: number;
  content_unit: string;
  opened_remaining: number | null;
}

export interface SessionAttributes extends Record<string, unknown> {
  pendingAction?: "add_to_shopping_list" | "choose_alternate";
  pendingItem?: PendingShoppingItem;
  pendingQuery?: string;
}

// Discriminated union for Gemini query results
export type GeminiResult =
  | { kind: "ok"; data: GeminiMatchResult }
  | { kind: "timeout" }
  | { kind: "error" };
