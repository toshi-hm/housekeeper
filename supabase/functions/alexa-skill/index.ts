import type { AlexaRequest, AlexaResponse, SessionAttributes } from "./types.ts";
import {
  buildAskResponse,
  buildErrorResponse,
  buildTellResponse,
} from "./response.ts";

const ALEXA_SKILL_ID = Deno.env.get("ALEXA_SKILL_ID") ?? "";

const verifyApplicationId = (req: AlexaRequest): boolean => {
  if (!ALEXA_SKILL_ID) {
    console.error("[alexa-skill] ALEXA_SKILL_ID is not configured — rejecting request");
    return false;
  }
  const appId =
    req.session?.application?.applicationId ??
    req.context?.System?.application?.applicationId;
  return appId === ALEXA_SKILL_ID;
};

const verifyTimestamp = (req: AlexaRequest): boolean => {
  const timestamp = req.request.timestamp;
  if (!timestamp) return false;
  const diffSeconds = Math.abs(Date.now() - new Date(timestamp).getTime()) / 1000;
  return diffSeconds <= 150;
};

const handleLaunch = (): AlexaResponse =>
  buildAskResponse(
    "ハウスキーパーを開きました。在庫について何でも聞いてください。たとえば「牛乳はある？」などと話しかけてみてください。",
    "何を確認しますか？",
    {},
  );

const handleSessionEnded = (): AlexaResponse =>
  buildTellResponse("またお気軽にどうぞ。");

const handleHelp = (): AlexaResponse =>
  buildAskResponse(
    "在庫の確認ができます。「牛乳はある？」「賞味期限は？」「冷蔵庫に何がある？」「どこにある？」「あとどれくらい残ってる？」などと話しかけてください。",
    "何を確認しますか？",
    {},
  );

const handleStop = (): AlexaResponse =>
  buildTellResponse("ハウスキーパーを終了します。");

const routeIntent = async (
  intentName: string,
  slots: Record<string, { name: string; value?: string }>,
  sessionAttributes: SessionAttributes,
): Promise<AlexaResponse> => {
  switch (intentName) {
    case "AMAZON.HelpIntent":
      return handleHelp();

    case "AMAZON.StopIntent":
    case "AMAZON.CancelIntent":
      return handleStop();

    case "AMAZON.YesIntent":
    case "AMAZON.NoIntent": {
      const { handleYesNo } = await import("./handlers/yes-no.ts");
      return handleYesNo(intentName === "AMAZON.YesIntent", sessionAttributes);
    }

    case "CheckInventoryIntent": {
      const { handleCheckInventory } = await import("./handlers/check-inventory.ts");
      return handleCheckInventory(slots["ItemQuery"]?.value ?? "");
    }

    case "CheckExpiryIntent": {
      const { handleCheckExpiry } = await import("./handlers/check-expiry.ts");
      return handleCheckExpiry(slots["ItemQuery"]?.value ?? "");
    }

    case "ListByLocationIntent": {
      const { handleListByLocation } = await import("./handlers/list-by-location.ts");
      return handleListByLocation(slots["LocationQuery"]?.value ?? "");
    }

    case "CheckLocationIntent": {
      const { handleCheckLocation } = await import("./handlers/check-location.ts");
      return handleCheckLocation(slots["ItemQuery"]?.value ?? "");
    }

    case "CheckRemainingIntent": {
      const { handleCheckRemaining } = await import("./handlers/check-remaining.ts");
      return handleCheckRemaining(slots["ItemQuery"]?.value ?? "");
    }

    case "AddToShoppingListIntent": {
      const { handleAddToShoppingList } = await import("./handlers/add-to-shopping-list.ts");
      return handleAddToShoppingList(
        slots["ItemQuery"]?.value ?? "",
        sessionAttributes,
      );
    }

    default:
      return buildErrorResponse("そのリクエストには対応していません。");
  }
};

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body = (await req.json()) as AlexaRequest;

    if (!verifyApplicationId(body)) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!verifyTimestamp(body)) {
      return new Response(JSON.stringify({ error: "Request timestamp out of range" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const sessionAttributes = (body.session?.attributes ?? {}) as SessionAttributes;
    let alexaResponse: AlexaResponse;

    if (body.request.type === "LaunchRequest") {
      alexaResponse = handleLaunch();
    } else if (body.request.type === "SessionEndedRequest") {
      alexaResponse = handleSessionEnded();
    } else if (body.request.type === "IntentRequest") {
      const { intent } = body.request;
      alexaResponse = await routeIntent(
        intent.name,
        intent.slots ?? {},
        sessionAttributes,
      );
    } else {
      alexaResponse = buildErrorResponse();
    }

    return new Response(JSON.stringify(alexaResponse), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[alexa-skill] Error:", err);
    return new Response(JSON.stringify(buildErrorResponse()), {
      headers: { "Content-Type": "application/json" },
    });
  }
});
