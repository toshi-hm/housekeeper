import type { AlexaResponse } from "../types.ts";
import { buildErrorResponse } from "../response.ts";

// TODO: implement in feature/alexa-gemini-integration (#149) and feature/alexa-inventory-intents (#150)
export const handleCheckInventory = async (query: string): Promise<AlexaResponse> => {
  if (!query) return buildErrorResponse("何を調べますか？");
  // placeholder
  return buildErrorResponse(`${query}の在庫確認は準備中です。`);
};
