import type { AlexaResponse } from "../types.ts";
import { buildAskResponse } from "../response.ts";

// TODO: implement in feature/alexa-inventory-intents (#150)
export const handleCheckLocation = async (query: string): Promise<AlexaResponse> => {
  if (!query) {
    return buildAskResponse(
      "何の保管場所を確認しますか？商品名を教えてください。",
      "確認したい商品名を教えてください。",
      {},
    );
  }
  return buildAskResponse(`${query}の保管場所確認は準備中です。`, "他に確認することはありますか？", {});
};
