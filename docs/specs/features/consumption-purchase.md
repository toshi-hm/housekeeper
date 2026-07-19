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
  各ロットの `purchase_date` を購入イベントとして扱う。`purchase_date` が無いロットは除外）
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
  - `useAllItemLots`（`src/hooks/useItemLots.ts`）: 全ロットの `item_id, units, purchase_date`
- UI organism: `src/components/organisms/DataExportPanel.tsx`（設定ページに埋め込み）

## Backlog

- 単位換算（mL ⇔ L）
- 消費の取り消し（log の rollback）
- 購入履歴専用テーブル（同 SKU 再購入の集約）
- CSV / JSON からのインポート（#66 系の将来拡張、今回は対象外）
