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

## package.json scripts（追加分）

```json
{
  "storybook": "storybook dev -p 6006",
  "build-storybook": "storybook build"
}
```
