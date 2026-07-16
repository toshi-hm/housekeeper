# PROJECT.md — unit-test（housekeeper 固有設定）

このファイルは housekeeper リポジトリ専用の設定。SKILL.md の一般論より **こちらを優先** する。
他リポジトリへ持ち出す場合はこのファイルを削除するか、移植先の値で書き直すこと。

## テストランナー

**bun test**（vitest / jest ではない）。

```ts
// 必ずこれ
import { describe, expect, it, mock } from "bun:test";

// NG（このリポジトリには存在しない）
import { describe, it, vi } from "vitest";
```

- `vi.fn()` → `mock(() => ...)`、`vi.mock()` → `mock.module()`
- DOM は happy-dom。`bunfig.toml` の `preload = ["./src/test/setup.ts"]` で
  `GlobalRegistrator.register()` と `afterEach(cleanup)` が全テストに適用済み。
  テストファイル側で再セットアップしない

## 実行コマンド

```bash
bun test                                    # 全件
bun test src/components/atoms/Foo.test.tsx  # 単体
bun test --watch                            # watch
```

## パターン集（実在コード準拠）

### コンポーネント（i18n wrapper）

```tsx
import { render } from "@testing-library/react";
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

### hooks（TanStack Query）

QueryClientProvider を wrapper に含め、retry を切って失敗を即時化する。
既存例: `src/hooks/useItems.test.ts`

```tsx
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};
```

### Supabase のモック

`src/mocks/supabase.ts` の既存ヘルパーを再利用する。
新規モックは `mock.module()` で `@/lib/supabase` を差し替える。

```ts
import { mock } from "bun:test";

mock.module("@/lib/supabase", () => ({
  supabase: mockSupabaseClient,
}));
```

### 純粋ロジック

既存例: `src/types/item.test.ts`（Zod スキーマ・日付計算の境界値テスト）

## 対象外

templates / pages / `src/components/ui/`（shadcn 生成物）はテスト対象外。

## 完了前チェック

```bash
bun test && npx oxfmt . && bun run check
```
