import type { AlexaResponse } from "../types.ts";
import { buildAskResponse } from "../response.ts";

// TODO: implement in feature/alexa-inventory-intents (#150)
export const handleCheckInventory = async (query: string): Promise<AlexaResponse> => {
  if (!query) {
    return buildAskResponse(
      "何を調べますか？商品名を教えてください。",
      "確認したい商品名を教えてください。",
      {},
    );
  }
  return buildAskResponse(`${query}の在庫確認は準備中です。`, "他に確認することはありますか？", {});
};
