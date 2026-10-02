import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import { buildLowStockMessage, resolveLanguage } from "./content.ts";

Deno.test("low stock notification content is localized and limits displayed names", () => {
  assertEquals(resolveLanguage("en"), "en");
  assertEquals(resolveLanguage("fr"), "ja");
  const message = buildLowStockMessage("en", ["one", "two", "three", "four", "five", "six"]);
  assertEquals(message.title, "6 daily goods are low on stock");
  assertEquals(message.body, "Check whether you need to restock: one, two, three, four, five +1.");
  assertEquals(message.emailText, `${message.title}\n\n${message.body}`);
});

Deno.test("Japanese is the default notification language", () => {
  assertEquals(
    buildLowStockMessage(resolveLanguage(undefined), ["洗剤"]).title,
    "日用品の在庫が少ないものが1件あります",
  );
});
