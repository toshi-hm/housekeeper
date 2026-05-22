import type { AlexaResponse } from "../types.ts";
import { buildErrorResponse, buildTellResponse, buildTimeoutResponse } from "../response.ts";
import { fetchAllItems } from "../inventory.ts";
import { buildCheckExpiryPrompt, queryGemini } from "../gemini.ts";

export const handleCheckExpiry = async (query: string): Promise<AlexaResponse> => {
  if (!query) return buildErrorResponse("何の賞味期限を確認しますか？");

  const items = await fetchAllItems();
  const result = await queryGemini(buildCheckExpiryPrompt(query), items);

  if (!result) return buildTimeoutResponse();

  return buildTellResponse(result.speech);
};
