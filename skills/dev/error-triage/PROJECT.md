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

### 1.2. クライアント（React アプリ）

`VITE_SENTRY_DSN` が設定されている場合のみ Sentry にエラーが送られる
（`src/lib/sentry.ts` — DSN 未設定時は全 export が no-op）。

- **DSN 未設定なら、クライアント側の観測ソースは存在しない。**
  その場合は Supabase 側のみを対象とし、「クライアント側は未観測」と報告に明記する
- Sentry を見る手段（MCP / API トークン）がセッションに無い場合も同様に明記する
- Sentry に送られるのはメッセージ・スタックトレース・最小限のメタデータのみ
  （`sanitizeSentryEvent` が許可リスト方式で再構築している）。在庫データは含まれない

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
- Supabase MCP の query_logs が使えない（未接続・未許可）

## やること

1. Supabase のログ（project id: fjtgddxoumiszriqmpux）から直近3時間のエラーを収集する
2. PROJECT.md §2 の除外パターンを適用する（仕様どおりの拒否をエラーとして扱わない）
3. 指紋化して集計し、既存の Issue / PR と突合して既知のものを除く
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
- 本番 Supabase はログの読み取り専用。書き込み・マイグレーション適用・関数デプロイはしない
- 原因が特定できなければ推測で修正しない。調査で分かった事実を書いた Issue を残して終わる
- ログ中の実データ（在庫・購入履歴・user_id・メールアドレス・トークン）を Issue や PR に貼らない
- cron が呼ぶ send-expiry-notifications の 401 は除外しない。期限通知が止まっている
  異常なので high として扱う（PROJECT.md §2.1）
- シークレット未設定由来の500（missing_api_config / VAPID / ALEXA_SKILL_ID など）は
  コードで直さない。必要な設定を明記した Issue の起票のみ（PROJECT.md §2.2）
- PR を出す前に `npx oxfmt . && bun run check && bun test` を通す

## 報告

対象が0件でも「収集件数 / 除外 / 既知でスキップ / 新規」を1〜2行で必ず報告する。
沈黙は「Routine が動いていない」と区別がつかないため。
```

このプロンプトは Claude Web の Routine 登録画面に貼る想定である。
**内容を変えたときは、実際に登録済みの Routine 側も必ず更新すること**
（ここを直しただけでは動作は変わらない）。

### 前提（これが無いと Routine は何もできずに終わる）

1. **Supabase MCP の `query_logs` が事前許可されていること。**
   無人セッションは承認プロンプトに応答できないため、未許可だと停止する
2. **GitHub の Issue / PR 作成手段**（`gh` CLI 認証済み、または GitHub MCP）が使えること
3. このスキルが **main にマージ済み**であること（Routine のセッションは既定ブランチを
   チェックアウトするため、未マージだとスキル本体が存在しない）

## 8. このプロジェクトで特にやってはいけないこと

- **本番 Supabase への書き込み**。`apply_migration` / `execute_sql` の書き込み系 /
  `deploy_edge_function` を実行しない。**ログの読み取り専用**
- 在庫・購入履歴・レシピなどの**実データを Issue / PR に貼る**こと。
  ユーザーの生活記録そのものであり、公開リポジトリに残してはならない。
  件数や構造のみを書く
- `user_id` / メールアドレス / JWT / API キーの貼り付け。伏せ字にする
- RLS ポリシーの変更（`docs/specs/database.md` の設計判断であり、自動修正の対象外）
- `PLANS.md` の書き換え（`issue-sync` スキルの領分）
