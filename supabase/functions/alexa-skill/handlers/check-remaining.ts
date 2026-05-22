import type { AlexaResponse } from "../types.ts";
import { buildErrorResponse } from "../response.ts";

// TODO: implement in feature/alexa-inventory-intents (#150)
export const handleCheckRemaining = async (query: string): Promise<AlexaResponse> => {
  if (!query) return buildErrorResponse("何の残量を確認しますか？");
  return buildErrorResponse(`${query}の残量確認は準備中です。`);
};
