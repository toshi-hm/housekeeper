# Feature Spec: Weekly Meal Planner（在庫優先の週間献立プランナー）

> **本 spec は設計ドラフトである。実装（migration・hook・コンポーネント・route・i18n・テスト）は
> 含まない。** `feature-proposal` スキルの手順（提案 → spec ドラフト → PLANS.md 反映 → 承認後に
> 実装）に従い、L サイズの新規機能のためレビュー可能な設計を先に固める（元 issue: #715、
> PR #706 の household-sharing / receipt-scan と同じ進め方）。実装は本 spec の「実装しないこと」
> の通り別 Issue・別 PR に分割する（breakdown は `PLANS.md` §10 参照）。

## 概要

既存機能は「期限間近アイテムに対する外部レシピの単発提案（`recipe-suggest`、ダッシュボードのみ・
非永続、`expiry-alert.md` 参照）」「ユーザー登録レシピのワンタップ一括消費（`recipes` /
`recipe_items`、スケジュール概念なし、`consumption-purchase.md` 参照）」「買い物リスト
（`shopping-list.md`）」がそれぞれ独立して存在するが、これらを繋いで **「今週何を作るか」を
計画する** 機能はまだない（`docs/specs/features/` に「献立」「meal plan」を扱う spec は
存在しないことを確認済み）。

在庫管理アプリの本質的な価値は「無駄なく使い切ること」であり、日々の「何作ろう」という
意思決定コストと食品ロスを同時に下げるため、既存投資（recipes・recipe-suggest・shopping
list・期限アラート）を統合する。

## ユーザーストーリー

- 向こう 7 日分の献立枠が一覧できる（今日を含む 7 日間、日付が進むと表示範囲もスライドする）
- 各日の枠に、登録済みの `recipes` から 1 件を割り当てられる。レシピを持っていない献立
  （外食・自由入力の一品など）は自由記述メモとしても登録できる
- レシピを割り当てた枠は、在庫が足りるかその場で分かる（`checkRecipeStock` を再利用）
- 不足食材があれば、ワンタップで買い物リストに追加できる（`shopping_list_items` へ一括 insert）
- 実際に作った日は「実行」ボタンで在庫を一括消費できる（`useExecuteRecipe` をそのまま再利用）
- レシピを割り当てていない空き枠には、期限間近の在庫を多く消費できそうなレシピ・レシピの
  アイデアがレコメンドされ、そこから直接その枠に割り当てられる

## スコープ

### やること

- 新規ルート `/_auth/meal-plan`（7 日分の週間ビュー、1 日 1 枠の MVP）
- 新規テーブル `meal_plans`（1 日 1 枠、`recipes` への参照 or 自由記述メモ）
- 枠へのレシピ割り当て / メモ入力 / 解除（`useUpsertMealPlan`）
- 割り当てたレシピの在庫確認（`checkRecipeStock` 再利用）と、不足分の買い物リスト追加
  （`useUpsertShoppingItem` 再利用）
- 「実行済みにする」操作（`useExecuteRecipe` 再利用 + `meal_plans.executed_at` の記録）
- 空き枠向けの「期限間近消費レコメンド」（詳細は後述、新規 Edge Function は作らない）

### やらないこと（明示的にスコープ外。Backlog へ）

- 1 日複数枠（朝食/昼食/夕食の分割） — MVP は 1 日 1 枠に固定する（`unique(user_id, planned_date)`）
- 過去週・未来複数週の一括閲覧・週送りナビゲーション（MVP は「今日から向こう 7 日」固定表示のみ）
- 献立の家族共有・複数ユーザーでの編集（Single user 前提を維持。household-sharing 実装後の
  課題として再検討）
- 献立からの自動買い物リスト生成（週初めに一括で全不足食材をまとめて登録する等） — MVP は
  日ごとの手動トリガーのみ
- 栄養バランス・カロリー計算などの献立最適化
- 献立の繰り返しテンプレート化（「毎週月曜はカレー」等）
- 実行履歴の専用集計（`meal_plans.executed_at` はあるが、レシピ実行頻度の統計等は
  `consumption-purchase.md` の Backlog（レシピ実行専用の履歴テーブル）と合わせて検討）

## 画面

| ルート             | 役割                                             |
| ------------------ | ------------------------------------------------ |
| `/_auth/meal-plan` | 週間献立プランナー（向こう 7 日、1 日 1 枠表示） |

主要 organism: `WeeklyMealPlanner`
主要 molecule: `MealSlot`

ダッシュボードから `/recipes` へのショートカットが既にある（`expiry-alert.md` 外部レシピ
提案節、`_auth.index.tsx`）のと同じ形で、ダッシュボードに `/meal-plan` へのショートカット
ボタンを追加する。フッターの 5 メニュー構成（Home / Shopping / Add / Stats / Calendar）は
変更しない（`/recipes` も同様にフッター外の導線のみ）。

### Atomic Design 分類（`docs/specs/architecture.md` 準拠）

| コンポーネント                 | 層       | 役割                                                                                                        |
| ------------------------------ | -------- | ----------------------------------------------------------------------------------------------------------- |
| `WeeklyMealPlanner`            | organism | 7 日分の `MealSlot` を並べる。データ取得・hook 呼び出し・在庫確認・buy/execute のオーケストレーションを持つ |
| `MealSlot`                     | molecule | 1 日分の枠。日付表示・割当レシピ or メモの表示・空き枠時のレコメンド表示・アクションボタン群を組む          |
| `MealSlotRecipePicker`         | molecule | 既存 `recipes` から 1 件選ぶ Select + 自由記述メモの切替 UI（`RecipeForm` のアイテム選択 UI を踏襲）        |
| `MealPlanStockWarning`         | molecule | 不足食材一覧 + 「買い物リストに追加」ボタン（`_auth.recipes.tsx` の在庫不足表示を踏襲・再利用）             |
| `MealPlanExpiryRecommendation` | molecule | 空き枠向けレコメンド（内部レシピ候補 + 外部レシピ候補の 2 段、後述）                                        |

`WeeklyMealPlanner` 以外は atoms（`Badge`, `Button` 等既存）を組み合わせるのみで、
Supabase 呼び出しは行わない（`architecture.md` の「organisms 以上でのみ hooks や Supabase
呼び出しを許可する」規約に従う）。

## データ

新規テーブル `meal_plans`。`docs/specs/database.md` の RLS ひな形（`recipe_items` と同様
`user_id` を直接持つテーブルなので `items_owner_all` と同じ単純パターン）に従う。

```sql
create table meal_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  planned_date date not null,
  recipe_id uuid null references recipes(id) on delete set null,
  note text,
  executed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, planned_date)
);

create index meal_plans_user_date_idx on meal_plans(user_id, planned_date);
```

```sql
alter table meal_plans enable row level security;

create policy "meal_plans_owner_all" on meal_plans for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create trigger meal_plans_set_updated_at before update on meal_plans
  for each row execute function public.set_updated_at();
```

- `recipe_id` は `on delete set null` — レシピが削除されても献立の記録（メモ・実行済みフラグ）
  自体は残す（`shopping_list_items.linked_item_id` と同じ「削除しても履歴は残す」方針）
- `recipe_id` と `note` は両方 `null` 許容だが、アプリ側バリデーションで
  **どちらか一方は必須**とする（両方空 = 未割当の空き枠として扱う。DB 制約
  （`check (recipe_id is not null or note is not null)`）は「割当解除」で両方 null に
  戻す操作を許可するため、DB レベルでは強制せずアプリ側でのみ検証する）
- `executed_at` は「実行」操作をした時刻。null のままでも枠の割当自体は成立する
  （計画するだけで実行しなくてもよい）
- MVP は 1 日 1 枠のため `unique(user_id, planned_date)`。将来 1 日複数枠にする場合は
  `slot text not null default 'main'` を追加し `unique(user_id, planned_date, slot)` に
  拡張する想定（Backlog）

## API（hook: `src/hooks/useMealPlans.ts`）

| hook                   | 機能                                                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `useMealPlans(range)`  | 向こう 7 日分の `meal_plans` を取得（`planned_date` が範囲内の行 + 該当レシピを join）                                         |
| `useUpsertMealPlan()`  | 枠へのレシピ割当 / メモ入力 / 割当解除（`planned_date` に対して upsert、`onConflict` は `user_id,planned_date`）               |
| `useExecuteMealPlan()` | 「実行」操作。内部で既存 `useExecuteRecipe`（`executeRecipe`）を呼び、成功後に `meal_plans.executed_at` を更新する薄いラッパー |

`useMealPlans` は `recipes` / `recipe_items` を `useRecipes()` から取得したデータと
クライアント側で join する（`recipe_id` → `RecipeWithItems`）。専用の Postgres join
（Supabase の `select("*, recipes(*)")`）を使うか、既存 `useRecipes()` のキャッシュを
再利用するかは実装時に決める（後者ならクエリキー依存が増えるだけで新規リクエストが
不要という利点がある）。

### 在庫確認・買い物リスト追加（既存ロジックの再利用）

- 在庫確認: `checkRecipeStock`（`src/types/recipe.ts`）をそのまま呼ぶ。`_auth.recipes.tsx`
  と同じく `fetchFefoLotByItemId` で FEFO ロットを取得してから渡す（`useRecipes.ts` の
  非 export 関数を re-export するか、共通ヘルパーとして切り出すかは実装時に判断）
- 不足分の買い物リスト追加: `checkRecipeStock` が返す `shortages`（`RecipeShortage[]`、
  `item_name` / `required` / `available` / `unit` を持つ）を元に、不足分
  （`required - available`）を `useUpsertShoppingItem()` へ 1 件ずつ渡してまとめて
  insert する。**既存の重複統合ロジック（`findDuplicatePlannedItem`）がそのまま効くため、
  同じアイテムが既に買い物リストにあれば数量が加算されるだけで重複行にはならない**
- ボタン押下 1 回で複数件 insert するため、失敗時は成功した分だけトーストで個別報告する
  （`consumption-purchase.md` のレシピ実行と同じ「ベストエフォート + 結果報告」方針）

### 実行（既存 `useExecuteRecipe` の再利用）

- `useExecuteMealPlan()` は内部で `executeRecipe({ recipe, itemsById, force })`
  （`src/hooks/useRecipes.ts`）をそのまま呼ぶ。**新しい消費ロジックは書かない**
- 在庫不足時の確認フロー（`status: "blocked"` → 警告表示 → `force: true` で再実行）も
  `_auth.recipes.tsx` と同じ UI パターンを踏襲する
- 実行成功（`status: "executed"` かつ `consumedItemIds.length > 0`）後、
  `meal_plans` の対象行を `executed_at = now()` に更新する
- メモのみの枠（`recipe_id` が null）は実行ボタン自体を表示しない（消費対象のレシピが
  存在しないため）

## 空き枠のレコメンド（期限間近消費）

レシピ未割当の日には、期限間近の在庫を多く消費できるレシピ・アイデアを提示する。
**新規 Edge Function は作らない**。2 段構成にする:

1. **内部レシピ優先**: ユーザーが既に登録している `recipes` / `recipe_items` の中から、
   `expiry-alert.md` の期限ステータス判定（`getExpiryStatus`）で `expired` /
   `expiring-soon` となっているアイテムをどれだけ含むかでスコアリングし、上位を提示する。
   これは新規の外部 API 呼び出しを伴わないクライアント側の純粋関数（例:
   `rankRecipesByExpiringStock(recipes, itemsById)`、`src/types/recipe.ts` に追加）で
   計算できるため、Edge Function は不要。この経路で提示したレシピは、そのまま
   `MealSlot` への割当（`useUpsertMealPlan`）に直結できる（`recipe_id` が存在するため）
2. **外部レシピのフォールバック**: 該当する内部レシピが無い/少ない場合、既存の
   `useRecipeSuggestions` hook（`expiry-alert.md` の「外部レシピ提案」節、Edge Function
   `recipe-suggest`）をその日の期限間近アイテム名でそのまま呼び出し、
   `ExpiryRecipeSuggestions` molecule と同等の見た目でアイデアとして提示する。
   これは外部サイトへのリンク集であり `recipes` テーブルの行ではないため、
   ワンタップで枠に割り当てることはできない（ユーザーがそれを見て「作る」と決めたら、
   自由記述メモとして手動入力するか、後で `/recipes` にレシピとして登録してから
   割り当てる）

`MealPlanExpiryRecommendation` molecule はこの 2 段を受け取り、内部候補があれば
「一致するレシピ」として一覧 + 割当ボタン、無ければ外部候補を「アイデア」として
リンク一覧で表示する（両方空なら何も描画しない — `ExpiryRecipeSuggestions` と同じ
静かな degrade 方針）。

## バリデーション

- `planned_date`: 必須。MVP では表示中の 7 日レンジ内の日付のみ許可（過去日への割当も
  UI 上は許容するが、レンジ外の直接編集は行わない）
- 割当時: `recipe_id` と `note` の少なくとも一方が必須（両方 null は「未割当」を意味する
  ため、upsert ではなく行削除として扱う）
- `note`: 最大文字数は `shopping_list_items.note` 等既存の自由記述欄と揃える（実装時に
  文言と合わせて確定）

## エラー

- 在庫不足時に買い物リスト追加が一部失敗: 成功件数 / 失敗件数をトーストで報告
  （`consumption-purchase.md` のレシピ実行時と同じベストエフォート方針）
- 実行（消費）失敗: 既存 `useExecuteRecipe` の `onError` / `logInsertFailed` 扱いをそのまま
  継承する
- `recipe-suggest` 呼び出し失敗・`RECIPE_API_KEY` 未設定: `expiry-alert.md` と同じく
  空配列で静かに degrade（レコメンド欄が非表示になるだけ）
- オフライン時: 割当・実行・買い物リスト追加はいずれも `requireOnline()` でブロックし
  トースト表示（既存 hook 群と同じ方針）

## i18n

新規名前空間 `mealPlan`（`src/locales/{ja,en}/mealPlan.json`）を追加する。既存の
`recipes` / `shopping` 名前空間と役割が重ならないよう、献立プランナー固有の文言のみ
ここに置く（レシピ名・買い物リスト文言は既存名前空間を再利用）。

必要なキー名（値は未定、実装時に翻訳する）:

- `title` / `subtitle`
- `dayLabel`（曜日 + 日付表示のフォーマット文言）
- `assignRecipe` / `changeRecipe` / `unassign`
- `noteOnly` / `notePlaceholder`
- `emptySlot`（何も割り当てられていない枠の表示）
- `stockOk` / `stockShortageTitle` / `stockShortageMessage`
- `addMissingToShoppingList` / `addedToShoppingList` / `addToShoppingListPartialFailure`
- `execute` / `executing` / `executeAnyway`（`recipes` 名前空間の同等キーと表現を揃える）
- `executedAt`（実行済みバッジのラベル）
- `recommendationTitle`（内部レシピ候補セクション見出し）
- `recommendationIdeasTitle`（外部レシピ候補セクション見出し）
- `loadError`

## Backlog（本 spec 内で明示的にスコープ外としたもの、再掲）

- 1 日複数枠（朝食/昼食/夕食）
- 週送りナビゲーション・過去週閲覧
- 献立の家族共有（household-sharing 実装後に再検討、`docs/specs/features/household-sharing.md`）
- 献立からの週次一括買い物リスト生成
- 栄養・カロリー計算
- 繰り返しテンプレート化
- レシピ実行頻度・献立実行の統計（`consumption-purchase.md` の「レシピ実行専用の履歴テーブル」
  Backlog と合わせて検討）

## 実装しないこと（本 PR の範囲外）

本 spec ドラフト PR では、以下を含む一切のアプリケーションコード・マイグレーションを
実装しない。実装は本 spec の承認後、`PLANS.md` §10 の breakdown に従って別 Issue・別 PR で
段階的に進める。

- `meal_plans` テーブルの migration
- `useMealPlans` / `useUpsertMealPlan` / `useExecuteMealPlan` hook
- `WeeklyMealPlanner` / `MealSlot` / `MealSlotRecipePicker` / `MealPlanStockWarning` /
  `MealPlanExpiryRecommendation` コンポーネントおよび Story
- `/_auth/meal-plan` ルート
- `mealPlan` i18n 名前空間の翻訳
- 上記に対する単体テスト・VRT
