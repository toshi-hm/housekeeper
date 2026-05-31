import type { AlexaResponse } from "../types.ts";
import {
  buildAskResponse,
  buildErrorResponse,
  buildTellResponse,
  buildTimeoutResponse,
} from "../response.ts";
import { fetchAllItems, fetchRecentlyConsumedItems } from "../inventory.ts";
import { buildCheckInventoryPrompt, queryGemini } from "../gemini.ts";

export const handleCheckInventory = async (query: string): Promise<AlexaResponse> => {
  if (!query) {
    return buildAskResponse(
      "何を調べますか？商品名を教えてください。",
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
    buildCheckInventoryPrompt(query),
    items,
    recentlyConsumed ?? [],
  );
  if (geminiResult.kind === "timeout") return buildTimeoutResponse();
  if (geminiResult.kind === "error") return buildErrorResponse();

  return buildTellResponse(geminiResult.data.speech);
};
