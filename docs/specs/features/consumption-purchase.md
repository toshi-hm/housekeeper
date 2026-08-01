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
- JSON: バックアップ向け。`{ exported_at: string, version: 2, items: ItemExportV2[] }`
  （`ItemExportV2` はアイテムの基本情報 + `lots: ItemLotExport[]`。`items` テーブルの
  集約行ではなく `item_lots` の実体をロット単位でそのまま書き出す。期限日の異なる
  複数ロット（例: 古いロットと買い足した新しいロット）を持つアイテムでも、集約時に
  最も早い期限しか残らない、といった情報の欠落が起きないようにするため、#693）
- 対象は `useItems()` が返すアクティブな（`deleted_at IS NULL`）アイテムのみ
- このJSON形式はインポート（下記）でも読み込める。旧 version 1（アイテム単位の
  集約値のみを持つ形式）で書き出された既存のバックアップファイルも、インポート側は
  後方互換で読み込める（1アイテムにつき単一のロットとして復元する）

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
    `item_id, purchased_units, purchase_date`（購入履歴CSV専用の軽量版）
  - `useAllItemLotsFull`（`src/hooks/useItemLots.ts`）: JSONバックアップ用に、
    ロット単位のまま `units, opened_remaining, unit_price, purchase_date, expiry_date`
    を取得する（#693）
- UI organism: `src/components/organisms/DataExportPanel.tsx`（設定ページに埋め込み）

## インポート（復元）（#657 / #693 / #694）

サーバー側バックアップの仕組みを持たないクライアントサイドのみの構成のため、
上記の JSON エクスポートを唯一のバックアップ/リカバリー導線として使えるよう、
設定ページの「データのエクスポート」の隣に「データのインポート（復元）」
セクションを設ける。

- 入力は `itemsToJSON` が生成した JSON のみ受け付ける（Zod でパース・検証。
  壊れたJSON/想定外の形式は理由別のエラートーストで拒否する）。現行の
  version 2（アイテムごとに `lots` 配列を持つ）を優先してパースし、失敗したら
  後方互換として旧 version 1（アイテム単位の集約値のみ）を単一ロットとして
  読み込む
- **カテゴリ・保管場所（`category_id` / `storage_location_id`）は復元対象に
  含めない**: エクスポートJSONにはIDのみが入っており名前を含まないため、
  別プロジェクトへの移行時にはそのIDが指す行が存在せず外部キー制約違反に
  なり得る。安全側に倒し、インポート後にユーザーが手動で再設定する運用とする
- バーコードが既存アイテムと一致した場合の重複時の扱いをユーザーが選べる:
  - スキップ: 何もしない
  - 上書き: 既存アイテムのロットを入れ替え、名前・内容量・単位・メモ・
    最小在庫数・自動リピート設定を上書きする（在庫数量はロット単位で管理
    されているため `items.units` 等は直接書き換えず、ロット入れ替え後に
    `syncItemAggregate` で再計算させる）
  - 新規として追加: 重複を無視して常に新規アイテムとして作成する
- 同一インポート内で同じバーコードが複数回登場した場合、2件目以降は
  「このインポートで直前に作成した行」を重複として扱う
- **バッチ全体を単一トランザクションで処理する**（#694）: アイテムの
  作成/更新・ロットの入れ替えは Postgres 関数 `import_items_batch`
  （`supabase/migrations/20260731000001_atomic_import_items.sql`）にまとめて
  おり、途中の1件が失敗した場合はバッチ全体がロールバックされ、何も反映
  されない。これにより「途中まで成功→エラー→同じファイルを再インポート」
  してもバーコードを持たないアイテムが二重作成されることがない
  （アイテム集約値の再計算 `syncItemAggregate` のみは、他のミューテーション
  と同様にトランザクションの外側で行う別ステップであり、失敗しても
  非致命的）

### 実装

- 純粋関数: `jsonToItems`（`src/lib/export.ts`）— Zodバリデーション、
  `ImportParseError`（`reason: "invalid_json" | "invalid_format"`）を投げる
- データ書き込み: `importItems` / `useImportItems`（`src/hooks/useImportItems.ts`）
- UI organism: `src/components/organisms/DataImportPanel.tsx`（設定ページに埋め込み）

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

## 購入先（店舗）記録と店舗別価格比較（#697）

`item_lots.unit_price`（購入時単価）は既にあるが、購入先（店舗名）を保持する列がなく、
「同じ商品をどの店で買うと安いか」の比較に使えなかった。任意項目として店舗名を追加する。

### スコープ

- やること: `item_lots` への店舗名保持、購入（ロット編集）フォームへの入力欄追加、
  購入履歴表示への反映、同一商品を複数店舗で買った場合の簡易な価格比較表示
- やらないこと: 店舗の位置情報・地図連携。`stores` マスタテーブル化（カテゴリ/保管場所と
  同様のCRUD画面）は今回は行わず、自由入力の text 列に留める。既存データ・既存フローへの
  破壊的変更は発生しない（任意項目・NULL許容のため）

### データ

- `item_lots.store_name text null` を追加（`docs/specs/database.md` の `item_lots` に準拠する
  マイグレーション）。`unit_price` と同様、既存ロットは全て `NULL`（後方互換）
- 将来、店舗ごとの分析が重要になった場合は `stores` マスタテーブルへの昇格を検討する
  （`master-data.md` の `categories` / `storage_locations` と同じパターンで追加できる設計に
  しておく — 今回はその布石として、`store_name` は自由入力だがトリムした文字列として
  一貫性を保つ）

### 画面

- 購入（ロット新規登録・編集）フォームに「店舗名」の任意テキスト入力を追加。直近使用した
  店舗名（`item_lots.store_name` の distinct 値、自ユーザー分）をサジェストする
- 購入履歴画面（`docs/specs/features/consumption-purchase.md` の「エクスポート」節と同じ
  `item_lots` ベースの一覧）に店舗名列を追加
- 統計ページ（`docs/specs/features/stats.md`）に、同一アイテムで複数店舗の `unit_price` が
  記録されている場合のみ表示する簡易カード（店舗名 × 直近単価の一覧、安い順）を追加。
  対象データが無いユーザーには何も表示しない（Empty状態で場所を取らない）

### API（hook）

- 既存 `createLot` / `updateLot`（`src/hooks/useItemLots.ts`）の引数に `store_name` を追加
- 新規 `useStoreNameSuggestions()`: 自ユーザーの `item_lots.store_name` の distinct 値を返す
  軽量クエリ（フォームのサジェスト用）
- 新規 `useStorePriceComparison(itemId)`: 指定アイテムの店舗別最新単価一覧を返す

### エクスポート/インポートへの影響

- JSON バックアップ（v2, #693）の `ItemLotExport` に `store_name` を追加する（後方互換:
  旧v1・store_name追加前のv2バックアップは `store_name: null` として読み込む）

### やらないこと（スコープ外、再掲）

- 店舗の位置情報・地図連携、店舗マスタテーブル化（自由入力に留める）

## Backlog

- 単位換算（mL ⇔ L）
- 消費の取り消し（log の rollback）
- 購入履歴専用テーブル（同 SKU 再購入の集約）

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
