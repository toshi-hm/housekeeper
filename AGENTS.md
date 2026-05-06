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
6. Before marking any task complete, run all three checks and fix every error/warning:
   - `bun run format:check` — format check (oxfmt)
   - `bun run lint` — lint (oxlint + eslint)
   - `bun run typecheck` — type check (tsc --noEmit)
   - Combined shorthand: `bun run format:check && bun run check`
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

After completing a task, all of the following must pass:

1. `bun run format:check` — zero warnings (run `bun run format` to auto-fix)
2. `bun run lint` — zero errors and zero warnings
3. `bun run typecheck` — zero errors
4. `bun run build` — succeeds with zero errors
5. Confirm the changed files match the spec in docs/specs/
6. `bun run build-storybook` — succeeds if Storybook stories were added/changed
