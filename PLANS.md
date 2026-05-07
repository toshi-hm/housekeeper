# PLANS.md — housekeeper

このドキュメントは housekeeper の **要件整理〜MVP 確定までの設計記録** と、**Phase 別の TODO / 進捗管理** を統合したものです。
GitHub Issues は本ファイルから派生させて運用します（→ §10 / `.claude/commands/issue-sync.md`）。

> **更新ルール**
>
> - Step 1〜8 の決定事項は **追記型**（覆る場合は取り消し線 + 新決定）。
> - Phase 別 TODO は **チェックボックス + Issue 番号** を併記。完了は `[x]`、起票済みは `<!-- issue:#NN -->` を行末に付ける。
> - 重要な判断変更は §決定ログに必ず追記する。

---

## Step 1. 要件整理

### 1.1. 機能要件（Functional）

#### F-01. 認証

- メールアドレス + パスワードによるサインアップ / サインイン / サインアウト（Supabase Auth）
- セッション維持（`onAuthStateChange` で自動同期）
- 単一ユーザー前提だが、データはすべて `user_id` スコープで RLS

#### F-02. 在庫アイテム CRUD

- 名前・バーコード・カテゴリ・保管場所・数量・購入日・消費期限・メモ・画像 を保持
- **数量モデル（重要）**:
  - `units`: 購入時の点数（整数, 例: 3本）
  - `content_amount`: 1点あたりの内包量（数値, 例: 500.00）
  - `content_unit`: 単位（`mL` / `g` / `個` / `枚` / `本` / `袋` / etc.）
  - `opened_remaining`: 開封中 1 点の残量（`content_unit` 単位）
  - 表示はトグルで「総量」⇔「点数 × 内包量」を切替

#### F-03. バーコードスキャン → 商品検索

- カメラから読み取り（`@zxing/browser`）
- バーコード文字列を Supabase Edge Function `barcode-lookup` に投げ、Open Food Facts などから商品名/カテゴリ/画像を取得
- 取得結果でフォームを自動入力

#### F-04. 期限切れアラート

- 状態 4 種: `expired` / `expiring-soon` / `ok` / `unknown`
- 閾値: デフォルト **3 日**（ユーザーが設定で変更可能）
- 一覧バナー / カードバッジで視覚強調

#### F-05. マスタ管理（カテゴリ・保管場所）

- ユーザーごとに自由に追加 / 編集 / 削除
- 削除時に紐づく item は `null` に戻す（FK は `ON DELETE SET NULL`）

#### F-06. 在庫消費（数量デクリメント）

- 「使った」アクションで `opened_remaining` を減らす
- `opened_remaining = 0` で `units--`、`opened_remaining` は `content_amount` にリセット
- 操作ごとに `consumption_logs` に記録（item_id, delta, occurred_at）
- `units = 0` になっても **削除はせず "使い切り" 状態**にする（履歴のため）

#### F-07. 買い物リスト

- 自由入力アイテム + 既存 item からの「補充」追加
- ステータス: `planned` / `purchased`
- 「購入完了」で自動的に `items` 行を作成（quantity / 単位 / 期限を入力）

#### F-08. 画像アップロード

- Supabase Storage `item-images` バケット
- パス: `<user_id>/<item_id>.<ext>`
- private バケット + RLS、表示は signed URL（短期キャッシュ）

#### F-09. 通知（期限接近）

- ユーザーが選択可能（複数同時可）:
  - **Web Push**（Service Worker + VAPID, 主）
  - **Email**（Edge Function + Resend など、副）
  - なし
- 閾値（何日前か）と通知時刻もユーザー設定
- 配信は Edge Function を Supabase Cron (`pg_cron`) で 1 日 1 回起動

#### F-10. PWA / オフライン（参照のみ）

- `vite-plugin-pwa` でインストール可能化
- 在庫一覧 / 詳細 / バッジは **stale-while-revalidate** でオフライン参照可
- 編集系（add/update/delete/consume）はオフライン時に **エラー表示**で抑止（キューイングしない）

#### F-11. 統計ダッシュボード

- カテゴリ別在庫件数
- 期限ステータス分布（expired / expiring-soon / ok / unknown）
- 月別消費量（`consumption_logs` ベース）
- ライブラリ: Recharts（軽量）

#### F-12. i18n（日本語 / 英語）

- `react-i18next` + 名前空間別 JSON
- 言語切替は設定画面 + ブラウザ言語フォールバック（`ja` がデフォルト）
- 日付フォーマット / 数値フォーマットも localize

### 1.2. 非機能要件（Non-Functional）

| 区分             | 要件                                                                                   |
| ---------------- | -------------------------------------------------------------------------------------- |
| パフォーマンス   | 一覧 200 件で初回描画 < 1.5s（モバイル 4G）、画像は遅延ロード                          |
| セキュリティ     | Supabase RLS による完全分離、Storage は signed URL のみ、Push は VAPID                 |
| 可用性           | 静的ホスティング（Cloudflare Pages）。Edge Function は Supabase 標準 SLA               |
| アクセシビリティ | キーボード操作、ラベル付与、コントラスト AA                                            |
| テスト           | `bun test`（happy-dom）でユーティリティ・hooks をユニットカバレッジ目標 70%、VRT で UI |
| 開発体験         | TypeScript strict、`oxlint` / `oxfmt` / `eslint`（既存）必須通過                       |
| モバイル         | 主要動線はワンハンド操作（ボタンは画面下〜中央寄せ、44px+）                            |

### 1.3. 決定事項

- 単一ユーザー前提を維持（共有は将来 Backlog）
- ダークモード / CSV エクスポートは Backlog
- 通知は **Push と Email のユーザー選択制**
- オフラインは **参照のみ**（編集オフラインキューは作らない）
- テストランナーは `bun test`（Vitest 不採用）
- 数量は `units × content_amount` モデル、開封中残量を別カラムで保持

---

## Step 2. ユースケース設計

### 2.1. 主要アクター

- **オーナー（単一ユーザー）**: 全機能を利用。サインイン済み。
- **未認証ユーザー**: `/login` 以外アクセス不可。

### 2.2. 主要ユースケース一覧

| ID    | ユースケース                  | トリガ                         | 主フロー                                                     | 完了状態                                    |
| ----- | ----------------------------- | ------------------------------ | ------------------------------------------------------------ | ------------------------------------------- |
| UC-01 | サインアップ                  | `/login` のサインアップタブ    | email + password 入力 → アカウント作成 → ダッシュボード      | 認証済みでホーム到達                        |
| UC-02 | サインイン                    | `/login`                       | email + password → 認証成功                                  | ダッシュボード表示                          |
| UC-03 | バーコードで在庫追加          | ホームの「Add」→ Scan ボタン   | カメラ起動 → 読取 → 商品情報取得 → 数量/期限/場所入力 → 保存 | items に行追加・一覧反映                    |
| UC-04 | 手動で在庫追加                | ホームの「Add」→ 手入力        | フォーム入力 → 保存                                          | 同上                                        |
| UC-05 | 在庫を編集                    | item 詳細「Edit」              | フォーム → 保存                                              | 値更新                                      |
| UC-06 | 在庫を消費（使う）            | item 詳細「Use」               | 量を入力 → opened_remaining 減算 / units 自動デクリメント    | 残量更新・消費ログ追加                      |
| UC-07 | 在庫を削除                    | item 詳細「Delete」            | 確認ダイアログ → 削除                                        | items 行削除                                |
| UC-08 | 期限近いものを把握            | ホーム閲覧                     | バナー & カードのバッジで把握                                | ユーザー認知                                |
| UC-09 | 検索・絞り込み                | 検索ボックス / フィルタ        | 名前/バーコード/カテゴリ/保管場所/期限ステータス で絞る      | 結果一覧                                    |
| UC-10 | 買い物リストに追加            | 既存 item「補充」 or 自由入力  | 名称・希望数量入力                                           | shopping_list_items に追加                  |
| UC-11 | 買い物リストから購入完了      | shopping list の item「購入」  | 数量/単位/期限を入力 → items 化                              | inventory に反映、shopping_list は archived |
| UC-12 | カテゴリ / 保管場所マスタ管理 | 設定画面                       | 追加・改名・削除                                             | マスタ更新、参照 item は SET NULL           |
| UC-13 | 通知設定                      | 設定画面                       | Push / Email / 閾値日数 / 通知時刻 を選択                    | preference 保存・購読                       |
| UC-14 | 通知受信                      | バックエンドのスケジュール配信 | 期限接近/超過の item を通知                                  | OS 通知 or 受信メール                       |
| UC-15 | 統計を見る                    | ダッシュボード「Stats」タブ    | グラフ表示                                                   | カテゴリ/期限/消費量を可視化                |
| UC-16 | 言語切替                      | 設定画面                       | ja/en 選択                                                   | 全 UI が即時切替                            |
| UC-17 | オフライン参照                | 機内で起動                     | キャッシュから一覧表示                                       | 編集系は disabled / トースト警告            |

### 2.3. 決定事項

- 主要動線は「**追加 / 確認 / 消費**」の 3 つ。これを最短 2 タップに収める設計を Step 3 で行う。
- 削除はソフトデリートしない（履歴は consumption_logs / purchases で表現）。
- 「使い切り」状態（units=0 & opened_remaining=0）は表示上は淡色化、フィルタで除外可能。

---

## Step 3. 画面設計・UI 設計

### 3.1. ルーティング（TanStack Router）

```
src/routes/
  __root.tsx
  login.tsx                              # 未認証
  _auth.tsx                              # 認証ガード
  _auth.index.tsx                        # ダッシュボード（一覧）
  _auth.items.new.tsx                    # 在庫追加
  _auth.items.$itemId.tsx                # 在庫詳細
  _auth.items.$itemId.edit.tsx           # 在庫編集
  _auth.items.$itemId.consume.tsx        # 消費フォーム（モーダル/ページ）  ※新規
  _auth.shopping.tsx                     # 買い物リスト                       ※新規
  _auth.stats.tsx                        # 統計                                ※新規
  _auth.settings.tsx                     # 設定（マスタ/通知/言語/閾値）       ※新規
  _auth.settings.categories.tsx          # カテゴリ管理                        ※新規
  _auth.settings.locations.tsx           # 保管場所管理                        ※新規
```

### 3.2. 主要画面とコンポーネント

| 画面              | template / page           | 主な organisms                                                    | 主な molecules / atoms                        |
| ----------------- | ------------------------- | ----------------------------------------------------------------- | --------------------------------------------- |
| ログイン          | `LoginPage`               | `AuthForm`                                                        | FormField, Button, Input                      |
| ダッシュボード    | `DashboardPage`           | `ItemList`, `ExpiryBanner`, `Header`                              | `ItemCard`, `SearchBar`, `FilterChips`        |
| 在庫追加          | `ItemNewPage`             | `ItemForm`, `BarcodeScanner`                                      | FormField, ImageUploader, QuantityInput       |
| 在庫詳細          | `ItemDetailPage`          | `ItemDetailView`, `ConsumeButton`                                 | `ExpiryBadge`, `QuantityDisplay`, `ItemImage` |
| 在庫編集          | `ItemEditPage`            | `ItemForm`                                                        | 同上                                          |
| 消費              | `ItemConsumePage` (modal) | `ConsumeForm`                                                     | `QuantityInput`, `UnitToggle`                 |
| 買い物リスト      | `ShoppingPage`            | `ShoppingList`, `ShoppingForm`                                    | `ShoppingRow`                                 |
| 統計              | `StatsPage`               | `CategoryStatsChart`, `ExpiryStatsChart`, `ConsumptionTrendChart` | —                                             |
| 設定              | `SettingsPage`            | `NotificationSettings`, `LanguageToggle`, `MasterDataLinks`       | Toggle, Select                                |
| カテゴリ/保管場所 | `MasterDataPage`          | `MasterDataList`, `MasterDataForm`                                | Input, Button                                 |

### 3.3. 主要 atoms / molecules（追加分）

- atoms: `QuantityDisplay`, `UnitToggle`, `EmptyState`, `Spinner`, `Toast`, `ImageThumbnail`, `LanguageBadge`
- molecules: `QuantityInput`（units / amount / unit を 1 つの編集 UI に）、`ImageUploader`（drop + Storage 連携）、`FilterChips`（期限/カテゴリ/場所）、`ConfirmDialog`、`ShoppingRow`

### 3.4. モバイル UX 規約

- 下部固定の「+ Add」ボタン（ダッシュボード）
- 一覧はカード 2 列（sm 以上で 3 列）
- 主要アクションは親指リーチ範囲（画面下 3 分の 1）に配置
- スキャナはフルスクリーンモーダル

### 3.5. 決定事項

- 統計は **タブ切替ではなく独立ルート** `/stats`（深掘り時の URL 共有のため）
- 設定はサブルートで構造化（`/settings/categories`, `/settings/locations`）
- 消費 (`/consume`) はモーダルではなく **ルート扱い**（戻るで詳細に戻る、リロードに耐える）

---

## Step 4. データ設計

### 4.1. テーブル一覧（Postgres / Supabase）

```sql
-- すべて RLS 有効、ポリシー: auth.uid() = user_id

categories                -- カテゴリマスタ
storage_locations         -- 保管場所マスタ
items                     -- 在庫
consumption_logs          -- 消費イベント
shopping_list_items       -- 買い物リスト
notification_preferences  -- 通知設定（1 user 1 行）
push_subscriptions        -- Web Push 購読（複数デバイス可）
user_settings             -- 言語/期限閾値/通知時刻 など（1 user 1 行）
```

詳細は `docs/specs/database.md` に集約。各列・FK・index は同ファイルが SOT（Single Source of Truth）。

### 4.2. items の数量モデル詳細

```
units: int                      -- 残点数（購入時に確定、消費で減る）
content_amount: numeric(12,2)   -- 1 点あたりの内包量
content_unit: text              -- 'mL' | 'g' | 'kg' | 'L' | '個' | '枚' | '本' | '袋' | etc.
opened_remaining: numeric(12,2) -- 開封中 1 点の残量。null は未開封
```

**消費アルゴリズム**:

1. `delta` を `opened_remaining` から減算
2. `opened_remaining < 0` になったら、不足分を次の点から消費
   - `units -= ceil(不足 / content_amount)`
   - `opened_remaining = content_amount - (不足 % content_amount)` （0 なら content_amount）
3. `units < 0` は不可（バリデーション）
4. 全工程を `consumption_logs` に 1 行追加（before/after を持たせる）

### 4.3. consumption_logs

```sql
id uuid pk,
user_id uuid,
item_id uuid references items(id) on delete cascade,
delta_amount numeric(12,2) not null,
delta_unit text not null,
units_before int not null,
units_after int not null,
opened_remaining_before numeric(12,2),
opened_remaining_after numeric(12,2),
occurred_at timestamptz default now()
```

### 4.4. shopping_list_items

```sql
id uuid pk,
user_id uuid,
name text not null,
desired_units int not null default 1,
linked_item_id uuid null references items(id) on delete set null, -- 補充元
note text,
status text not null check (status in ('planned','purchased')) default 'planned',
purchased_at timestamptz,
created_item_id uuid null references items(id) on delete set null  -- 購入完了で生成された item
```

### 4.5. notification_preferences / push_subscriptions / user_settings

- `notification_preferences`: `push_enabled bool`, `email_enabled bool`, `threshold_days int default 3`, `notify_at time default '08:00'`
- `push_subscriptions`: `endpoint text`, `p256dh text`, `auth text`, `user_agent text`, `created_at`
- `user_settings`: `language text default 'ja'`, `default_unit text default 'mL'`, `expiry_warning_days int default 3`

### 4.6. Storage バケット

- `item-images`（private）。RLS: `bucket_id = 'item-images' AND (storage.foldername(name))[1] = auth.uid()::text`
- 取得は `createSignedUrl(60 * 60)` で 1 時間署名 URL

### 4.7. 決定事項

- マスタテーブルは **user スコープ**（共通マスタは持たない）
- 削除戦略: マスタは `SET NULL`、items 削除は `consumption_logs` を `CASCADE`（履歴は item 単位で意味を持つため）
- `expiry_warning_days` は `user_settings` に保持（既存 `EXPIRY_WARNING_DAYS = 3` 定数は廃止予定）

---

## Step 5. API 設計・処理設計

### 5.1. 大方針

- **クライアントから直接 Supabase へ**（PostgREST / Auth / Storage / Functions）
- バックエンド独自サーバなし
- CORS 突破 / 秘匿が必要な処理のみ Edge Function

### 5.2. Edge Functions

| 名前                        | 役割                                             | トリガ                                       | 状況                  |
| --------------------------- | ------------------------------------------------ | -------------------------------------------- | --------------------- |
| `barcode-lookup`            | Open Food Facts などへ問い合わせて商品情報を返す | クライアントから `supabase.functions.invoke` | 既存                  |
| `send-expiry-notifications` | 期限接近 item を集計し Push / Email を配信       | `pg_cron` で daily                           | 新規                  |
| `subscribe-push`            | VAPID で Web Push 購読を登録                     | クライアント                                 | 新規（or RPC でも可） |

### 5.3. クライアント処理層

- `src/hooks/` に Query / Mutation を集約
- 直接 `supabase.from(...)` はコンポーネントから呼ばない（hook 経由）
- バリデーションは Zod スキーマ（`src/types/`）で **入力前 / レスポンス後** 両方

### 5.4. 主要 API（hook 単位）

| hook                                                                    | 操作               | キャッシュキー                                     |
| ----------------------------------------------------------------------- | ------------------ | -------------------------------------------------- |
| `useItems`                                                              | 一覧 (filter 付き) | `['items', filters]`                               |
| `useItem(id)`                                                           | 単体               | `['items', id]`                                    |
| `useCreateItem` / `useUpdateItem` / `useDeleteItem`                     | CUD                | invalidate `['items']`                             |
| `useConsumeItem(id)`                                                    | 消費               | invalidate `['items', id]`, `['consumption-logs']` |
| `useConsumptionLogs(itemId?)`                                           | 消費履歴           | `['consumption-logs', itemId]`                     |
| `useCategories` / `useStorageLocations`                                 | マスタ             | `['categories']` / `['locations']`                 |
| `useShoppingList` / `useUpsertShoppingItem` / `usePurchaseShoppingItem` | 買い物             | `['shopping']`                                     |
| `useBarcodeLookup`                                                      | 商品検索           | キャッシュなし                                     |
| `useUploadItemImage`                                                    | 画像アップロード   | invalidate item                                    |
| `useNotificationPreferences` / `usePushSubscription`                    | 通知               | `['preferences']`                                  |
| `useUserSettings`                                                       | 設定               | `['settings']`                                     |

### 5.5. 決定事項

- 1 hook = 1 関心。CRUD はコロケーション。
- 楽観更新は **数量消費** と **チェックボックス系** にのみ適用（add/edit は通常）。
- Edge Function 経由は最小限。RLS で済むものは直接呼ぶ。

---

## Step 6. 状態管理・データ取得設計

### 6.1. レイヤー分け

| レイヤー             | ライブラリ / 仕組み                      | 用途                                        |
| -------------------- | ---------------------------------------- | ------------------------------------------- |
| サーバ状態           | TanStack Query v5                        | items / logs / shopping / settings 等すべて |
| URL 状態             | TanStack Router の searchParams / params | 検索クエリ・フィルタ・ページング            |
| グローバル UI 状態   | React Context（最小）                    | Toast、Auth セッション、i18n                |
| ローカル UI 状態     | `useState` / `useReducer`                | フォーム入力、モーダル開閉                  |
| 永続クライアント状態 | `localStorage` 経由のラッパー            | 言語選択、最後に選んだフィルタ、単位トグル  |

### 6.2. 認証セッション

- `src/lib/auth.tsx` に `AuthProvider`（既存 `_auth.tsx` で利用）
- セッションは Supabase が cookie 管理。ガードは `_auth.tsx` で `redirect`

### 6.3. キャッシュ戦略

- `staleTime`: 一覧 30s、設定/マスタ 5min、消費ログ 0
- `refetchOnWindowFocus`: true
- PWA オフライン時は **persisted query**（`@tanstack/query-sync-storage-persister` + IndexedDB）で last-known を表示

### 6.4. 決定事項

- グローバル状態は最小化（Auth, Toast, i18n のみ）。
- 「フィルタ条件」は URL に置く（共有 / 戻る対応）。
- 「単位トグル」は item 単位の表示状態 → URL ではなく localStorage。

---

## Step 7. エラー・例外設計

### 7.1. エラー分類

| 分類               | 発生源                         | UX                                                             |
| ------------------ | ------------------------------ | -------------------------------------------------------------- |
| 入力検証           | Zod resolver                   | フィールド下にメッセージ                                       |
| 認証エラー         | Supabase Auth                  | サインイン画面でメッセージ、保護ルートは redirect              |
| 認可エラー (RLS)   | PostgREST                      | トースト「Permission denied」+ 一覧を再取得                    |
| ネットワーク       | fetch / Realtime               | トースト「オフラインのようです」+ Query は retry               |
| Storage 制限       | Storage API                    | フォーム下にエラー、アップロードボタン disabled                |
| Edge Function 失敗 | barcode-lookup / notifications | フォールバック（手入力可）+ 状況をログ                         |
| 競合               | items 同時更新                 | last-write-wins、ただし items の `updated_at` で楽観ロック検出 |
| オフライン編集     | PWA キャッシュからの mutation  | mutation 自体を block + トースト                               |

### 7.2. 例外境界

- ルートレベル `ErrorBoundary` で予期しない例外をキャッチ → サニタイズしたメッセージ + Reload ボタン
- 各 Page は **Loading / Empty / Error / Content** の 4 状態を必ず実装（UI 規約）

### 7.3. ログ / 観測

- v1 はクライアントの `console.error` のみ
- v1.x 以降に Sentry など（Backlog）

### 7.4. 決定事項

- すべての mutation は失敗時にトーストを出す（無音失敗の禁止）
- ItemForm は **入力中の値を localStorage に下書き保存**（ネットワーク失敗時の救済）

---

## Step 8. MVP（v1）の確定とロードマップ

### 8.1. MVP（v1）— 着地基準

> 既存実装をベースに、**抜けている重要要素**を埋めて単一ユーザーが日常運用できる状態にする。

| 区分       | スコープ                                                                 |
| ---------- | ------------------------------------------------------------------------ |
| Auth       | 既存の email/password ログイン + サインアップ + サインアウト             |
| Items      | CRUD + **画像アップロード（Storage）** + **新数量モデル** + **消費操作** |
| マスタ     | カテゴリ / 保管場所のテーブル化 + 管理画面                               |
| 期限       | 既存バッジ + 閾値をユーザー設定に逃がす                                  |
| バーコード | 既存スキャナの **読取精度改善 + フォールバック手入力**                   |
| 一覧       | フィルタ（カテゴリ/場所/期限ステータス）+ ソート（期限/購入日/作成日）   |
| i18n       | ja/en の最低限カバー（全画面）                                           |
| 設定       | 言語 / 期限閾値 / デフォルト単位                                         |
| テスト     | `bun test` 導入 + utils/hook の主要ケース + VRT 既存維持                 |
| エラー     | Toast 整備、削除確認、4 状態（Loading/Empty/Error/Content）を一覧化      |

### 8.2. v1.1（買い物 / 履歴）

- 買い物リスト（自由入力 / 補充 / 購入完了）
- 消費ログ閲覧 UI（item 詳細にタブ）

### 8.3. v1.2（通知 / PWA）

- PWA 化（インストール可・参照オフライン）
- Push / Email の選択制通知
- 通知時刻と閾値の設定

### 8.4. v1.3（統計）

- カテゴリ別在庫数
- 期限ステータス分布
- 月次消費量グラフ

### 8.5. Backlog（v2 以降 / 未確定）

- 多人数共有（家族）
- ダークモード
- CSV / JSON エクスポート
- Sentry / 観測基盤
- 定期購入予測
- 在庫推移グラフ

### 8.6. MVP の完了判定

- 既存 + 上記 v1 機能がすべて動く
- `bun run build` / `bun run lint` / `bun test` / `bun run build-storybook` がすべて緑
- 主要動線（追加 / 編集 / 消費 / 削除 / 検索）の VRT が登録済み

---

## §9. 決定ログ

| 日付       | 決定                                                        | 理由    |
| ---------- | ----------------------------------------------------------- | ------- |
| 2026-04-30 | MVP 再定義（既存実装の抜けを取り込む）                      | Q1=b    |
| 2026-04-30 | 通知は Push + Email のユーザー選択制                        | Q4=c    |
| 2026-04-30 | オフラインは参照のみ                                        | Q5=a    |
| 2026-04-30 | テストランナーは `bun test` を採用、Vitest 不採用           | Q6=b    |
| 2026-04-30 | 数量は `units × content_amount` + `opened_remaining` モデル | Q7 補足 |
| 2026-04-30 | Issue 同期は Skill (`.claude/skills/issue-sync`) で運用     | Q8=b    |

---

## §10. Phase 別 TODO（Issue 同期対象）

> **記法**:
>
> - 起票済み: `<!-- issue:#42 -->` を行末に追加
> - 完了: `[x]` に変更（Issue は close）
> - 1 行 = 1 Issue を原則
> - Skill `issue-sync`（`.claude/skills/issue-sync/SKILL.md`）で未起票分を自動起票・チェック済みを close

### v1 — MVP（既存実装の polish + 必須追加）

#### 1) 基盤 / 共通

- [x] `bun test` 環境構築（happy-dom + bun:test の preload 設定） <!-- issue:#8 -->
- [x] ESLint / oxlint / oxfmt をフックで CI 化（`bun run check` を追加） <!-- issue:#9 -->
- [x] エラーハンドリング標準化（Toast 共通、ErrorBoundary、4 状態） <!-- issue:#10 -->
- [x] 削除アクションに `ConfirmDialog` を導入 <!-- issue:#11 -->
- [x] i18n 基盤導入（react-i18next + ja/en, 名前空間: `common`/`items`/`auth`/`settings`/`shopping`/`stats`） <!-- issue:#12 -->
- [x] `user_settings` テーブル新設 + 言語 / 期限閾値 / デフォルト単位 / 通知時刻 <!-- issue:#13 -->

#### 2) データモデル / DB

- [x] migration 追加: `categories` <!-- issue:#14 -->
- [x] migration 追加: `storage_locations` <!-- issue:#15 -->
- [x] migration 追加: items 拡張（`units`, `content_amount`, `content_unit`, `opened_remaining`, `category_id`, `storage_location_id`） <!-- issue:#16 -->
- [x] migration 追加: `consumption_logs` <!-- issue:#17 -->
- [x] migration 追加: `user_settings` <!-- issue:#18 -->
- [x] migration 追加: `item-images` Storage バケット + RLS <!-- issue:#19 -->
- [x] 既存 `items.quantity` のデータマイグレーション戦略（→ `units` に移行、`content_amount=1`、`content_unit='個'` を初期値） <!-- issue:#20 -->

#### 3) 在庫機能

- [x] `useItems` を新スキーマに対応（filter / sort / pagination） <!-- issue:#21 -->
- [x] `ItemForm` 改修（QuantityInput / UnitToggle / ImageUploader） <!-- issue:#22 -->
- [x] `ItemConsumePage` 新規（消費フォーム + アルゴリズム実装） <!-- issue:#23 -->
- [x] `useConsumeItem` hook 追加（楽観更新） <!-- issue:#24 -->
- [x] 一覧フィルタ UI（カテゴリ / 場所 / 期限ステータス） <!-- issue:#25 -->
- [x] 一覧ソート UI（期限近い順 / 購入日 / 作成日） <!-- issue:#26 -->
- [x] 「使い切り」の淡色化 + 既定で隠す <!-- issue:#27 -->

#### 4) マスタ管理

- [x] `useCategories` / `useStorageLocations` hook <!-- issue:#28 -->
- [x] `MasterDataPage`（カテゴリ） <!-- issue:#29 -->
- [x] `MasterDataPage`（保管場所） <!-- issue:#30 -->
- [x] ItemForm の category / location を Select に変更 <!-- issue:#31 -->

#### 5) 画像

- [x] `useUploadItemImage` hook（Supabase Storage） <!-- issue:#32 -->
- [x] `ImageUploader` molecule（drop / preview / 差し替え） <!-- issue:#33 -->
- [x] `ItemImage` atom（signed URL の自動更新） <!-- issue:#34 -->

#### 6) バーコード

- [x] `BarcodeScanner` の読取失敗時のリトライ UI <!-- issue:#35 -->
- [x] スキャン後の手入力フォールバック導線 <!-- issue:#36 -->
- [x] `barcode-lookup` の戻り値拡張（カテゴリのマッピング案を入れる） <!-- issue:#37 -->

#### 7) 期限切れ

- [x] `EXPIRY_WARNING_DAYS` 定数を `user_settings.expiry_warning_days` に置換 <!-- issue:#38 -->
- [x] `ExpiryBadge` のテストを `bun test` で追加 <!-- issue:#39 -->

#### 8) i18n / 設定

- [x] `LanguageToggle` atom <!-- issue:#40 -->
- [x] `SettingsPage`（言語 / 閾値 / デフォルト単位） <!-- issue:#41 -->
- [x] 全画面の文言外出し（ja.json / en.json） <!-- issue:#42 -->

#### 9) テスト / VRT

- [x] `getExpiryStatus` の境界値テスト <!-- issue:#43 -->
- [x] 消費アルゴリズムのテスト（`opened_remaining` 跨ぎ、units=0、丸め誤差） <!-- issue:#44 -->
- [x] 主要 hook の happy path テスト <!-- issue:#45 -->
- [x] 新 organisms の Storybook + VRT 登録 <!-- issue:#46 -->

### v1.1 — 買い物リスト / 履歴

- [x] migration: `shopping_list_items` <!-- issue:#47 -->
- [x] `useShoppingList` / `useUpsertShoppingItem` / `usePurchaseShoppingItem` <!-- issue:#48 -->
- [x] `ShoppingPage` + `ShoppingList` organism <!-- issue:#49 -->
- [x] item 詳細に「補充」ボタン → `shopping_list_items` 追加 <!-- issue:#50 -->
- [x] 購入完了モーダル → `items` 行作成 <!-- issue:#51 -->
- [x] item 詳細に「履歴」タブ（consumption_logs） <!-- issue:#52 -->

### v1.2 — PWA / 通知

- [x] `vite-plugin-pwa` 導入（manifest / icons / install prompt） <!-- issue:#53 -->
- [x] `@tanstack/query-sync-storage-persister` + IndexedDB <!-- issue:#54 -->
- [x] サービスワーカー: stale-while-revalidate（一覧 / 詳細 / 画像） <!-- issue:#55 -->
- [x] migration: `notification_preferences`, `push_subscriptions` <!-- issue:#56 -->
- [x] Edge Function `send-expiry-notifications` <!-- issue:#57 -->
- [x] Edge Function `subscribe-push`（VAPID 鍵管理） <!-- issue:#58 -->
- [x] `NotificationSettings` organism（Push / Email / 閾値 / 時刻） <!-- issue:#59 -->
- [x] Resend など Email プロバイダ選定 + 環境変数 <!-- issue:#60 -->

### v1.3 — 統計

- [x] Recharts 導入 <!-- issue:#61 -->
- [x] `useStats` hook（集計クエリ群） <!-- issue:#62 -->
- [x] `StatsPage` + 3 グラフ organism <!-- issue:#63 -->

### v1.4 — 期限カレンダー

- [x] spec: `docs/specs/features/expiry-calendar.md` 作成 <!-- issue:#82 -->
- [ ] DB migration: `items.deleted_at timestamptz null` 追加（ソフトデリート） <!-- issue:#83 -->
- [ ] `useItems` を `deleted_at IS NULL` フィルタ対応 + `itemSchema` 更新 <!-- issue:#84 -->
- [ ] `useSoftDeleteItem` hook 追加（チェックボックスで論理削除） <!-- issue:#85 -->
- [ ] `useCreateItem` にバーコード一致ソフトデリート品の復活ロジック追加 <!-- issue:#86 -->
- [ ] カテゴリ管理にカラーピッカー追加（`categories.color` 活用） <!-- issue:#87 -->
- [ ] フッター 5 メニュー化（Calendar 追加、Add Item を `justify-around` で常に中央） <!-- issue:#88 -->
- [ ] `_auth.calendar.tsx` ルート + 上部サマリーセクション（期限切れ赤/今週黄/今月その他） <!-- issue:#89 -->
- [ ] チェックボックス → 斜線 UI + `useSoftDeleteItem` 呼び出し <!-- issue:#90 -->
- [ ] `ExpiryCalendar` organism（月ビュー、カテゴリ別色分けイベント） <!-- issue:#91 -->



- [ ] 多人数共有 <!-- issue:#64 -->
- [ ] ダークモード <!-- issue:#65 -->
- [ ] CSV / JSON エクスポート <!-- issue:#66 -->
- [ ] Sentry など観測 <!-- issue:#67 -->
- [ ] 定期購入予測 / 在庫推移グラフ <!-- issue:#68 -->

---

## §11. 関連ドキュメント

- `docs/specs/overview.md`
- `docs/specs/architecture.md`
- `docs/specs/database.md`（Step 4 の SOT）
- `docs/specs/storybook.md`
- `docs/specs/features/auth.md`
- `docs/specs/features/inventory.md`
- `docs/specs/features/barcode.md`
- `docs/specs/features/expiry-alert.md`
- `docs/specs/features/master-data.md`
- `docs/specs/features/storage.md`
- `docs/specs/features/shopping-list.md`
- `docs/specs/features/consumption-purchase.md`
- `docs/specs/features/notifications.md`
- `docs/specs/features/pwa.md`
- `docs/specs/features/i18n.md`
- `docs/specs/features/stats.md`
- `docs/specs/features/expiry-calendar.md`
- `.claude/skills/issue-sync/SKILL.md`（Issue 同期 Skill）
