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

- Overview:      docs/specs/overview.md
- Database:      docs/specs/database.md
- Architecture:  docs/specs/architecture.md
- Barcode:       docs/specs/features/barcode.md
- Inventory:     docs/specs/features/inventory.md
- Auth:          docs/specs/features/auth.md
- Expiry alerts: docs/specs/features/expiry-alert.md
- Architecture:  docs/specs/architecture.md (Atomic Design)
- Storybook:     docs/specs/storybook.md

## Commands
- Dev:    bun run dev
- Build:  bun run build
- Lint:   bunx oxlint .
- Format: bunx oxfmt .

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

