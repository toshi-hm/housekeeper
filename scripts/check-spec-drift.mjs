#!/usr/bin/env node
/**
 * Pragmatic spec-drift check (#464).
 *
 * Compares two cheap, machine-checkable proxies for "docs/specs vs
 * implementation" drift:
 *
 *   (a) Tables/columns documented in docs/specs/database.md (```sql
 *       `create table` blocks) vs tables/columns actually created by
 *       supabase/migrations/*.sql.
 *   (b) Route files listed in PLANS.md §3.1 (`src/routes/` fenced block) vs
 *       the actual files in src/routes/.
 *
 * This is deliberately a "first-order missing stuff" detector, not a full
 * schema/routing diff — regex-based extraction over SQL and a Markdown code
 * fence is fragile by nature. False positives are expected and meant to be
 * triaged by a human, which is why this runs non-blocking in CI for now (see
 * .github/workflows/_quality.yml and the PR that introduced this script for
 * the tradeoff writeup). Pass --strict to exit non-zero on any finding.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const strict = process.argv.includes("--strict");

const readText = (relPath) => readFileSync(join(ROOT, relPath), "utf8");

/** @returns {Map<string, Set<string>>} table name -> column names */
const parseCreateTableBlocks = (sql) => {
  const tables = new Map();
  const createTableRe =
    /create table\s+(?:if not exists\s+)?(?:\w+\.)?"?(\w+)"?\s*\(([\s\S]*?)\n\);/gi;
  let match;
  while ((match = createTableRe.exec(sql))) {
    const [, tableName, body] = match;
    const columns = new Set();
    for (const rawLine of body.split("\n")) {
      const line = rawLine.trim().replace(/,$/, "");
      if (!line) continue;
      const lower = line.toLowerCase();
      if (
        lower.startsWith("primary key") ||
        lower.startsWith("unique") ||
        lower.startsWith("check") ||
        lower.startsWith("foreign key") ||
        lower.startsWith("constraint") ||
        lower.startsWith("--")
      ) {
        continue;
      }
      const colMatch = line.match(/^"?(\w+)"?\s+\S/);
      if (colMatch) columns.add(colMatch[1]);
    }
    tables.set(tableName, columns);
  }
  return tables;
};

/** Merges columns added via `ALTER TABLE ... ADD COLUMN ...[, ADD COLUMN ...]` into `tables`. */
const mergeAlterTableColumns = (sql, tables) => {
  const statementRe = /alter table\s+(?:if exists\s+)?(?:\w+\.)?"?(\w+)"?\s+([\s\S]*?);/gi;
  let match;
  while ((match = statementRe.exec(sql))) {
    const [, tableName, body] = match;
    const addColumnRe = /add column\s+(?:if not exists\s+)?"?(\w+)"?/gi;
    let colMatch;
    while ((colMatch = addColumnRe.exec(body))) {
      if (!tables.has(tableName)) tables.set(tableName, new Set());
      tables.get(tableName).add(colMatch[1]);
    }
  }
};

const checkDatabaseSpec = () => {
  const findings = [];
  const specSql = readText("docs/specs/database.md");
  const documented = parseCreateTableBlocks(specSql);

  const migrationsDir = join(ROOT, "supabase/migrations");
  const migrationFiles = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));
  const actual = new Map();
  for (const file of migrationFiles) {
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    const created = parseCreateTableBlocks(sql);
    for (const [table, cols] of created) {
      if (!actual.has(table)) actual.set(table, new Set());
      for (const c of cols) actual.get(table).add(c);
    }
    mergeAlterTableColumns(sql, actual);
  }

  for (const [table, docCols] of documented) {
    if (!actual.has(table)) {
      findings.push(
        `[database] docs/specs/database.md documents table "${table}" but no migration creates it.`,
      );
      continue;
    }
    const actualCols = actual.get(table);
    for (const col of docCols) {
      if (!actualCols.has(col)) {
        findings.push(
          `[database] docs/specs/database.md documents column "${table}.${col}" but it was not found in supabase/migrations/*.sql.`,
        );
      }
    }
  }

  for (const table of actual.keys()) {
    if (!documented.has(table)) {
      findings.push(
        `[database] table "${table}" exists in supabase/migrations/*.sql but is not documented in docs/specs/database.md.`,
      );
    }
  }

  return findings;
};

const checkRoutingSpec = () => {
  const findings = [];
  const plans = readText("PLANS.md");
  const fenceMatch = plans.match(/```\nsrc\/routes\/\n([\s\S]*?)```/);
  if (!fenceMatch) {
    findings.push(
      "[routing] Could not find the src/routes/ fenced block in PLANS.md §3.1 — check hasn't drifted itself.",
    );
    return findings;
  }
  const documentedRoutes = new Set(
    fenceMatch[1]
      .split("\n")
      .map((line) => line.trim().split(/\s+/)[0])
      .filter((token) => token && token.endsWith(".tsx")),
  );

  const routesDir = join(ROOT, "src/routes");
  const actualRoutes = new Set(
    readdirSync(routesDir).filter(
      (f) =>
        (f.endsWith(".tsx") || f.endsWith(".ts")) && !f.startsWith("-") && !f.includes(".test."),
    ),
  );

  for (const route of documentedRoutes) {
    if (!actualRoutes.has(route)) {
      findings.push(
        `[routing] PLANS.md §3.1 lists "${route}" but src/routes/${route} does not exist.`,
      );
    }
  }
  for (const route of actualRoutes) {
    if (route === "__root.tsx") continue;
    if (!documentedRoutes.has(route)) {
      findings.push(`[routing] src/routes/${route} exists but is not listed in PLANS.md §3.1.`);
    }
  }

  return findings;
};

const findings = [...checkDatabaseSpec(), ...checkRoutingSpec()];

if (findings.length === 0) {
  console.log("spec-drift-check: no drift detected.");
  process.exit(0);
}

console.log(`spec-drift-check: ${findings.length} potential drift finding(s):\n`);
for (const f of findings) console.log(`  - ${f}`);
console.log(
  "\nThese are heuristic findings (regex-based extraction), not guaranteed bugs — please verify and either fix the docs/implementation or add a note if intentional.",
);

process.exit(strict ? 1 : 0);
