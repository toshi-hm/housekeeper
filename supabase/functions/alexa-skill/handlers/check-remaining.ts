import type { AlexaResponse } from "../types.ts";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  buildAskResponse,
  buildErrorResponse,
  buildTellResponse,
  buildTimeoutResponse,
} from "../response.ts";
import { fetchAllItems, fetchRecentlyConsumedItems } from "../inventory.ts";
import { buildCheckRemainingPrompt, queryGemini } from "../gemini.ts";

export const handleCheckRemaining = async (
  query: string,
  supabase: SupabaseClient,
): Promise<AlexaResponse> => {
  if (!query) {
    return buildAskResponse(
      "何の残量を確認しますか？商品名を教えてください。",
      "確認したい商品名を教えてください。",
      {},
    );
  }

  const [items, recentlyConsumed] = await Promise.all([
    fetchAllItems(supabase),
    fetchRecentlyConsumedItems(supabase),
  ]);
  if (!items) return buildErrorResponse("在庫情報の取得に失敗しました。");

  const geminiResult = await queryGemini(
    buildCheckRemainingPrompt(query),
    items,
    recentlyConsumed ?? [],
  );
  if (geminiResult.kind === "timeout") return buildTimeoutResponse();
  if (geminiResult.kind === "error") return buildErrorResponse();

  return buildTellResponse(geminiResult.data.speech);
};
