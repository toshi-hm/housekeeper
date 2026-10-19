import { assertEquals } from "jsr:@std/assert@1";

import { isJsonObject } from "./json.ts";

Deno.test("isJsonObject: オブジェクトのみ true", () => {
  assertEquals(isJsonObject({}), true);
  assertEquals(isJsonObject({ a: 1 }), true);
});

Deno.test("isJsonObject: null / 配列 / プリミティブは false", () => {
  assertEquals(isJsonObject(null), false);
  assertEquals(isJsonObject([]), false);
  assertEquals(isJsonObject("x"), false);
  assertEquals(isJsonObject(1), false);
  assertEquals(isJsonObject(undefined), false);
});
