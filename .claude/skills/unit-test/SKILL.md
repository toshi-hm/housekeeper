---
name: unit-test
description: >-
  Use when writing or fixing unit tests in this repo — 「テスト書いて」「テスト追加して」「テストが落ちる」
  「カバレッジ上げて」など。ランナーは bun test（vitest/jest ではない）。happy-dom + Testing Library +
  i18n wrapper + Supabase mock というこのリポジトリ固有のテスト基盤に沿って作成・修正する。
---

# Skill: unit-test

このリポジトリの単体テストを作成・修正する。

## 最重要の前提

**テストランナーは `bun test`。vitest / jest ではない。**

```ts
// 必ずこれ
import { describe, expect, it, mock } from "bun:test";

// NG（このリポジトリには存在しない）
import { describe, it, vi } from "vitest";
```

- `vi.fn()` → `mock(() => ...)`、`vi.mock()` → `mock.module()`（`bun:test`）
- DOM は happy-dom。`bunfig.toml` の `preload = ["./src/test/setup.ts"]` で
  `GlobalRegistrator.register()` と `afterEach(cleanup)` が全テストに適用済み。
  テストファイル側で再セットアップしない

## ファイル配置・実行

- テストは対象と同階層に `<name>.test.ts` / `<name>.test.tsx`（colocation）
- 実行:

```bash
bun test                                    # 全件
bun test src/components/atoms/Foo.test.tsx  # 単体
bun test --watch                            # watch
```

## パターン集（実在コード準拠）

### 1. コンポーネント（i18n が絡む場合の wrapper）

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "bun:test";
import { type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import i18n from "../../lib/i18n";
import { ExpiryBadge } from "./ExpiryBadge";

const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
);

describe("ExpiryBadge", () => {
  it("renders nothing for null expiry date", () => {
    const { container } = render(<ExpiryBadge expiryDate={null} />, { wrapper });
    expect(container.firstChild).toBeNull();
  });
});
```

- 文言のアサーションはロケール依存になるので、原則 **存在/非存在・構造** で検証する。
  文言を見る場合はキー起点で（`i18n.t("...")` の戻り値と比較）
- 日付系は `new Date()` 相対で組み立てる（固定日付ハードコードは将来落ちる）

### 2. ユーザー操作

```tsx
import userEvent from "@testing-library/user-event";

it("calls onConsume when tapped", async () => {
  const onConsume = mock(() => {});
  const user = userEvent.setup();
  render(<ItemCard item={item} onConsume={onConsume} />, { wrapper });
  await user.click(screen.getByRole("button", { name: /consume/i }));
  expect(onConsume).toHaveBeenCalledTimes(1);
});
```

### 3. hooks（TanStack Query）

QueryClientProvider を wrapper に含める。retry を切って失敗を即時化する。

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};
```

既存例: `src/hooks/useItems.test.ts`

### 4. Supabase のモック

`src/mocks/supabase.ts` を確認し、既存のモックヘルパーを再利用する。
新規にモックが必要な場合は `mock.module()` で `@/lib/supabase` を差し替える。

```ts
import { mock } from "bun:test";

mock.module("@/lib/supabase", () => ({
  supabase: mockSupabaseClient,
}));
```

**実 Supabase に接続するテストは書かない**（単体テストはネットワーク不要で完結させる）。

### 5. 純粋ロジック（.ts）

Zod スキーマ・日付計算・整形関数は wrapper 不要のプレーンなテストで、
境界値（null / undefined / 0 / 空文字 / 閾値ちょうど）を必ず含める。
既存例: `src/types/item.test.ts`

## レイヤー別のテスト観点

| 対象        | 観点                                                                      |
| ----------- | ------------------------------------------------------------------------- |
| atoms       | props の全分岐で描画される/されない、状態別の見た目差分                   |
| molecules   | ユーザー操作 → コールバック呼び出し、表示条件                             |
| organisms   | データ状態（loading / error / empty / success）ごとの描画。モック必須     |
| hooks       | query の成功/失敗、mutation 後のキャッシュ更新、オフライン時の早期 return |
| types / lib | Zod バリデーション境界値、計算ロジック、エッジケース                      |

templates / pages / `src/components/ui/`（shadcn 生成物）はテスト対象外。

## テストが落ちているときの調査手順

1. `bun test <落ちたファイル>` で単体再現
2. import 元が `bun:test` か確認（vitest API 混入がないか）
3. happy-dom 非対応 API（一部の layout 計測など）を使っていないか
4. i18n / QueryClient の wrapper 漏れ
5. 日付・タイムゾーン依存（相対日付に書き換える）
6. 直近の実装変更との突き合わせ — **テストを実装に合わせるか、実装のバグかを必ず判断して報告する。
   安易にアサーションを緩めて緑にしない**

## Definition of Done

- [ ] `bun test`（全件）が通る
- [ ] 新規テストは境界値・異常系を含む
- [ ] ネットワーク・実 DB に依存していない
- [ ] `npx oxfmt . && bun run check` が通る
