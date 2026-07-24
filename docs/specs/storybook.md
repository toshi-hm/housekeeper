# Storybook Spec

## Setup

- Storybook 10 (latest)
- @storybook/react-vite (Viteと統合)
- インストール: bun add -D storybook @storybook/react-vite

## Story作成ルール

### 対象

- atoms: 必須（全コンポーネント）
- molecules: 必須（全コンポーネント）
- organisms: 必須（全コンポーネント）
- templates: 任意（レイアウト確認用途のみ）
- pages: 対象外（routesで確認する）
- ui/ (shadcn): 対象外

### ファイル配置

コンポーネントと同階層に置く

```
src/components/
  atoms/
    ExpiryBadge.tsx
    ExpiryBadge.stories.tsx   # ← ここに置く
  molecules/
    ItemCard.tsx
    ItemCard.stories.tsx
  organisms/
    BarcodeScanner.tsx
    BarcodeScanner.stories.tsx
```

### Story記述規約

```tsx
// ExpiryBadge.stories.tsx の例
import type { Meta, StoryObj } from "@storybook/react";
import { ExpiryBadge } from "./ExpiryBadge";

const meta = {
  component: ExpiryBadge,
  tags: ["autodocs"], // 必須: ドキュメント自動生成
} satisfies Meta<typeof ExpiryBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

// Storyは状態ごとに網羅する
export const Fresh: Story = {
  args: { expiryDate: "2025-12-31" },
};

export const ExpiringSoon: Story = {
  args: { expiryDate: new Date(Date.now() + 2 * 86400000).toISOString() },
};

export const Expired: Story = {
  args: { expiryDate: "2020-01-01" },
};
```

### 命名規約

- Storyは英語
- Story名はコンポーネントの「状態」を表す（Default / Loading / Error / Empty など）
- Default Storyは必ず用意する

## Commands

- 起動: bun run storybook
- ビルド: bun run build-storybook
- アクセシビリティチェック: bun run test-storybook（ビルド済みStorybookに対して実行。詳細は下記）

## package.json scripts（追加分）

```json
{
  "storybook": "storybook dev -p 6006",
  "build-storybook": "storybook build",
  "test-storybook": "test-storybook"
}
```

## アクセシビリティ回帰自動検出（axe-core）

Originating issue: [#497](https://github.com/toshi-hm/housekeeper/issues/497)。
`@storybook/addon-a11y`（Storybook UI上でのインタラクティブなa11yパネル）に加え、
`@storybook/test-runner` + `axe-playwright` で全`.stories.tsx`に対してaxe-coreの
ルールチェックをヘッドレス実行し、CI（`.github/workflows/_a11y.yml`、`ci.yml`から呼び出し）で
回帰を自動検出する。

### 仕組み

- `.storybook/test-runner.ts`: `preVisit`でaxeを注入し、`postVisit`で各Storyの
  DOM（`#storybook-root`）に対して`checkA11y`を実行する設定ファイル。
- ローカル実行手順:
  1. `bun run build-storybook`
  2. ビルド成果物（`storybook-static/`）を静的サーバで配信（例: `npx serve storybook-static -l 6006`）
  3. `bun run test-storybook -- --ci --url http://127.0.0.1:6006`
- CIでは`bunx playwright install --with-deps chromium`でブラウザを取得してから同じ手順を実行する。

### 段階導入方針（baseline）

初回導入時点で既存の全Storyにaxe-coreを強制すると、これまで検知されていなかった
違反で一斉に赤くなる可能性がある。そのため:

- 個別修正が容易な違反（`aria-label`不足など）はCIを赤くする前に直接修正する
  （baselineに載せない）。
- 修正にコンポーネント/マークアップ変更を要する違反は、Story ID
  （`<title-kebab>--<story-name-kebab>`形式、例: `atoms-expirybadge--expired`）を
  `.storybook/a11y-baseline.ts`の`A11Y_BASELINE`に列挙し、チェックをスキップする。
- **新規追加するStoryはbaselineに載せない**。新規Story分は最初から厳格にチェックされる。
- baselineのエントリは違反を修正したら削除する（残数を増やさない）。

個々の規約・既知のギャップは`docs/specs/accessibility.md`を参照。
