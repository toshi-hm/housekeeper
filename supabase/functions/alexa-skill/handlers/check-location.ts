import type { AlexaResponse } from "../types.ts";
import { buildErrorResponse } from "../response.ts";

// TODO: implement in feature/alexa-inventory-intents (#150)
export const handleCheckLocation = async (query: string): Promise<AlexaResponse> => {
  if (!query) return buildErrorResponse("何の保管場所を確認しますか？");
  return buildErrorResponse(`${query}の保管場所確認は準備中です。`);
};
