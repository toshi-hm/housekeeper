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
select
  log_attributes['function_id'] as fn,
  log_attributes['status_code'] as status,
  count(*) as n
from logs
where source = 'function_edge_logs'
  and log_attributes['status_code'] >= '500'
group by fn, status
order by n desc
```

`log_attributes` のキー名は Supabase 側の変更で変わりうる。
**まず 1 行を素で取得してキー構造を確認してから**集計クエリを書くこと。

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

| 対象                                                       | 理由                                                                                   |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 全 Edge Function の **401**                                | `Authorization` ヘッダ無し / 不正 JWT の正常拒否                                       |
| `alexa-skill` の **403**                                   | 署名検証の正常拒否                                                                     |
| `barcode-lookup` / recipe / receipt 系の **429**           | レート制限が正しく効いている（`_shared/rate-limit.ts`）                                |
| `image-proxy` の **400**                                   | 許可外 URL・不正なリクエストの正常拒否                                                 |
| 各関数の **405**                                           | 想定外 HTTP メソッドの正常拒否                                                         |
| その他 **400**（入力バリデーション）                       | クライアントの不正入力に対する正常応答                                                 |
| 外部 API（Yahoo!ショッピング / Gemini）由来の 5xx・timeout | 自リポジトリのコードでは直せない。契約変更の疑いがあれば `api-contract-monitor` の領分 |

**対象にするのは原則 5xx**、および `function_logs` の `console.error` のうち
上記の正常系フローに属さないもの。

## 3. 実行ガード（housekeeper の値）

| 項目                     | 値                                                  |
| ------------------------ | --------------------------------------------------- |
| 1 実行で作る修正 PR      | **1 件**                                            |
| open な自動 PR の上限    | **3 本**（超えていたら新規修正を止めて報告のみ）    |
| 同一指紋の自動修正の上限 | **2 回**（3 回目は `needs-human` として人間に回す） |

このアプリは**単一ユーザーの自己ホスト**であり、エラーが即座に多数の利用者へ
影響することはない。**速度より安全側に倒してよい。**

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

## 7. このプロジェクトで特にやってはいけないこと

- **本番 Supabase への書き込み**。`apply_migration` / `execute_sql` の書き込み系 /
  `deploy_edge_function` を実行しない。**ログの読み取り専用**
- 在庫・購入履歴・レシピなどの**実データを Issue / PR に貼る**こと。
  ユーザーの生活記録そのものであり、公開リポジトリに残してはならない。
  件数や構造のみを書く
- `user_id` / メールアドレス / JWT / API キーの貼り付け。伏せ字にする
- RLS ポリシーの変更（`docs/specs/database.md` の設計判断であり、自動修正の対象外）
- `PLANS.md` の書き換え（`issue-sync` スキルの領分）
