---
name: ts-quality
description: >-
  Use when writing or refactoring TypeScript in this repo — 「リファクタして」「型を直して」「any を消して」
  「TypeScript の書き方を揃えて」など。strict 規約（no any / interface / const arrow / import type /
  Zod / Key Map）を Before/After 付きで適用し、bun run check を通すところまで行う。
---

# Skill: ts-quality

このリポジトリの TypeScript strict 規約を適用する。新規実装・リファクタリング両方で使う。
一般的な TypeScript の慣習とこのリポジトリの規約が食い違う場合、**必ずリポジトリ規約を優先**する。

## 規約一覧（Before / After）

### 1. `function` 宣言禁止 → const arrow

```ts
// NG
function calcTotal(items: Item[]): number { ... }

// OK
const calcTotal = (items: Item[]): number => { ... };
```

React コンポーネントも同様（`const Foo = () => ...`）。

### 2. `type` より `interface`

```ts
// NG
type ItemCardProps = { item: Item; onConsume: () => void };

// OK
interface ItemCardProps {
  item: Item;
  onConsume: () => void;
}
```

例外（`type` を使ってよい）: ユニオン型、mapped type、テンプレートリテラル型、
関数型エイリアスなど interface で表現できないもの。

```ts
// OK（interface で書けない）
type ExpiryStatus = "expired" | "expiring-soon" | "ok" | "unknown";
```

### 3. `any` 禁止 → `unknown` + Zod

型が不明な外部入力（API レスポンス、JSON.parse、Storage、postMessage）は
`unknown` で受けて Zod でパースする。

```ts
// NG
const data = (await res.json()) as any;

// OK
import { z } from "zod";

const barcodeResultSchema = z.object({
  name: z.string(),
  imageUrl: z.string().nullable(),
});

const raw: unknown = await res.json();
const data = barcodeResultSchema.parse(raw); // 型は z.infer で得られる
```

- Zod は **v4**。v3 との差分（`z.string().email()` → `z.email()` など）に注意
- Supabase のレスポンス型は `src/types/supabase.ts`（生成物）を使う。手書きで二重定義しない

### 4. 型のみ import は `import type`

```ts
// NG
import { Item } from "@/types/item";

// OK
import type { Item } from "@/types/item";
import { type Item, itemSchema } from "@/types/item"; // 値と混在する場合
```

### 5. import 順序

ESLint の `simple-import-sort` で自動整列される。手で並べ替えず、
`bun run lint` の autofix（または `eslint --fix`）に任せる。

### 6. 動的 i18n キーは Key Map 経由

```ts
// NG（i18next-parser が抽出できず、型安全でもない）
t(`expiry.status.${status}`);

// OK
const statusLabelKey = {
  expired: "expiry.statusExpired",
  "expiring-soon": "expiry.statusExpiringSoon",
  ok: "expiry.statusOk",
  unknown: "expiry.statusUnknown",
} as const satisfies Record<ExpiryStatus, string>;

t(statusLabelKey[status]);
```

`satisfies Record<Union, string>` によりユニオンの網羅チェックが効く。
Key Map 経由のキーは i18next-parser に消されないよう手動管理（`keepRemoved: true` 前提）。

### 7. ユニオンの網羅性チェック

switch で分岐する場合は default で never を潰す。

```ts
const label = (status: ExpiryStatus): string => {
  switch (status) {
    case "expired":
      return "...";
    case "expiring-soon":
      return "...";
    case "ok":
      return "...";
    case "unknown":
      return "...";
    default:
      return status satisfies never;
  }
};
```

オブジェクトマップで表現できるなら `as const satisfies Record<Union, T>`（§6）の方を優先。

### 8. エラーハンドリング（Supabase）

```ts
const { data, error } = await supabase.from("items").select("*");
if (error) throw error; // TanStack Query に投げて isError で扱う
return (data ?? []) as Item[];
```

- try/catch で握りつぶさない。Query/Mutation の error ハンドリングに委ねる
- オフライン抑止が必要な mutation は `requireOnline()`（`src/lib/requireOnline.ts`）を先頭で呼ぶ

## リファクタリング時の手順

1. 対象範囲を特定し、上記規約への違反を洗い出す（`rg "function |: any|^import \{[^}]*\} from"` などで機械的に探す）
2. **挙動を変えない**変更（記法統一）と、挙動が変わりうる変更（Zod 導入等）を分けて報告する
3. 修正を適用する
4. 検証:

```bash
npx oxfmt . && bun run check && bun test
```

## やってはいけないこと

- `as any` / `@ts-ignore` / `@ts-expect-error` での握りつぶし（後者は理由コメント付きで最終手段のみ）
- Supabase 生成型（`src/types/supabase.ts`）の手編集（`bun run gen:types` で再生成される）
- `src/lib/supabase.ts` 以外での Supabase クライアント初期化
- 規約違反を「動くから」と残したままにする（lint が通っても §6〜8 は機械検出できない。目視で確認する）

## Definition of Done

- [ ] 規約 1〜8 への違反が対象範囲に残っていない
- [ ] `npx oxfmt . && bun run check` が通る
- [ ] 既存テスト（`bun test`）が通る
- [ ] 挙動が変わりうる変更をした場合、その旨と理由を報告した
