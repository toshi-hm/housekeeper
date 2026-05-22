import type { AlexaResponse } from "../types.ts";
import { buildErrorResponse, buildTellResponse, buildTimeoutResponse } from "../response.ts";
import { fetchAllItems } from "../inventory.ts";
import { buildListByLocationPrompt, queryGemini } from "../gemini.ts";

export const handleListByLocation = async (location: string): Promise<AlexaResponse> => {
  if (!location) return buildErrorResponse("どこの在庫を確認しますか？");

  const items = await fetchAllItems();
  const result = await queryGemini(buildListByLocationPrompt(location), items);

  if (!result) return buildTimeoutResponse();

  return buildTellResponse(result.speech);
};
