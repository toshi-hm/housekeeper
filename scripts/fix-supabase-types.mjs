#!/usr/bin/env node
// Post-processes `supabase gen types` output so the checked-in file is
// reproducible from the hosted schema (CI compares the two).
//
// 1. Supabase CLI generates `export type Foo = { ... }` for object types, but
//    our lint rule (consistent-type-definitions) requires `interface` for
//    those. Only top-level object type aliases are converted.
// 2. Postgres cannot express some facts the app relies on, so they are applied
//    here instead of hand-editing the generated file (which CI would flag as
//    drift on every run):
//    - household_id is filled by a BEFORE INSERT trigger
//      (private.assign_current_household_id), so clients must not have to
//      send it: it is optional on `Insert` for the tables that have the trigger.
//    - the save_* RPCs take `p_id uuid` where NULL means "create".
//    - notification_failures' CHECK constraints are narrower than `string`.
import { readFileSync, writeFileSync } from "node:fs";

const filePath = new URL("../src/types/supabase.ts", import.meta.url).pathname;
const original = readFileSync(filePath, "utf8");

// Tables with a household_id auto-assign trigger (see supabase/migrations).
const HOUSEHOLD_AUTO_ASSIGN_TABLES = [
  "categories",
  "consumption_logs",
  "custom_units",
  "item_lots",
  "item_tags",
  "items",
  "items_to_tags",
  "recipe_items",
  "recipes",
  "shopping_list_archive",
  "shopping_list_items",
  "shopping_list_template_items",
  "shopping_list_templates",
  "storage_locations",
];

const NULLABLE_P_ID_FUNCTIONS = ["save_recipe", "save_shopping_list_template"];

const NOTIFICATION_FAILURE_UNIONS = {
  channel: '"push" | "email"',
  notification_type: '"expiry" | "waste_digest" | "low_stock"',
  failure_code: [
    "push_config_missing",
    "push_subscriptions_unavailable",
    "push_no_subscriptions",
    "push_delivery_failed",
    "email_config_missing",
    "email_address_missing",
    "email_delivery_failed",
  ]
    .map((code) => `"${code}"`)
    .join(" | "),
};

// Applies `transform` to the text of one `      <name>: {` block that ends at
// the next line with the same indentation (tables and functions both use 6
// spaces under `Tables:` / `Functions:`).
const transformBlock = (source, name, transform) => {
  const start = source.search(new RegExp(`^      ${name}: \\{$`, "m"));
  if (start === -1) return source;
  const rest = source.slice(start);
  const length = rest.search(/\n {6}\}[;,]?\n/);
  if (length === -1) return source;
  const end = start + length;
  return source.slice(0, start) + transform(source.slice(start, end)) + source.slice(end);
};

let result = original.replace(/^export type ([A-Za-z_]\w*) = \{$/gm, "export interface $1 {");

for (const table of HOUSEHOLD_AUTO_ASSIGN_TABLES) {
  result = transformBlock(result, table, (block) =>
    block.replace(/(Insert: \{[\s\S]*?\n {8}\})/, (insert) =>
      insert.replace(/household_id: string/, "household_id?: string"),
    ),
  );
}

for (const fn of NULLABLE_P_ID_FUNCTIONS) {
  result = transformBlock(result, fn, (block) =>
    block.replace(/p_id: string(?! \|)/, "p_id: string | null"),
  );
}

result = transformBlock(result, "notification_failures", (block) => {
  let next = block;
  for (const [column, union] of Object.entries(NOTIFICATION_FAILURE_UNIONS)) {
    next = next.replace(new RegExp(`(\\n\\s+${column}\\??: )string`, "g"), `$1${union}`);
  }
  return next;
});

if (result === original) {
  console.log("fix-supabase-types: nothing to change");
} else {
  writeFileSync(filePath, result, "utf8");
  console.log("fix-supabase-types: post-processed generated types");
}
