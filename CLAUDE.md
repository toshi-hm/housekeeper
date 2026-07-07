# housekeeper — CLAUDE.md

## Project Overview

Self-hosted home inventory management web app.
Single user. No public-facing features. CRUD-centric.

## Tech Stack

- Vite + React 19 + TypeScript (strict)
- TanStack Router (file-based routing)
- TanStack Query v5
- Supabase (client-side only, RLS + Auth)
- Tailwind CSS v4 + shadcn/ui
- Zod (validation)
- oxlint / oxfmt (lint/format)
- Package manager: bun (always use bun, never npm/yarn)
- Component Design: Atomic Design
- Component Documentation: Storybook 10

## Key Constraints

- NO backend server. All Supabase access is client-side only.
- Barcode external API calls → Supabase Edge Functions only (CORS avoidance)
- Mobile-first UI
- Always install the latest version of any new library

## Specs

Full specifications are in docs/specs/.
Read the relevant spec file before implementing any feature.

- Overview: docs/specs/overview.md
- Database: docs/specs/database.md
- Architecture: docs/specs/architecture.md (Atomic Design)
- Storybook: docs/specs/storybook.md
- Auth: docs/specs/features/auth.md
- Inventory: docs/specs/features/inventory.md
- Barcode: docs/specs/features/barcode.md
- Expiry alerts: docs/specs/features/expiry-alert.md
- Master data (categories/locations): docs/specs/features/master-data.md
- Image storage: docs/specs/features/storage.md
- Shopping list: docs/specs/features/shopping-list.md
- Consumption & purchase history: docs/specs/features/consumption-purchase.md
- Notifications: docs/specs/features/notifications.md
- PWA / Offline: docs/specs/features/pwa.md
- i18n: docs/specs/features/i18n.md
- Stats: docs/specs/features/stats.md

## TODO / Progress

- PLANS.md is the single source of truth for roadmap and TODO.
- Phases: v1 (MVP) → v1.1 → v1.2 → v1.3 → Backlog.

### issue-sync Skill（自動発動）

以下のいずれかに該当するときは **必ず** `.claude/skills/issue-sync/SKILL.md` を読み込んで実行すること:

- 「PLANS.md を GitHub と同期」「issue を起票して」「未起票タスクを Issue 化」など、PLANS.md と GitHub Issues の同期を求められた
- 「issue-sync」「issue sync」という言葉が出た
- PLANS.md のチェックボックスを更新した後に「Issues に反映して」と言われた

## Skills

`.claude/skills/` に定期作業のスキルを同梱している。該当する依頼が来たら **対応する SKILL.md を読み込んでから** 作業すること。
設計方針とカタログは `docs/skills/README.md` を参照。

| スキル              | 使いどき                                                      |
| ------------------- | ------------------------------------------------------------- |
| `react-component`   | 新規コンポーネント作成（Atomic 分類 → 実装 → Story → テスト） |
| `ts-quality`        | TypeScript の実装・リファクタリング（strict 規約の適用）      |
| `unit-test`         | 単体テストの作成・修正（bun test 基盤）                       |
| `pwa-doctor`        | PWA / オフライン / Service Worker の診断・修正                |
| `uiux-review`       | UI/UX・アクセシビリティのレビュー                             |
| `feature-proposal`  | 新機能の提案 → spec ドラフト → PLANS.md 反映                  |
| `issue-sync`        | PLANS.md ⇔ GitHub Issues の同期（上記参照）                   |
| `recipe-from-stock` | 在庫から献立・レシピ提案（生活系）                            |
| `pantry-review`     | 週次の在庫・期限・食品ロスレビュー（生活系）                  |

## Commands

- Dev: `bun run dev`
- Build: `bun run build`
- Lint: `bun run lint` (oxlint + eslint)
- Typecheck: `bun run typecheck` (tsc --noEmit)
- Format check: `bun run format:check` (oxfmt --check)
- Format (fix): `bun run format` (oxfmt .)
- **全チェック（コミット前に必ず実行）**: `bun run format:check && bun run check`
  - `bun run check` は lint + typecheck をまとめて実行する

## セッション終了前の必須チェックリスト

**毎回セッションの最後に必ず実行すること:**

```bash
npx oxfmt . && bun run check
```

- `npx oxfmt .` — フォーマット自動修正（`bun run format` が使えない場合の代替）
- `bun run check` — lint + typecheck
- フォーマット差分や型エラーが出たら修正してからコミット・プッシュする

## Code Style

- Always use TypeScript strict mode
- No `any`. Use `unknown` + Zod if type is unclear.
- shadcn/ui components go in src/components/ui/
- Custom hooks go in src/hooks/
- Supabase client is initialized only in src/lib/supabase.ts
- 新しいコンポーネントを作るとき、必ずdocs/specs/architecture.mdの
  Atomic Design分類を確認してから配置する
- atoms / molecules / organismsを作ったら、必ず .stories.tsx を同時に作成する
- Storyの規約はdocs/specs/storybook.mdに従う

### i18n キーの動的参照ルール

- `t()` には**文字列リテラル**を渡すのが基本（`t("foo.bar")`）。
- 動的にキーを切り替える場合は、**テンプレートリテラル連結を避け**、`as const satisfies Record<Union, string>` な
  Key Map 経由で参照する（型安全 + 網羅チェック）。例:
  ```ts
  const labelKey = {
    a: "fooA",
    b: "fooB",
  } as const satisfies Record<MyUnion, string>;
  t(labelKey[value]);
  ```
- **重要**: i18next-parser は `t()` の文字列リテラルしか抽出できず、Key Map / 変数経由のキーは
  抽出できない。よって `i18next-parser.config.ts` は `keepRemoved: true`（生きたキーを消さない）。
  動的参照キーや、保存先と実行時 namespace が異なるキーは**手動で管理**する。デッドキーの掃除も手動。

### TypeScript 記法ルール（lintで強制）

- **関数定義**: `function` 宣言は使わず、必ず `const hoge = () => {}` で記載する
- **型定義**: `type` ではなく `interface` を使う（ユニオン型など`interface`で表現できない場合は除く）
- **type import**: 型のみのimportは必ず `import type` または `import { type Foo }` を使う
  ```ts
  // NG
  import { Foo } from "./foo";
  // OK
  import type { Foo } from "./foo";
  import { type Foo } from "./foo";
  ```
- **import順序**: ESLintの `simple-import-sort` で自動整列（`bun run lint` で検出、IDEの自動修正も可）
