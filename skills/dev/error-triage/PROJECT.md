# PROJECT: error-triage（housekeeper）

housekeeper 固有の設定。SKILL.md の一般論と矛盾する場合は**この文書が勝つ**。

## 1. 観測ソース

### 1.1. Supabase（Edge Functions / API / DB）— 主たるソース

**Supabase MCP の `query_logs`** を使う（プロジェクト ID: `fjtgddxoumiszriqmpux`）。
取得ウィンドウは最大 24 時間、`iso_timestamp_start` / `iso_timestamp_end` を必ず明示する。

主なログソース（`select distinct source from logs` で実際に存在するものを確認してから使う）:

| source               | 内容                                           | 主に見るもの           |
| -------------------- | ---------------------------------------------- | ---------------------- |
| `function_edge_logs` | Edge Function への HTTP リクエスト             | 5xx ステータス         |
| `function_logs`      | Edge Function 内の `console.*` 出力            | `console.error` の中身 |
| `edge_logs`          | API Gateway（PostgREST / Auth / Storage 経由） | 5xx、PGRST\* エラー    |
| `postgres_logs`      | Postgres 本体                                  | SQLSTATE、RLS 違反     |

```sql
-- 例: 直近ウィンドウの Edge Function 5xx を関数ごとに集計
-- ※ log_attributes の値は文字列。ステータスコードは必ず数値へキャストしてから比較する
--   （文字列比較のままだと辞書順になり、意図しない行が混ざる）
select
  log_attributes['function_id'] as fn,
  toInt32OrNull(log_attributes['status_code']) as status,
  count(*) as n
from logs
where source = 'function_edge_logs'
  and toInt32OrNull(log_attributes['status_code']) >= 500
group by fn, status
order by n desc
```

**このクエリはそのまま動くことを検証していない。** `log_attributes` のキー名
（`function_id` / `status_code`）は Supabase 側の変更で変わりうるため、
**まず 1 行を素で取得してキー構造を確認してから**集計クエリを書くこと。
キーが違っていた場合は、実際のキー名に読み替える。

> **セットアップ上の注意**: 無人セッションで `query_logs` を使うには、その MCP ツールが
> 事前に許可されている必要がある（未許可だと承認待ちで停止し、Routine は何もできずに終わる）。

### 1.2. クライアント（React アプリ）— Sentry

**Sentry MCP コネクタ**を使う。

| 項目         | 値                     |
| ------------ | ---------------------- |
| organization | `mayabase-gh`          |
| project      | `housekeeper`          |
| regionUrl    | `https://us.sentry.io` |

`VITE_SENTRY_DSN` が設定されたビルドからのみエラーが送られる
（`src/lib/sentry.ts` — DSN 未設定時は全 export が no-op）。
Sentry コネクタがセッションで使えない場合は、Supabase 側のみを対象とし、
「クライアント側は未観測」と報告に明記する。

**Sentry に送られるのはメッセージ・スタックトレース・最小限のメタデータのみ。**
`sanitizeSentryEvent` が許可リスト方式でイベントを再構築しているため、
在庫・購入履歴などのアプリデータは含まれない（`tracesSampleRate: 0`、
`sendDefaultPii: false`、breadcrumb も無効）。

### 1.3. 2 つの観測ソースの守備範囲（取り違えない）

**Sentry は Supabase ログの代わりにはならない。両方見ること。**

| 層                              | 観測ソース              | 備考                                                 |
| ------------------------------- | ----------------------- | ---------------------------------------------------- |
| React クライアント              | **Sentry**              | スタックトレース付き。原因究明はこちらが圧倒的に速い |
| Edge Functions (Deno)           | **Supabase query_logs** | Sentry 未計装（`@sentry/react` はクライアント専用）  |
| PostgREST / Auth / Storage / DB | **Supabase query_logs** | Sentry には一切上がらない                            |

Edge Function のエラーを Sentry で探しても**永遠に見つからない**。
逆にクライアントの例外は Supabase のログには出ない（`console.error` は
ブラウザ内で完結する）。片方だけ見て「エラーなし」と報告してはならない。

### 1.4. Sentry の使い方

#### 収集クエリ

```
search_issues(organizationSlug='mayabase-gh', projectSlugOrId='housekeeper',
              regionUrl='https://us.sentry.io',
              query='is:unresolved lastSeen:-3h', sort='freq', period='24h')
```

- 新規だけに絞りたいときは `is:new` / `firstSeen:-3h`
- **`is:regressed` を別途必ず確認する。** 一度 resolve されたものの再発であり、
  SKILL.md の「回帰」に相当する。優先度は高い

#### 指紋は Sentry の Issue ID をそのまま使う

Sentry は同一原因のイベントを Issue として**すでにグルーピングしている**。
自前でメッセージを正規化してハッシュを取る必要はない。
Sentry 由来のエラーは、短縮 ID（例 `HOUSEKEEPER-1A2B`）を指紋として扱い、
GitHub Issue 本文に `<!-- fingerprint:HOUSEKEEPER-1A2B -->` と埋める。

自前の指紋計算は **Supabase ログ由来のエラーにのみ**適用する。

#### 重大度の判定材料

Sentry は生ログより良い判定材料を持っている: **影響ユーザー数（userCount）**、
イベント件数、`level`、初回発生。ユーザー影響が出ているものを優先する。

#### Seer（`analyze_issue_with_seer`）

根本原因の分析に使ってよい。ただし **Seer の出力は仮説であって事実ではない**。

- Seer が示したファイル・行を**自分でコードを読んで裏取りする**
- **Seer が提案したパッチをそのまま貼らない。** このリポジトリの規約
  （アロー関数 / `interface` / `import type` / i18n キー）に沿って自分で書く
- 裏取りできなければ、Seer が何を言ったかに関わらず「原因未特定」として扱う

#### Sentry への書き込みは禁止

`update_issue` などで Sentry の Issue を **resolve / ignore / assign しない。**
このスキルは PR を出すだけで、修正はまだマージも本番反映もされていない。
resolve すると「直っていないのに直った」状態になり、次回以降の再発検知
（`is:regressed`）まで壊れる。Sentry は**読み取り専用**で扱う。

## 2. 除外パターン（＝仕様どおりの動作。エラーではない）

このリポジトリの Edge Function は、**異常系を意図的に 4xx で返す設計**である。
以下は絶対にトリアージ対象にしない:

| 対象                                                                                                                                    | 理由                                                                                   |
| --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **ユーザーが叩く**関数の **401**（下記の例外を除く）                                                                                    | `Authorization` ヘッダ無し / 不正 JWT の正常拒否                                       |
| `alexa-skill` の **403**                                                                                                                | Skill ID 検証の正常拒否                                                                |
| **429**（`barcode-lookup` / `inventory-chat` / `recipe-suggest` / `receipt-scan` / `get-security-question` / `verify-security-answer`） | レート制限が正しく効いている（`_shared/rate-limit.ts` ほか）                           |
| `image-proxy` の **400**                                                                                                                | 許可外 URL・不正なリクエストの正常拒否                                                 |
| 各関数の **405**                                                                                                                        | 想定外 HTTP メソッドの正常拒否                                                         |
| その他 **400**（入力バリデーション）                                                                                                    | クライアントの不正入力に対する正常応答                                                 |
| 外部 API（Yahoo!ショッピング / Gemini）由来の 5xx・timeout                                                                              | 自リポジトリのコードでは直せない。契約変更の疑いがあれば `api-contract-monitor` の領分 |

**対象にするのは原則 5xx**、および `function_logs` の `console.error` のうち
上記の正常系フローに属さないもの。

### 2.0. Sentry（クライアント）側の除外パターン

ブラウザから上がるエラーには、アプリのバグではないものが大量に混ざる。
以下はトリアージ対象にしない:

| 対象                                                           | 理由                                                     |
| -------------------------------------------------------------- | -------------------------------------------------------- |
| `ResizeObserver loop ...`                                      | ブラウザ実装由来の既知ノイズ。実害がない                 |
| ブラウザ拡張由来（`chrome-extension://` などがフレームに出る） | ユーザーの拡張機能の問題。こちらでは直せない             |
| `Failed to fetch` / `Load failed` / `NetworkError` 単発        | ユーザーの通信断・タブクローズ。PWA なので日常的に起きる |
| 認証セッション期限切れに伴う 401 と、その後の再ログイン        | 設計どおりの挙動                                         |
| 古いキャッシュされた Service Worker 由来の `ChunkLoadError`    | デプロイ直後に起きる。SW 更新で自然に解消する            |

ただし**同じものが継続的に大量発生している場合は別**。
`Failed to fetch` が特定のエンドポイントに集中しているなら、それは通信断ではなく
こちら側の障害である。件数と集中度を見て判断すること。

### 2.1. 除外の例外 —「401 だが異常」なケース（重要）

**`send-expiry-notifications` の 401 は除外してはならない。**
この関数はユーザーではなく **pg_cron が `CRON_SECRET` を付けて呼ぶ**
（`isAuthorizedCronRequest` / `20260712000001_add_cron_secret_to_expiry_notifications.sql`）。
ここで 401 が出ているということは **cron 側のシークレットが壊れており、期限通知が
黙って止まっている**ことを意味する。ユーザーには「通知が来ない」としてしか見えず、
気づきにくい種類の障害なので、**high として扱う**。

一般則: **機械（cron / 外部サービス）が呼ぶエンドポイントの 401 / 403 は異常**である。
除外してよいのは、人間のクライアントが叩くエンドポイントの 401 / 403 だけ。

### 2.2. 「5xx だがコードでは直せない」ケース → Issue 起票のみ

Edge Function は**シークレット未設定を 500 で返す**。これはコードのバグではなく
Supabase 側の設定不備であり、リポジトリを修正しても直らない。
以下は原因を明記した Issue を起票するだけにとどめ、**コードを書き換えない**:

| ログの目印                                                | 実際に必要な対処                               |
| --------------------------------------------------------- | ---------------------------------------------- |
| `missing_api_config` / `YAHOO_SHOPPING_APP_ID is not set` | `supabase secrets set YAHOO_SHOPPING_APP_ID=…` |
| `VAPID secrets not configured`                            | VAPID 3 種のシークレット設定                   |
| `[alexa-skill] ALEXA_SKILL_ID is not configured`          | `ALEXA_SKILL_ID` の設定                        |
| Gemini API キー未設定由来の 500                           | `GEMINI_API_KEY` の設定                        |

この種の 500 に対して「環境変数が無いときのフォールバックを実装する」といった
**回避コードを書いてはならない**。設定漏れが隠れて、より分かりにくくなる。

## 3. 実行ガード（housekeeper の値）

| 項目                     | 値                                                       |
| ------------------------ | -------------------------------------------------------- |
| 新規エラーの Issue 起票  | **全件**（上限なし。検知は絞らない）                     |
| 1 実行で作る修正 PR      | **最大 3 件**（重大な順）                                |
| open な自動 PR の上限    | **5 本**（超えていたら修正を止め、Issue 起票のみ続ける） |
| 同一指紋の自動修正の上限 | **2 回**（3 回目は `needs-human` として人間に回す）      |

**方針: 検知は網羅、修正は絞る。**
バグの存在は 1 分でも早く知りたい。一方、修正 PR は最終的に人間のレビューが律速であり、
同じファイルに触る PR を同時に何本も開くとコンフリクトして、かえって解消が遅くなる。
そのため Issue 起票は全件行い、PR の本数だけを制限する。

「open な PR が 5 本」に達しても**検知と Issue 起票は止めない**。
止めるのは修正 PR の作成だけである。

## 4. GitHub の扱い

### 4.1. Issue を先に立てる（必須）

`.github/workflows/pr-issue-link-check.yml` により、**PR 本文に `Closes #NN` 形式の
Issue リンクが無いと CI が落ちる**。したがって順序は必ず:

1. 指紋ごとに **Issue を起票**（本文末尾に `<!-- fingerprint:xxxxxxxx -->` を埋め込む）
2. 修正 PR の本文に `Closes #NN` を書く

Issue 本文の指紋コメントが、実行をまたいだ**唯一の永続的な重複排除の記録**である
（Routine のセッションとコンテナは毎回破棄される）。

### 4.2. ラベル

| ラベル        | 用途                                                              |
| ------------- | ----------------------------------------------------------------- |
| `auto-triage` | このスキルが起票した Issue / PR すべてに付ける（検索用）          |
| `needs-human` | 自動修正を諦めた / 人間の判断が必要                               |
| `fix`         | `fix/` ブランチに `auto-label.yml` が自動で付ける（手動付与不要） |

`skip-issue-link` ラベルは**使わない**（Issue リンクの規約を迂回しない）。

### 4.3. ブランチ・コミット

- ブランチ: `fix/auto-triage-<fingerprint>`
- コミット: Conventional Commits。type は `fix` を使う。
  subject は **80 文字以内**（`commitlint.config.ts` で強制）
- 使える type: `feat` / `fix` / `add` / `docs` / `refactor` / `test` / `chore` / `ci` / `perf` / `revert`

### 4.4. GitHub 操作の手段

セッションに応じて使い分ける（`gh` CLI が無い実行環境がある）:

1. `gh` CLI が認証済みならそれを使う（`gh auth status` で確認）
2. 無ければ GitHub MCP ツール（`mcp__github__*`）を使う

## 5. 検証コマンド（PR を出す前に必ず全通し）

```bash
npx oxfmt .          # フォーマット自動修正
bun run check        # lint（oxlint + eslint + stylelint）+ typecheck
bun test             # 単体テスト
```

- パッケージマネージャは **bun**。`npm` / `yarn` は使わない
- Edge Function（Deno）を触った場合は `deno.json` のタスクも確認する
- E2E（`bun run test:e2e`）と DB テスト（`bun run test:db`）は重く、
  ローカル Supabase 起動が要るため**無人実行では回さない**。CI に委ねる

## 6. 修正時に守るコード規約

`CLAUDE.md` の規約に従う。特に無人実行で破りやすいもの:

- `function` 宣言禁止 → `const fn = () => {}`
- `type` ではなく `interface`（ユニオン型など表現できない場合を除く）
- 型のみの import は `import type`
- `any` 禁止。不明な値は `unknown` + Zod
- Supabase クライアントの初期化は `src/lib/supabase.ts` のみ
- atoms / molecules / organisms を新規作成したら `.stories.tsx` を同時に作る
  （ただしエラー修正で新規コンポーネントを作ることは稀。**修正は最小限に**）
- i18n キーは `t()` に文字列リテラル。動的参照は Key Map 経由

## 7. 定期実行（Claude Code Routine）の設定

Claude Code の Routine は **cron またはワンショットでしか起動できない**
（外部から叩ける受信 Webhook URL は持たない。最小間隔は 1 時間）。
したがって「エラー発生の瞬間に起動」ではなく、**定期ポーリング**で運用する。

推奨設定:

| 項目           | 値                                                            |
| -------------- | ------------------------------------------------------------- |
| cron           | `0 */2 * * *`（2 時間ごと）                                   |
| 起動モード     | 毎回新しいセッション（`create_new_session_on_fire: true`）    |
| 通知           | push 有効                                                     |
| 取得ウィンドウ | 直近 3 時間（実行間隔より広めに取り、境界の取りこぼしを防ぐ） |

検知の遅れは、実行間隔がそのまま上限になる（2 時間ごとなら最悪 2 時間気づけない）。
早く直したいなら**間隔を詰めるのが最も効く**。1 実行あたりの修正件数を増やしても、
「発生から気づくまで」は縮まらない。cron の下限は 1 時間なので、
さらに詰めたければ `0 * * * *` にする。

間隔を変えたら**取得ウィンドウも合わせて変える**こと
（ウィンドウが間隔より狭いと、その隙間に出たエラーを永久に取りこぼす）。

Routine に渡すプロンプト:

```text
housekeeper（toshi-hm/housekeeper）の本番エラーを定期トリアージする。

## 最初にすること

リポジトリの次の2ファイルを読み、そこに書かれた手順どおりに実行する。
この2ファイルが手順の正本であり、このプロンプトと矛盾する場合は2ファイルが優先する。

- skills/dev/error-triage/SKILL.md   … 手順の本体
- skills/dev/error-triage/PROJECT.md … housekeeper 固有の設定・除外パターン

## 中止条件（無理に進めず、理由だけ報告して終了する）

- 上記ファイルが見つからない
- Supabase MCP と Sentry コネクタの**両方**が使えない
  （片方だけ使える場合は、使える方を見たうえで「もう片方は未観測」と明記して続行する）

## やること

1. エラーを2つのソースから収集する。**両方必ず見ること。片方だけで「エラーなし」と
   報告しない**
   - **Sentry**（org: mayabase-gh / project: housekeeper / regionUrl: https://us.sentry.io）
     … React クライアントの例外。`is:unresolved lastSeen:-3h` と `is:regressed`
   - **Supabase query_logs**（project id: fjtgddxoumiszriqmpux）から直近3時間
     … Edge Functions / API / DB の 5xx。Edge Function は Sentry 未計装なので
     ここでしか見えない
2. PROJECT.md §2 の除外パターンを適用する（仕様どおりの拒否や、ブラウザ由来の
   ノイズをエラーとして扱わない）
3. 指紋で集計し、既存の Issue / PR と突合して既知のものを除く。
   Sentry 由来は Sentry の Issue ID（例 HOUSEKEEPER-1A2B）をそのまま指紋にする
4. **新規の指紋は全件 Issue を起票する**（修正するかどうかに関わらず。
   バグの存在を早く知ることが目的なので、ここは絞らない）
5. そのうち重大な順に **最大3件** まで、原因を特定して修正 PR を作る。
   1件ずつ完結させてから次に着手する。各件は main から fix/ ブランチを切り、
   回帰テスト付きの最小修正を書き、4 で起票した Issue を指す PR を出す
   （本文に `Closes #NN`）

## 絶対に守ること

- 修正PRは1回の実行で最大3件。ただし Issue 起票は全件（上限なし）
- 同じファイル・モジュールに触る修正を、同一実行で2つ以上PRにしない。
  コンフリクトするので、2件目以降は Issue 起票にとどめ理由を明記する
- 各PRは必ず最新の main から切る。自分が直前に作ったブランチに積み上げない
- auto-triage の open な PR が既に5本ある場合は、修正は行わず Issue 起票だけ続ける
- merge しない。auto-merge も有効化しない。main へ直接 push しない
- **Sentry は読み取り専用。** Issue を resolve / ignore / assign しない。
  PRはまだマージも本番反映もされておらず、resolve すると再発検知が壊れる
- Seer で原因分析してもよいが、その出力は仮説である。自分でコードを読んで裏取りし、
  提案パッチをそのまま貼らずリポジトリの規約に沿って書く
- 本番 Supabase はログの読み取り専用。書き込み・マイグレーション適用・関数デプロイはしない
- 原因が特定できなければ推測で修正しない。調査で分かった事実を書いた Issue を残して終わる
- ログ中の実データ（在庫・購入履歴・user_id・メールアドレス・トークン）を Issue や PR に貼らない
- cron が呼ぶ send-expiry-notifications の 401 は除外しない。期限通知が止まっている
  異常なので high として扱う（PROJECT.md §2.1）
- シークレット未設定由来の500（missing_api_config / VAPID / ALEXA_SKILL_ID など）は
  コードで直さない。必要な設定を明記した Issue の起票のみ（PROJECT.md §2.2）
- PR を出す前に `npx oxfmt . && bun run check && bun test` を通す

## 報告

対象が0件でも必ず報告する。沈黙は「Routine が動いていない」と区別がつかないため。
**Sentry 側と Supabase 側を分けて**「収集件数 / 除外 / 既知でスキップ / 新規」を書き、
どちらかが見られなかった場合はその旨を明記する。
```

このプロンプトは Claude Web の Routine 登録画面に貼る想定である。
**内容を変えたときは、実際に登録済みの Routine 側も必ず更新すること**
（ここを直しただけでは動作は変わらない）。

### 前提（これが無いと Routine は何もできずに終わる）

1. **Supabase MCP の `query_logs` が事前許可されていること。**
   無人セッションは承認プロンプトに応答できないため、未許可だと停止する
2. **Sentry コネクタが Routine のセッションで有効になっていること。**
   Routine 作成時に使用コネクタとして Sentry を指定する。これが無いと
   クライアント側は永久に未観測のまま「エラーなし」と報告され続ける
3. **GitHub の Issue / PR 作成手段**（`gh` CLI 認証済み、または GitHub MCP）が使えること
4. このスキルが **main にマージ済み**であること（Routine のセッションは既定ブランチを
   チェックアウトするため、未マージだとスキル本体が存在しない）
5. **`VITE_SENTRY_DSN` が本番ビルドに設定されていること。**
   未設定のビルドが動いている限り Sentry には何も届かない（`src/lib/sentry.ts` が no-op）。
   これは **Vite のビルド時変数**であり、Cloudflare のランタイムシークレットではない
   （`import.meta.env` はビルド時に JS へ埋め込まれる）。
   Cloudflare の**ビルド設定側**の環境変数に入れ、**設定後に再デプロイする**こと。
   `wrangler secret put` で入れても反映されない

## 8. このプロジェクトで特にやってはいけないこと

- **本番 Supabase への書き込み**。`apply_migration` / `execute_sql` の書き込み系 /
  `deploy_edge_function` を実行しない。**ログの読み取り専用**
- 在庫・購入履歴・レシピなどの**実データを Issue / PR に貼る**こと。
  ユーザーの生活記録そのものであり、公開リポジトリに残してはならない。
  件数や構造のみを書く
- `user_id` / メールアドレス / JWT / API キーの貼り付け。伏せ字にする
- RLS ポリシーの変更（`docs/specs/database.md` の設計判断であり、自動修正の対象外）
- `PLANS.md` の書き換え（`issue-sync` スキルの領分）
