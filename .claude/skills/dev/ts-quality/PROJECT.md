# PROJECT.md — ts-quality（housekeeper 固有設定）

このファイルは housekeeper リポジトリ専用の設定。SKILL.md の一般論より **こちらを優先** する。
他リポジトリへ持ち出す場合はこのファイルを削除するか、移植先の値で書き直すこと。

## 記法規約（lint で強制）

### `function` 宣言禁止 → const arrow

```ts
// NG
function calcTotal(items: Item[]): number { ... }

// OK
const calcTotal = (items: Item[]): number => { ... };
```

### `type` より `interface`

```ts
// NG
type ItemCardProps = { item: Item; onConsume: () => void };

// OK
interface ItemCardProps {
  item: Item;
  onConsume: () => void;
}

// OK（interface で書けないものは type でよい）
type ExpiryStatus = "expired" | "expiring-soon" | "ok" | "unknown";
```

### 型のみ import は `import type`

```ts
// NG
import { Item } from "@/types/item";

// OK
import type { Item } from "@/types/item";
import { type Item, itemSchema } from "@/types/item"; // 値と混在する場合
```

### import 順序

ESLint の `simple-import-sort` で自動整列。手で並べ替えない。

## バリデーション

- **Zod v4** を使う。v3 との差分（`z.string().email()` → `z.email()` など）に注意
- Supabase のレスポンス型は `src/types/supabase.ts`（`bun run gen:types` の生成物）を使う。
  手書きで二重定義しない・手編集しない

## 動的 i18n キーは Key Map 経由

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

Key Map 経由のキーは i18next-parser に消されないよう手動管理（`keepRemoved: true` 前提）。

## エラーハンドリング（Supabase + TanStack Query）

```ts
const { data, error } = await supabase.from("items").select("*");
if (error) throw error; // TanStack Query に投げて isError で扱う
return (data ?? []) as Item[];
```

- try/catch で握りつぶさない。Query/Mutation の error ハンドリングに委ねる
- オフライン抑止が必要な mutation は `requireOnline()`（`src/lib/requireOnline.ts`）を先頭で呼ぶ
- Supabase クライアントの初期化は `src/lib/supabase.ts` のみ

## チェックコマンド

```bash
npx oxfmt . && bun run check && bun test
```
