import { isJsonObject } from "../_shared/json.ts";
import { checkChatRateLimit } from "../_shared/rate-limit.ts";
import { formatTotalRemaining, queryGeminiMealChat } from "./gemini.ts";
import { fetchPantryItems, getUserScopedClient } from "./pantry.ts";
import type { MealChatItem, MealChatRequest, MealChatResponse, PantryItem } from "./types.ts";
import { MAX_MESSAGE_LENGTH, parseChatLanguage, sanitizeHistory } from "./validation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, ...extraHeaders, "Content-Type": "application/json" },
  });

// Today in Japan (the app's only supported timezone) as YYYY-MM-DD, so expiry
// countdowns line up with what the UI shows regardless of the server's TZ.
const todayInJapan = (now = new Date()): string =>
  new Date(now.getTime() + 9 * 3_600_000).toISOString().slice(0, 10);

// Keep only items that really are in the pantry, filling the chip fields from
// our own data rather than trusting the model's copy. Hallucinated ids are
// dropped (unlike inventory-chat, a made-up "ingredient" has no honest name to
// fall back to).
export const buildUsedItems = (
  geminiItems: MealChatItem[],
  items: PantryItem[],
): MealChatItem[] => {
  const byId = new Map(items.map((it) => [it.id, it]));
  const seen = new Set<string>();
  const result: MealChatItem[] = [];
  for (const gi of geminiItems) {
    const item = byId.get(gi.id);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    result.push({
      id: item.id,
      name: item.name,
      total_remaining: formatTotalRemaining(item),
      expiry_date: item.expiry_date,
      storage_location: item.storage_locations?.name ?? null,
    });
  }
  return result;
};

export const handler = async (req: Request): Promise<Response> => {
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

  let parsed: MealChatRequest;
  try {
    const body: unknown = await req.json();
    if (!isJsonObject(body)) {
      return json({ error: "Invalid JSON body" }, 400);
    }
    parsed = body as unknown as MealChatRequest;
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
  const language = parseChatLanguage(parsed.language);

  // Shares the per-user chat quota with inventory-chat: both draw on the same
  // Gemini free tier, so one budget keeps the combined spend bounded.
  // Consume it only for well-formed requests so invalid bodies are free.
  const rateLimit = await checkChatRateLimit(supabase);
  if (!rateLimit.allowed) {
    return json({ error: "rate_limited" }, 429, {
      "Retry-After": String(rateLimit.retryAfterSeconds),
    });
  }

  const items = await fetchPantryItems(supabase);
  if (!items) {
    return json({ error: "Failed to load inventory" }, 500);
  }

  const result = await queryGeminiMealChat(message, history, items, todayInJapan(), language);
  if (result.kind === "timeout") {
    return json({ error: "timeout" }, 504);
  }
  if (result.kind === "error") {
    return json({ error: "ai_error" }, 502);
  }

  const response: MealChatResponse = {
    reply: result.data.reply,
    items: buildUsedItems(result.data.items, items),
  };
  return json(response);
};

if (import.meta.main) Deno.serve(handler);
