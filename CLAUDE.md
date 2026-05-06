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

## Commands

- Dev: `bun run dev`
- Build: `bun run build`
- Lint: `bun run lint` (oxlint + eslint)
- Typecheck: `bun run typecheck` (tsc --noEmit)
- Format check: `bun run format:check` (oxfmt --check)
- Format (fix): `bun run format` (oxfmt .)
- **全チェック（コミット前に必ず実行）**: `bun run format:check && bun run check`
  - `bun run check` は lint + typecheck をまとめて実行する

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
