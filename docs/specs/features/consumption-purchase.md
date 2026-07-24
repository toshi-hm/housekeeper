# Feature Spec: Consumption & Purchase History

## 概要

在庫の **消費イベント** を記録して履歴閲覧と統計（`stats.md`）の元データとする。
購入履歴は MVP では **`items.purchase_date` + 単独行** で表現し、専用テーブルは持たない（Q7=b）。
将来同じ SKU の再購入を集約する必要が出れば `purchase_logs` を追加する余地を残す。

## ユーザーストーリー

- 「使う」操作のたびに履歴が残る
- item 詳細に「履歴」タブがあり、消費の時系列が見える
- 全体の月次消費量（カテゴリ別）が統計画面で見える

## データ

`consumption_logs`（`docs/specs/database.md` 参照）。
購入履歴は `items` を `purchase_date desc` で並べることで代替する。

## API（hook）

| hook                          | 機能                                   |
| ----------------------------- | -------------------------------------- |
| `useConsumeItem(id)`          | 消費アクション（item 更新 + log 追加） |
| `useConsumptionLogs(itemId?)` | 履歴一覧                               |

`useConsumeItem` は楽観更新:

1. キャッシュ上で item の `units` / `opened_remaining` を即時更新
2. 並列で `consumption_logs` を invalidate
3. 失敗時はキャッシュをロールバックし、トーストで通知

実装は **トランザクションを Postgres 関数 (RPC)** で書くのが安全（本 spec が推奨する将来案）:

> **現状の実装（#432）**: v1 時点では RPC 化していない。代わりにロット更新を
> 楽観的排他制御（`update ... where id = ? and units = ? and opened_remaining = ?`
> で消費前に読んだ値と一致する行だけを更新し、0 行なら `ConcurrentUpdateError` を
> 投げてユーザーにエラー表示する）で保護しており、ほぼ同時に同一ロットへ2回消費した
> 場合の lost update は防げる（`src/hooks/useItemLots.ts` の `consumeLot`）。
> ただし「ロット更新 → ログ insert → アグリゲート再計算」を単一トランザクションには
> できていないため、ログ insert 失敗時などにロールバックはされない（非致命として警告表示、
> #441）。ローカルに Supabase CLI 環境がなく RPC マイグレーションを実機検証できないため、
> 検証済みで低リスクなクライアント側の楽観的排他制御を先に実装した。RPC 化は引き続き
> Backlog とする。

```sql
create or replace function public.consume_item(
  _item_id uuid,
  _delta numeric,
  _delta_unit text
) returns items
language plpgsql security invoker as $$
declare
  it items%rowtype;
begin
  select * into it from items where id = _item_id for update;
  if not found then raise exception 'not_found'; end if;

  -- ロジックは spec/features/inventory.md の擬似コードに従う
  -- ... 計算 ...

  update items set
    units = it.units,
    opened_remaining = it.opened_remaining,
    updated_at = now()
  where id = _item_id
  returning * into it;

  insert into consumption_logs (
    user_id, item_id, delta_amount, delta_unit,
    units_before, units_after,
    opened_remaining_before, opened_remaining_after
  ) values (
    auth.uid(), _item_id, _delta, _delta_unit,
    /* before */, it.units,
    /* before */, it.opened_remaining
  );

  return it;
end $$;
```

クライアントは `supabase.rpc('consume_item', { _item_id, _delta, _delta_unit })`。

## エラー

- 在庫不足: 関数内で `raise exception 'insufficient_stock'`
- アイテム未存在: `raise exception 'not_found'`
- いずれもトーストで i18n メッセージ

## v1 範囲

- `consumption_logs` の追加
- `consume_item` RPC + `useConsumeItem`
- ロジックの単体テスト（`bun test`）

## v1.1 範囲

- item 詳細に「履歴」タブ
- 全体の最近の消費イベント一覧（任意）

## v1.2 範囲（#418）

消費操作時に「なぜ消費したか」をメモとして残せるようにする。

- `consumption_logs.note`（text, nullable）を追加
- 消費画面（`/items/:itemId/consume`）
  - 「メモ（任意）」テキストエリア
  - 消費理由プリセットチップ（料理で使用 / 廃棄（期限切れ） / 贈り物 / その他）。
    チップは単一選択トグルで、選択中のラベルは自由記述メモとは別 state で保持する
    （テキスト欄に直接書き込むと、チップの選択切り替え時にユーザーが打った自由記述を
    上書きしてしまうため）。保存直前にラベルと自由記述を結合して1本の `note` にする
    （両方あれば `"<ラベル>: <自由記述>"`、片方だけならそのまま、両方空なら `null`）。
  - `useConsumeLot` / `useConsumeItem` の `mutateAsync` に `note?: string | null` を渡す
- item 詳細の「履歴」タブ
  - `log.note` があれば本文を表示し、行に📝アイコン（`lucide-react` の `StickyNote`）を出す

理由プリセットの表示ラベルは CLAUDE.md の Key Map 規約に従い、
`ConsumeReason`（`"cooking" | "expired" | "gift" | "other"`）→ i18n キーの
`as const satisfies Record<...>` マップ経由で参照する（i18next-parser は動的キーを
抽出できないため、対応する `items.json` のキーは手動管理）。

## エクスポート（#66 / #358 / #381）

設定ページ（`/_auth/settings`）に「データのエクスポート」セクションを設け、以下をクライアントサイドのみ
（Edge Function 不要・`Blob` + `URL.createObjectURL`）でファイルダウンロードできる。

### 在庫データ（#358）

- CSV: スプレッドシート向け。ヘッダーは固定で
  `名前,バーコード,カテゴリ,保管場所,個数,内容量,単位,期限,購入日,メモ`
  （UI 言語に関わらず日本語ヘッダー。カテゴリ/保管場所は ID ではなく名前に解決する）
- JSON: バックアップ向け。`{ exported_at: string, version: 1, items: Item[] }`
- 対象は `useItems()` が返すアクティブな（`deleted_at IS NULL`）アイテムのみ
- 将来のインポート機能は今回スコープ外（`itemsToJSON` はエクスポート専用）

### 消費・購入履歴（#381）

- CSV のみ。ヘッダーは固定で `種別,日付,アイテム名,カテゴリ,数量,単位,メモ`
  （消費/購入をまとめて1ファイルに出せるよう「種別」列で区別する。値は「消費」/「購入」）
- 期間: 過去30日 / 過去3ヶ月 / 全期間（`ExportPeriod`: `"30d" | "90d" | "all"`）
- 対象: 消費履歴のみ / 購入履歴のみ / 両方
- 消費履歴は `consumption_logs`（`occurred_at` を日付とする）、購入履歴は `item_lots`
  （`purchase_date` を日付とする — 本 spec 冒頭の通り購入履歴専用テーブルは持たないため、
  各ロットの `purchase_date` を購入イベントとして扱う。購入数量は消費で減る `units` ではなく
  作成時に固定する `purchased_units` を使用し、`purchase_date` が無いロットは除外）
- 行の「アイテム名」「カテゴリ」「メモ」は、削除済み（ソフトデリート）アイテムの履歴でも
  名前が引けるよう、`deleted_at` を無視した軽量ルックアップ（`useItemsForExport`）で解決する

### 実装

- 純粋関数（DOM 非依存・`bun test` でテスト）: `src/lib/export.ts`
  - `itemsToCSV` / `itemsToJSON`
  - `buildConsumptionHistoryRows` / `buildPurchaseHistoryRows` / `filterHistoryRowsByPeriod` /
    `historyRowsToCSV`
  - `buildExportFilename`（`base-YYYYMMDD.ext`）
- DOM 依存のダウンロード処理のみ分離: `downloadTextFile`（`Blob` + `URL.createObjectURL`）
- データ取得 hook:
  - `useItemsForExport`（`src/hooks/useItems.ts`）: 削除済みも含む軽量ルックアップ
  - `useAllConsumptionLogs`（`src/hooks/useConsumptionLogs.ts`）: 統計画面（`useStats.ts`）と共有
  - `useAllItemLots`（`src/hooks/useItemLots.ts`）: 全ロットの
    `item_id, purchased_units, purchase_date`
- UI organism: `src/components/organisms/DataExportPanel.tsx`（設定ページに埋め込み）

## v1.3 範囲（消費ペース予測）

- `consumption_logs` を元にした消費ペース予測 / 補充タイミング予測（#68, #392）。
  詳細は `docs/specs/features/stats.md`「消費ペース予測 / 補充タイミング予測」を参照
- 計算ロジック（`computeConsumptionPaceForecast` など）は `src/types/stats.ts` に純粋関数として実装
- アイテム詳細ページに予測残日数を表示、ダッシュボードの警告バナーに統合

### アイテム単位の消費量推移ミニグラフ（#327）

「履歴」タブの先頭に、直近3ヶ月の月次消費量を示すミニグラフを表示する。

- `ItemConsumptionMiniChart`（molecule）: `computeItemConsumptionPace()`（`src/types/stats.ts`、
  `computeMonthlyConsumption()` を内部で再利用）が返す `monthly` / `averagePerMonth` / `unit` /
  `estimatedWeeksRemaining` を受け取り、棒グラフ + 「平均: X/月」+「推定残り: 約X週」を表示する
- 推定残り週数は「現在の在庫量（`content_unit` 換算の総量、`getLotRemainingAmount()`）÷
  週あたり平均消費ペース」で算出する。直近3ヶ月に消費ログが無い場合はデータ不足メッセージを表示する
- 表示のみ（書き込みなし）。データ取得・算出は呼び出し側（`_auth/items/$itemId` route）が行う

## Backlog

- 単位換算（mL ⇔ L）
- 消費の取り消し（log の rollback）
- 購入履歴専用テーブル（同 SKU 再購入の集約）
- CSV / JSON からのインポート（#66 系の将来拡張、今回は対象外）

## レシピ/セット消費（v1.3, #393）

複数アイテムをまとめて一括消費できる「レシピ」機能。
「朝のコーヒー」のようなテンプレート（名前 + 構成アイテムと消費量のリスト）を
登録しておき、実行するだけで構成アイテム全件を一括消費する。

### データ

`recipes` / `recipe_items`（`docs/specs/database.md` 参照）。
実行そのものを記録する専用ログは持たず、各アイテムの消費は既存の
`consumption_logs` に個別に記録される（レシピ単位の集計が必要になれば
Backlog として `recipe_executions` 的なテーブルを検討する）。

### API（hook: `src/hooks/useRecipes.ts`）

| hook                 | 機能                                             |
| -------------------- | ------------------------------------------------ |
| `useRecipes()`       | レシピ一覧取得（構成アイテム込み）               |
| `useSaveRecipe()`    | レシピの作成・更新（構成アイテムは入れ替え方式） |
| `useDeleteRecipe()`  | レシピ削除（`recipe_items` は CASCADE で削除）   |
| `useExecuteRecipe()` | レシピの一括消費実行                             |

### 実行フロー（`executeRecipe`）

1. `checkRecipeStock` で構成アイテム全件の在庫を確認する。`executeRecipe` は
   実消費時に `consumeItem`（FEFO、賞味期限が最も近い単一ロットのみを消費）を
   呼び出すため、事前チェックも同じ基準に揃える: 各アイテムの FEFO ロットを
   `fetchFefoLotByItemId` で取得し、そのロットの残量（`getLotRemainingAmount`）
   を在庫量として判定する。ロットが1件も無いアイテム（`consumeItem` の
   no-lots フォールバック経路）のみ、`syncItemAggregate` で集約済みの item
   集約値（`units` / `content_amount` / `opened_remaining`）にフォールバックする。
   （集約値だけで判定すると、複数ロットに分かれた在庫の合計は足りていても
   実際に消費される単一ロットには足りない、というケースを見逃すため。）
2. 在庫不足があり `force` が指定されていなければ、**何も消費せず**
   `status: "blocked"` と不足内訳（`shortages`）を返す。呼び出し側
   （`_auth.recipes.tsx`）はこれを見て警告 UI を表示し、ユーザーが
   確認したら `force: true` で再実行する。
3. `force` 指定時、または在庫が全件足りている場合は構成アイテムを順に
   消費する。消費自体は既存の `consumeItem`（`useConsumeItem.ts` —
   FEFO ロット選択 + 楽観的排他制御を内包）をそのまま呼び出す。
   在庫が足りないアイテムはスキップし（`skippedItemIds`）、消費処理が
   例外を投げたアイテムは `failedItemIds` に集めて他アイテムの処理は
   継続する（ベストエフォート方式のバッチ消費）。

### エラー / 警告

- 在庫不足（force なし）: 消費は行わず、不足アイテム一覧を警告表示
  → ユーザー確認後に `force: true` で再実行
- 消費処理自体の失敗（ロット競合など）: `failedItemIds` に集約しトースト警告
- `consumption_logs` insert 失敗: `consumeItem` 既存の非致命フラグ
  (`_logInsertFailed`) を集約しトースト警告（#441 と同じ扱い）

### v1.3 範囲

- `recipes` / `recipe_items` テーブル追加
- `useRecipes` / `RecipeForm` / `/recipes` ルート
- 在庫確認ロジック（`checkRecipeStock`）とバッチ消費オーケストレーション
  （`executeRecipe`）の単体テスト

### Backlog

- レシピ実行専用の履歴テーブル・頻度順ソート
- ダッシュボードでのレシピ直接実行（現状はダッシュボードから `/recipes`
  へのショートカットのみ）
