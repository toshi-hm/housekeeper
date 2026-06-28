#!/usr/bin/env node
// Supabase CLI generates `export type Foo = { ... }` for object types, but our
// lint rule (consistent-type-definitions) requires `interface` for those.
// This script converts only top-level object type aliases to interfaces.
import { readFileSync, writeFileSync } from "node:fs";

const filePath = new URL("../src/types/supabase.ts", import.meta.url).pathname;
const original = readFileSync(filePath, "utf8");

// Match `export type Foo = {` at the start of a line (object type alias only).
const result = original.replace(/^export type ([A-Za-z_]\w*) = \{$/gm, "export interface $1 {");

if (result === original) {
  console.log("fix-supabase-types: nothing to change");
} else {
  writeFileSync(filePath, result, "utf8");
  console.log("fix-supabase-types: converted type aliases to interfaces");
}
