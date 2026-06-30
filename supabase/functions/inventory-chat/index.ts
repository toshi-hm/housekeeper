import { queryGeminiChat } from "./gemini.ts";
import { fetchAllItems, fetchRecentlyConsumedItems, getUserScopedClient } from "./inventory.ts";
import type {
  ChatHistoryTurn,
  ChatMatchedItem,
  ChatRequest,
  ChatResponse,
  InventoryItem,
} from "./types.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_MESSAGE_LENGTH = 500;
const HISTORY_ROLES = new Set(["user", "model"]);

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const sanitizeHistory = (history: unknown): ChatHistoryTurn[] => {
  if (!Array.isArray(history)) return [];
  return history.flatMap((turn): ChatHistoryTurn[] => {
    if (!turn || typeof turn !== "object") return [];
    const t = turn as Record<string, unknown>;
    if (!HISTORY_ROLES.has(t.role as string) || typeof t.text !== "string") return [];
    return [{ role: t.role as "user" | "model", text: t.text.slice(0, MAX_MESSAGE_LENGTH) }];
  });
};

// Build the matched-item list from our own fetched data so the fields are
// authoritative; fall back to Gemini's name when an id is not found locally.
const buildMatchedItems = (
  geminiItems: ChatMatchedItem[],
  items: InventoryItem[],
): ChatMatchedItem[] => {
  const byId = new Map(items.map((it) => [it.id, it]));
  const seen = new Set<string>();
  const result: ChatMatchedItem[] = [];
  for (const gi of geminiItems) {
    if (seen.has(gi.id)) continue;
    seen.add(gi.id);
    const item = byId.get(gi.id);
    if (item) {
      result.push({
        id: item.id,
        name: item.name,
        total_remaining: gi.total_remaining,
        expiry_date: item.expiry_date,
        storage_location: item.storage_locations?.name ?? null,
      });
    } else {
      result.push({ id: gi.id, name: gi.name });
    }
  }
  return result;
};

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const supabase = getUserScopedClient(req.headers.get("Authorization"));
  if (!supabase) {
    return json({ error: "Unauthorized" }, 401);
  }

  let parsed: ChatRequest;
  try {
    parsed = (await req.json()) as ChatRequest;
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const message = typeof parsed.message === "string" ? parsed.message.trim() : "";
  if (!message) {
    return json({ error: "message is required" }, 400);
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return json({ error: "message is too long" }, 400);
  }
  const history = sanitizeHistory(parsed.history);

  const [items, recentlyConsumed] = await Promise.all([
    fetchAllItems(supabase),
    fetchRecentlyConsumedItems(supabase),
  ]);
  if (!items) {
    return json({ error: "Failed to load inventory" }, 500);
  }

  const result = await queryGeminiChat(message, history, items, recentlyConsumed);
  if (result.kind === "timeout") {
    return json({ error: "timeout" }, 504);
  }
  if (result.kind === "error") {
    return json({ error: "ai_error" }, 502);
  }

  const response: ChatResponse = {
    reply: result.data.reply,
    items: buildMatchedItems(result.data.items, items),
  };
  return json(response);
});
