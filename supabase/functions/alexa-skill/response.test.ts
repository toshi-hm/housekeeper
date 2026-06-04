import assert from "node:assert/strict";
import {
  buildAskResponse,
  buildErrorResponse,
  buildTellResponse,
  buildTimeoutResponse,
} from "./response.ts";

Deno.test("buildTellResponse - speech and shouldEndSession=true", () => {
  const res = buildTellResponse("テスト応答");
  assert.strictEqual(res.version, "1.0");
  assert.strictEqual(res.response.outputSpeech.type, "PlainText");
  assert.strictEqual(res.response.outputSpeech.text, "テスト応答");
  assert.strictEqual(res.response.shouldEndSession, true);
  assert.strictEqual(res.response.reprompt, undefined);
  assert.strictEqual(res.sessionAttributes, undefined);
});

Deno.test("buildTellResponse - with sessionAttributes", () => {
  const attrs = { pendingAction: "add_to_shopping_list" as const };
  const res = buildTellResponse("応答", attrs);
  assert.deepStrictEqual(res.sessionAttributes, attrs);
  assert.strictEqual(res.response.shouldEndSession, true);
});

Deno.test("buildAskResponse - shouldEndSession=false, reprompt present", () => {
  const res = buildAskResponse("質問", "再プロンプト", {});
  assert.strictEqual(res.version, "1.0");
  assert.strictEqual(res.response.shouldEndSession, false);
  assert.strictEqual(res.response.outputSpeech.text, "質問");
  assert.strictEqual(res.response.reprompt?.outputSpeech.type, "PlainText");
  assert.strictEqual(res.response.reprompt?.outputSpeech.text, "再プロンプト");
  assert.deepStrictEqual(res.sessionAttributes, {});
});

Deno.test("buildAskResponse - sessionAttributes passed through", () => {
  const attrs = { pendingQuery: "牛乳" };
  const res = buildAskResponse("質問", "再プロンプト", attrs);
  assert.deepStrictEqual(res.sessionAttributes, attrs);
});

Deno.test("buildErrorResponse - default message ends session", () => {
  const res = buildErrorResponse();
  assert.strictEqual(res.response.shouldEndSession, true);
  assert.strictEqual(res.response.reprompt, undefined);
  const text = res.response.outputSpeech.text ?? "";
  assert.ok(text.length > 0);
});

Deno.test("buildErrorResponse - custom message", () => {
  const res = buildErrorResponse("カスタムエラー");
  assert.strictEqual(res.response.outputSpeech.text, "カスタムエラー");
  assert.strictEqual(res.response.shouldEndSession, true);
});

Deno.test("buildTimeoutResponse - ends session with non-empty message", () => {
  const res = buildTimeoutResponse();
  assert.strictEqual(res.response.shouldEndSession, true);
  const text = res.response.outputSpeech.text ?? "";
  assert.ok(text.length > 0);
});
