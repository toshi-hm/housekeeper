# Copilot Instructions — housekeeper

## Project
Personal home inventory app. Vite + React 19 + TypeScript.
Single user, no public traffic. CRUD-focused.

## Always follow these rules
- Package manager: bun only
- No backend server — Supabase client-side only (RLS handles auth)
- No `any` in TypeScript
- New libraries: always install latest version
- Lint: oxlint / Format: oxfmt

## Routing convention (TanStack Router, file-based)
- Authenticated pages: src/routes/_auth.*.tsx
- Public pages: src/routes/login.tsx
- Root layout: src/routes/__root.tsx

## Supabase convention
- Client singleton: src/lib/supabase.ts のみで初期化
- Auth state: src/hooks/ のカスタムフックで管理
- Direct DB access from components is forbidden

## Spec files
Feature details are in docs/specs/features/.
When implementing a feature, reference the corresponding spec file.

## Component Structure: Atomic Design
- atoms:      src/components/atoms/     — props依存のみ、外部状態なし
- molecules:  src/components/molecules/ — atomsの組み合わせ
- organisms:  src/components/organisms/ — hooks・Supabase呼び出し可
- templates:  src/components/templates/ — レイアウトのみ、ロジックなし
- pages:      src/components/pages/     — routesからimportされる最上位
- ui/:        shadcn自動生成、分類しない

When creating a component, always determine the correct Atomic layer first.
Reference: docs/specs/architecture.md

## Storybook
- atoms/molecules/organisms には必ず .stories.tsx を同時に作成する
- Story規約: docs/specs/storybook.md
- 起動: bun run storybook

