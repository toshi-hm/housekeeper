import type { AlexaResponse } from "../types.ts";
import {
  buildAskResponse,
  buildErrorResponse,
  buildTellResponse,
  buildTimeoutResponse,
} from "../response.ts";
import { fetchAllItems, fetchRecentlyConsumedItems } from "../inventory.ts";
import { buildCheckRemainingPrompt, queryGemini } from "../gemini.ts";

export const handleCheckRemaining = async (query: string): Promise<AlexaResponse> => {
  if (!query) {
    return buildAskResponse(
      "何の残量を確認しますか？商品名を教えてください。",
      "確認したい商品名を教えてください。",
      {},
    );
  }

  const [items, recentlyConsumed] = await Promise.all([
    fetchAllItems(),
    fetchRecentlyConsumedItems(),
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
