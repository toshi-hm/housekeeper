# AGENTS.md — housekeeper

## Role
You are an agent building and maintaining "housekeeper",
a personal home inventory web app.

## Mandatory Rules
1. Always read docs/specs/ before implementing any feature.
2. Use `bun` for all package management. Never use npm or yarn.
3. Always install the latest version of libraries.
4. No backend server. Supabase is accessed client-side only.
5. Never write `any` in TypeScript. Use `unknown` + Zod.
6. Run `bunx oxlint .` before marking a task complete.
7. 新しいコンポーネントは `docs/specs/architecture.md` のAtomicDesign分類に従い配置する
8. `atoms/molecules/organisms` を実装したら、必ず対応する`.stories.tsx` を作成する
9. Storybook規約は `docs/specs/storybook.md` に従う

## Tech Stack
(→ Same as CLAUDE.md above)

## Spec Index
- docs/specs/overview.md
- docs/specs/database.md
- docs/specs/architecture.md
- docs/specs/features/

## Testing a Task
After completing a task:
1. `bun run build` must succeed with zero errors
2. `bunx oxlint .` must return no errors
3. Confirm the changed files match the spec in docs/specs/
4. Check the success of this command: `bun run build-storybook`

