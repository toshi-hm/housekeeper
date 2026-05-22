import type { AlexaResponse } from "../types.ts";
import { buildErrorResponse, buildTellResponse, buildTimeoutResponse } from "../response.ts";
import { fetchAllItems } from "../inventory.ts";
import { buildCheckLocationPrompt, queryGemini } from "../gemini.ts";

export const handleCheckLocation = async (query: string): Promise<AlexaResponse> => {
  if (!query) return buildErrorResponse("何の保管場所を確認しますか？");

  const items = await fetchAllItems();
  const result = await queryGemini(buildCheckLocationPrompt(query), items);

  if (!result) return buildTimeoutResponse();

  return buildTellResponse(result.speech);
};
