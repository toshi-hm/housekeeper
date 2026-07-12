# PROJECT.md — react-component（housekeeper 固有設定）

このファイルは housekeeper リポジトリ専用の設定。SKILL.md の一般論より **こちらを優先** する。
他リポジトリへ持ち出す場合はこのファイルを削除するか、移植先の値で書き直すこと。

## 必読 spec

- `docs/specs/architecture.md` — Atomic Design 分類と配置ルール
- `docs/specs/storybook.md` — Story 記述規約
- 対象機能の spec（`docs/specs/features/*.md`）があれば読む

## 配置・層ルール

配置: `src/components/<layer>/<ComponentName>.tsx`

- **atoms**: hooks 禁止。props のみ
- **molecules**: atoms を使う。Supabase / TanStack Query 禁止
- **organisms 以上**: hooks・Supabase 呼び出しはここからのみ許可
- **templates**: ロジックなし。children を受けるだけ
- shadcn/ui の自動生成物は `src/components/ui/` に置き、Atomic 分類しない

## 記法規約（lint で強制）

- `function` 宣言禁止 → `const Hoge = () => {}`
- props 型は `interface`（ユニオン等 interface で書けない場合のみ `type`）
- `any` 禁止 → `unknown` + Zod
- 型のみ import は `import type` / `import { type Foo }`

## コンポーネントテンプレート（実在パターン準拠）

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

## UI 実装の必須事項

- モバイルファースト: 基本スタイルはスマホ幅、`sm:` `md:` で広げる（Tailwind CSS v4）
- 文字列は `t("...")` 経由。キーは `src/locales/ja` と `en` の**両方**に追加する。
  動的キーは CLAUDE.md の Key Map ルール（`as const satisfies Record<Union, string>`）に従う
- 日付・期限まわりは既存の `ExpiryBadge` / `src/types/item.ts` のロジックを参照して重複実装を避ける

## Story 規約

- atoms / molecules / organisms は **必須**。templates は任意、pages と `ui/` は対象外
- organisms で Supabase / Query が絡む場合は `src/mocks/supabase.ts` や
  decorator で QueryClientProvider を与える（既存 organisms の stories を参考にする）

## テスト

- ランナーは **bun test**（vitest ではない）。詳細は `unit-test` スキルの PROJECT.md 参照
- i18n wrapper（`I18nextProvider`）が必要

## チェックコマンド

```bash
npx oxfmt . && bun run check && bun test src/components/<layer>/<ComponentName>.test.tsx
```
