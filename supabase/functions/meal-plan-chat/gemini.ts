import type {
  ChatHistoryTurn,
  ChatLanguage,
  GeminiContent,
  GeminiRequest,
  GeminiResponse,
  GeminiResult,
  MealChatItem,
  MealChatResponse,
  PantryItem,
} from "./types.ts";

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_TIMEOUT_MS = 20000;
// Cap history to keep token usage within the free tier.
const MAX_HISTORY_TURNS = 8;
const MS_PER_DAY = 86_400_000;

// Total remaining amount as a human-readable string (e.g. "1.5L", "3個").
export const formatTotalRemaining = (item: PantryItem): string => {
  const { units, content_amount, content_unit, opened_remaining } = item;
  const closedUnits = opened_remaining !== null ? Math.max(units - 1, 0) : units;
  const total = closedUnits * content_amount + (opened_remaining ?? 0);
  const rounded = Number.isInteger(total) ? total : Math.round(total * 100) / 100;
  return `${rounded}${content_unit}`;
};

// Whole days from `today` (YYYY-MM-DD) until `expiry` (YYYY-MM-DD); negative
// when already past. Both are parsed as UTC midnight so DST can't skew it.
export const daysUntil = (expiry: string, today: string): number =>
  Math.round((Date.parse(expiry) - Date.parse(today)) / MS_PER_DAY);

const isValidItem = (item: unknown): item is MealChatItem => {
  if (!item || typeof item !== "object") return false;
  const it = item as Record<string, unknown>;
  return typeof it.id === "string" && typeof it.name === "string";
};

export const isValidMealChatResult = (data: unknown): data is MealChatResponse => {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return typeof d.reply === "string" && Array.isArray(d.items) && d.items.every(isValidItem);
};

// Pantry as JSON for the prompt. Soonest-expiring first so the model sees the
// "use it up" candidates at the top; items without an expiry date go last.
export const buildPantryContext = (items: PantryItem[], today: string): string => {
  const list = items
    .map((item) => ({
      id: item.id,
      name: item.name,
      category: item.categories?.name ?? null,
      storage_location: item.storage_locations?.name ?? null,
      total_remaining: formatTotalRemaining(item),
      expiry_date: item.expiry_date,
      days_until_expiry: item.expiry_date ? daysUntil(item.expiry_date, today) : null,
    }))
    .sort((a, b) => {
      if (a.days_until_expiry === null && b.days_until_expiry === null) return 0;
      if (a.days_until_expiry === null) return 1;
      if (b.days_until_expiry === null) return -1;
      return a.days_until_expiry - b.days_until_expiry;
    });
  return JSON.stringify({ today, pantry: list });
};

const SYSTEM_PROMPT_JA = `あなたは家庭の献立考案アシスタントです。
ユーザーとチャット形式で会話し、提供された食材の在庫データ(pantry)をもとに、今日の晩ごはんや数日分の献立・レシピを提案します。

ルール:
- 回答(reply)は日本語の自然な会話文で、簡潔に。マークダウンの見出しや表は使わず、必要なら箇条書き程度に留める。
- 賞味期限が近い食材(days_until_expiry が小さい、負は期限切れ)を優先して使う献立を提案する。期限切れの食材は使わず、必要なら注意を促す。
- 提案は料理名と、使う在庫食材、足りずに買い足しが必要な食材(あれば)を示す。在庫にない食材を「ある」と言わない。
- 作り方を聞かれたら、手順を3〜6ステップ程度で簡潔に説明する。
- 人数・好み・アレルギー・調理時間などの条件がユーザーから示されたら必ず守る。
- 数日分を頼まれたら、同じ食材に偏らず、日ごとに分けて示す。
- 食材の在庫が少なくて献立が組めないときは、その旨と買い足し案を伝える。
- 献立・料理に無関係な質問には、献立アシスタントである旨を伝えて丁寧にお断りする。
- items には提案した献立で使う在庫食材(idは pantry のid をそのまま使う)のみを入れる。該当なしなら空配列。
- 必ず指定のJSONスキーマで返し、それ以外のテキストは含めないこと。`;

const SYSTEM_PROMPT_EN = `You are a household meal-planning assistant.
You chat with the user and propose tonight's dinner or multi-day menus and recipes based on the provided pantry data (pantry).

Rules:
- Write the reply in natural, concise English conversational text. Do not use markdown headings or tables; a short bullet list is fine if needed.
- Prefer ingredients that expire soon (small days_until_expiry; negative means already expired). Never use expired ingredients, and warn about them if relevant.
- For each suggestion, give the dish name, the pantry ingredients it uses, and any ingredients that must be bought (if any). Never claim an ingredient is on hand when it is not in the pantry.
- If asked how to cook something, explain it briefly in roughly 3-6 steps.
- Always respect conditions the user gives (number of people, preferences, allergies, cooking time).
- If asked for several days, vary the ingredients and present the menu day by day.
- If the pantry is too thin to plan a meal, say so and suggest what to buy.
- Politely decline questions unrelated to meals or cooking, explaining that you are a meal-planning assistant.
- Only include pantry items used by the proposed menu in items (reuse the id from the pantry data as-is). Use an empty array if none apply.
- Always respond using the specified JSON schema and include no other text.`;

const getSystemPrompt = (language: ChatLanguage): string =>
  language === "en" ? SYSTEM_PROMPT_EN : SYSTEM_PROMPT_JA;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          total_remaining: { type: "string" },
          expiry_date: { type: "string", nullable: true },
          storage_location: { type: "string", nullable: true },
        },
        required: ["id", "name"],
      },
    },
  },
  required: ["reply", "items"],
};

// Build the Gemini `contents` array. Gemini requires strictly alternating
// user/model turns starting with "user", so history is capped, leading
// non-user turns are dropped, and consecutive same-role turns collapse to the
// most recent one (defense in depth against a malformed client history).
export const buildContents = (message: string, history: ChatHistoryTurn[]): GeminiContent[] => {
  let trimmed = history.slice(-MAX_HISTORY_TURNS);
  while (trimmed.length > 0 && trimmed[0].role !== "user") {
    trimmed = trimmed.slice(1);
  }
  const turns: ChatHistoryTurn[] = [...trimmed, { role: "user", text: message }];

  const sanitized: ChatHistoryTurn[] = [];
  for (const turn of turns) {
    if (sanitized.length > 0 && sanitized[sanitized.length - 1].role === turn.role) {
      sanitized.pop();
    }
    sanitized.push(turn);
  }

  return sanitized.map((turn) => ({ role: turn.role, parts: [{ text: turn.text }] }));
};

export const buildGeminiRequestBody = (
  message: string,
  history: ChatHistoryTurn[],
  items: PantryItem[],
  today: string,
  language: ChatLanguage = "ja",
): GeminiRequest => ({
  systemInstruction: {
    parts: [
      {
        text: `${getSystemPrompt(language)}\n\n食材データ(today=今日の日付, pantry=現在の食材在庫):\n${buildPantryContext(items, today)}`,
      },
    ],
  },
  contents: buildContents(message, history),
  generationConfig: {
    responseMimeType: "application/json",
    responseSchema: RESPONSE_SCHEMA,
    // Slightly warmer than inventory-chat: menu ideas benefit from variety.
    temperature: 0.7,
    thinkingConfig: { thinkingBudget: 1024 },
  },
});

export const queryGeminiMealChat = async (
  message: string,
  history: ChatHistoryTurn[],
  items: PantryItem[],
  today: string,
  language: ChatLanguage = "ja",
): Promise<GeminiResult> => {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    console.error("[meal-plan-chat] GEMINI_API_KEY is not configured");
    return { kind: "error" };
  }

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
  const body = buildGeminiRequestBody(message, history, items, today, language);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      console.error("[meal-plan-chat] Gemini timeout after", GEMINI_TIMEOUT_MS, "ms");
      return { kind: "timeout" };
    }
    console.error("[meal-plan-chat] Gemini fetch error:", e);
    return { kind: "error" };
  } finally {
    clearTimeout(timeoutId);
  }

  try {
    if (!res.ok) {
      console.error("[meal-plan-chat] Gemini API error:", res.status, await res.text());
      return { kind: "error" };
    }

    const json = (await res.json()) as GeminiResponse;
    const parts = json.candidates?.[0]?.content?.parts ?? [];
    const text = parts.find((p) => !p.thought)?.text;
    if (!text) {
      console.error("[meal-plan-chat] Empty response from Gemini");
      return { kind: "error" };
    }

    const parsed: unknown = JSON.parse(text);
    if (!isValidMealChatResult(parsed)) {
      console.error(
        "[meal-plan-chat] Response schema mismatch:",
        JSON.stringify(parsed).slice(0, 200),
      );
      return { kind: "error" };
    }
    return { kind: "ok", data: parsed };
  } catch (err) {
    console.error("[meal-plan-chat] Gemini parse error:", err);
    return { kind: "error" };
  }
};
