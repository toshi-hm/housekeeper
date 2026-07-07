---
name: react-component
description: >-
  Use when creating a new React component in this repo — 「コンポーネント作って」「〜を表示するUIが欲しい」
  「新しい画面/カード/バッジ/フォームを追加して」など。Atomic Design 分類の判断から、実装・Storybook Story・
  単体テストの同時作成、規約チェックまでを一貫して行う。
---

# Skill: react-component

Atomic Design 準拠で新規 React コンポーネントを作成する。
**分類 → 実装 → Story → テスト → チェック** を 1 セットで完了させる（Story とテストは後回しにしない）。

## 前提として読むもの

- `docs/specs/architecture.md` — Atomic Design 分類と配置ルール（必読）
- `docs/specs/storybook.md` — Story 記述規約（必読）
- 対象機能の spec（`docs/specs/features/*.md`）があれば読む

## Step 1. Atomic Design 分類を決める

実装前に必ず分類を決め、ユーザーへの報告に含める。

| 質問                                                        | Yes なら  |
| ----------------------------------------------------------- | --------- |
| props のみで動き、外部状態・hooks に依存しないか？          | atoms     |
| atoms を 2〜3 個組み合わせた小さな UI か？                  | molecules |
| hooks / Supabase 呼び出しを含む独立 UI ブロックか？         | organisms |
| children/slot でレイアウト骨格だけ提供するか？（ロジック0） | templates |
| route から import される最上位か？                          | pages     |

### 配置ルール（違反しないこと）

- **atoms**: hooks 禁止。props のみ
- **molecules**: atoms を使う。Supabase / TanStack Query 禁止
- **organisms 以上**: hooks・Supabase 呼び出しはここからのみ許可
- **templates**: ロジックなし。children を受けるだけ
- shadcn/ui の自動生成物は `src/components/ui/` に置き、Atomic 分類しない

## Step 2. コンポーネントを実装する

配置: `src/components/<layer>/<ComponentName>.tsx`

### 記法規約（lint で強制。守らないと `bun run check` が落ちる）

- `function` 宣言禁止 → `const Hoge = () => {}`
- props 型は `interface`（ユニオン等 interface で書けない場合のみ `type`）
- `any` 禁止 → `unknown` + Zod
- 型のみ import は `import type` / `import { type Foo }`

### テンプレート（atoms/molecules の例）

```tsx
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

interface StockBadgeProps {
  units: number;
  className?: string;
}

export const StockBadge = ({ units, className }: StockBadgeProps) => {
  const { t } = useTranslation();
  if (units < 0) return null;
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs", className)}>
      {t("item.unitsLabel", { count: units })}
    </span>
  );
};
```

### UI 実装の必須事項

- **モバイルファースト**: 基本スタイルはスマホ幅、`sm:` `md:` で広げる
- 表示文字列はハードコードせず `t("...")`（文字列リテラルで渡す。動的キーは
  CLAUDE.md の Key Map ルールに従う）。`src/locales/ja` と `en` の両方にキーを追加する
- 既存の shadcn/ui（`src/components/ui/`）に同等品があれば再利用する。車輪の再発明をしない
- 日付・期限まわりは既存の `ExpiryBadge` / `src/types/item.ts` のロジックを参照して重複実装を避ける

## Step 3. Story を作成する（atoms / molecules / organisms は必須）

配置: コンポーネントと同階層 `<ComponentName>.stories.tsx`

```tsx
import type { Meta, StoryObj } from "@storybook/react";

import { StockBadge } from "./StockBadge";

const meta = {
  component: StockBadge,
  tags: ["autodocs"],
} satisfies Meta<typeof StockBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { units: 3 },
};

export const Empty: Story = {
  args: { units: 0 },
};
```

- `tags: ["autodocs"]` 必須
- Story 名は英語で「状態」を表す（Default / Loading / Error / Empty / Expired など）
- `Default` は必ず用意する
- 状態バリエーション（props の分岐）をすべて網羅する
- organisms で Supabase / Query が絡む場合は `src/mocks/supabase.ts` や
  decorator で QueryClientProvider を与える（既存 organisms の stories を参考にする）

## Step 4. テストを作成する

配置: 同階層 `<ComponentName>.test.tsx`。ランナーは **bun test**（vitest ではない）。

```tsx
import { render } from "@testing-library/react";
import { describe, expect, it } from "bun:test";
import { type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import i18n from "../../lib/i18n";
import { StockBadge } from "./StockBadge";

const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
);

describe("StockBadge", () => {
  it("renders nothing for negative units", () => {
    const { container } = render(<StockBadge units={-1} />, { wrapper });
    expect(container.firstChild).toBeNull();
  });
});
```

テスト観点の詳細は `unit-test` スキル（`.claude/skills/unit-test/SKILL.md`）に従う。

## Step 5. チェック

```bash
npx oxfmt . && bun run check && bun test src/components/<layer>/<ComponentName>.test.tsx
```

すべて通るまで修正する。

## やってはいけないこと

- Story・テストを「後で」にして コンポーネントだけコミットする
- atoms に hooks を入れる / molecules から Supabase を呼ぶ
- 文字列のハードコード（i18n キー追加漏れ。ja/en 両方必要）
- `src/components/ui/` 配下への手書きコンポーネント追加（shadcn 生成物専用）
- 分類に迷ったまま実装を始める（迷ったら小さい方=atoms 寄りに倒し、報告に判断根拠を書く）

## Definition of Done

- [ ] 分類の判断根拠を報告した
- [ ] `<Component>.tsx` + `.stories.tsx`（対象層なら）+ `.test.tsx` が同階層に揃っている
- [ ] i18n キーを ja / en 両方に追加した
- [ ] `npx oxfmt . && bun run check` と対象テストが通った
