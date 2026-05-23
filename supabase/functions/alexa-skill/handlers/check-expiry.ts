import type { AlexaResponse } from "../types.ts";
import {
  buildAskResponse,
  buildErrorResponse,
  buildTellResponse,
  buildTimeoutResponse,
} from "../response.ts";
import { fetchAllItems, formatExpiryDate } from "../inventory.ts";
import { buildCheckExpiryPrompt, queryGemini } from "../gemini.ts";

export const handleCheckExpiry = async (query: string): Promise<AlexaResponse> => {
  if (!query) {
    return buildAskResponse(
      "何の賞味期限を確認しますか？商品名を教えてください。",
      "確認したい商品名を教えてください。",
      {},
    );
  }

  const items = await fetchAllItems();
  if (!items) return buildErrorResponse("在庫情報の取得に失敗しました。");

  const geminiResult = await queryGemini(buildCheckExpiryPrompt(query), items);
  if (geminiResult.kind === "timeout") return buildTimeoutResponse();
  if (geminiResult.kind === "error") return buildErrorResponse();

  const result = geminiResult.data;

  // expiry_date未設定はコード側で保証（Gemini生成文に依存しない）
  if (result.stockStatus === "in_stock" && result.matchedItems.length > 0) {
    const item = result.matchedItems[0];
    if (!item.expiry_date) {
      return buildTellResponse(`${item.name}の賞味期限は登録されていません。`);
    }
    return buildTellResponse(`${item.name}の賞味期限は${formatExpiryDate(item.expiry_date)}です。`);
  }

  return buildTellResponse(result.speech);
};
