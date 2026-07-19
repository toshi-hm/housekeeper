# 在庫 AI チャット（Inventory AI Chat）

## 1. 目的 / 背景

現在、Alexa スキル（`supabase/functions/alexa-skill`）経由で Gemini API を使い、
音声で在庫を問い合わせできる。これを **Web アプリのページトップからも** 使えるようにする。

- ページトップの **AI ボタン**を押すとチャットパネルが開く
- 自然言語で「牛乳ある？」「卵の賞味期限は？」などを質問
- Gemini が在庫データを参照して会話形式で回答する
- **Gemini 無料枠（`gemini-2.5-flash`）の範囲で利用すること**を前提とする

## 2. 制約 / 前提

- バックエンドサーバは持たない（CLAUDE.md）。Supabase クライアントサイドのみ。
- **Gemini API キーは秘匿が必要** → クライアントから直接叩かず、Supabase Edge Function 経由で呼ぶ
  （`barcode-lookup` と同じパターン）。
- 既存の Alexa 用 Gemini ロジックは Deno Edge Function 内に閉じているため、
  Web チャット用に **新しい Edge Function `inventory-chat`** を新設する（関数ディレクトリ間の
  import は Supabase デプロイで壊れやすいため、必要なロジックは関数内に閉じる）。
- 単一ユーザー前提だが、Web チャットは **認証済みユーザーの JWT** を使い RLS でスコープする
  （Alexa のような service-role + `USER_ID` 固定は使わない）。
- モバイルファースト。チャットパネルはフルスクリーン寄りのオーバーレイ。

## 3. アーキテクチャ

```
[React Chat UI]
   │ supabase.functions.invoke("inventory-chat", { message, history })
   │   (Authorization: Bearer <user access token> が自動付与)
   ▼
[Edge Function inventory-chat]  ── verify_jwt (default true)
   │ 1. Authorization ヘッダから user-scoped Supabase client を生成（anon key + RLS）
   │ 2. items / recently_consumed を取得（RLS で user_id 自動スコープ）
   │ 3. 在庫コンテキスト + 会話履歴を Gemini に投げる
   │ 4. { reply, items } を返す
   ▼
[Gemini API gemini-2.5-flash (無料枠)]
```

### 3.1 Edge Function `inventory-chat`

| ファイル       | 役割                                                            |
| -------------- | --------------------------------------------------------------- |
| `index.ts`     | `Deno.serve` / CORS / リクエスト検証 / 全体オーケストレーション |
| `gemini.ts`    | チャット用 Gemini 呼び出し（会話履歴対応、JSON スキーマ応答）   |
| `inventory.ts` | 認証ユーザー JWT スコープで items / recently_consumed を取得    |
| `types.ts`     | リクエスト / レスポンス / Gemini 型                             |
| `chat.test.ts` | リクエスト検証・コンテキスト整形などの純粋関数テスト（Deno）    |

`../_shared/rate-limit.ts` の `checkChatRateLimit`（#558）で、ハンドラの認証チェック直後に
ユーザー単位のレート制限を行う（4.1 参照）。

#### リクエスト / レスポンス

```ts
// Request body
interface ChatRequest {
  message: string;
  history?: { role: "user" | "model"; text: string }[]; // 直近の会話（最大 N 件）
  language?: "ja" | "en"; // UIの現在言語。回答(reply)の言語を決める（#555）
}

// Response body
interface ChatResponse {
  reply: string; // 会話形式の日本語/英語回答（プレーンテキスト）
  items: {
    id: string;
    name: string;
    total_remaining?: string;
    expiry_date?: string | null;
    storage_location?: string | null;
  }[]; // 回答に関連した在庫アイテム（チップ表示用、0 件可）
}
```

#### Gemini 呼び出しの方針

- モデル: `gemini-2.5-flash`（無料枠 / GA）
- `responseMimeType: application/json` + `responseSchema` で `{ reply, items }` を強制
- `temperature: 0.2`、`thinkingConfig.thinkingBudget: 1024`（`gemini-2.5-flash` は `thinkingLevel` ではなく `thinkingBudget`。`thinkingLevel` は Gemini 3.x 専用パラメータで、2.5 系に送るとAPIエラーになる）
- 会話履歴を `contents` に user/model ロールで積む（マルチターン）
- システムプロンプトに在庫コンテキスト（JSON）を埋め込む
- タイムアウト: 20s（Web は Alexa の 8s 制約がないため余裕を持たせる）
- 失敗時は `{ kind: "error" | "timeout" }` で UI にフォールバックメッセージ

### 3.2 フロントエンド（Atomic Design）

| 区分     | コンポーネント           | 役割                                                    |
| -------- | ------------------------ | ------------------------------------------------------- |
| hook     | `useInventoryChat`       | `inventory-chat` を invoke、ローディング/エラー管理     |
| atom     | `ChatBubble`             | 1 メッセージ吹き出し（user / assistant）                |
| molecule | `ChatComposer`           | 入力テキストエリア + 送信ボタン（Enter 送信、IME 考慮） |
| organism | `InventoryChatPanel`     | パネル全体（ヘッダ / メッセージ一覧 / 入力 / 状態管理） |
| layout   | `_auth.tsx` の AI ボタン | デスクトップサイドバー & モバイルヘッダに AI ボタン追加 |

- チャット履歴はパネルの `useState` で保持（DB 永続化はしない＝無料・シンプル）。
- パネルを閉じても履歴は保持し、「クリア」ボタンでリセット。
- 状態: Idle / Sending(ローディング) / Error（再試行可）。
- アクセシビリティ: `role="dialog"`、`aria-modal`、Esc で閉じる、フォーカス管理。

### 3.3 i18n

- 新名前空間 `chat`（`src/locales/{ja,en}/chat.json`）を追加し `src/lib/i18n.ts` に登録。
- すべての文言は `t()` の文字列リテラルで参照（i18next-parser で抽出可能に保つ）。

## 4. セキュリティ

- Gemini API キーは Edge Function の環境変数 `GEMINI_API_KEY`（既存 Alexa と同一を流用可）。
- Edge Function は `verify_jwt`（デフォルト有効）で未認証リクエストを拒否。
- データ取得は RLS によりリクエストユーザーのデータのみ（service-role を使わない）。
- 入力 `message` は長さ上限でバリデーション（プロンプトインジェクション対策として
  「在庫アシスタント」ロールを system 固定、ユーザー入力は user ロールに限定）。
- 入力 `language` はクライアントの申告を信用せず Zod（`z.enum(["ja", "en"])`）で検証し、
  不正/未指定時は `"ja"`（`fallbackLng`）にフォールバックする（#555）。

### 4.1 レート制限（#558）

有効なセッション（またはアクセストークン）からの連打・誤動作するクライアント（無限リトライ等）が
Gemini 無料枠を無制限に消費してしまうのを防ぐため、ユーザー単位の簡易レート制限を設ける。

- テーブル `public.chat_rate_limits`（`user_id` 主キー, `window_start`, `request_count`）で
  固定ウィンドウ方式のリクエスト数を保持する。
- Postgres 関数 `check_chat_rate_limit(p_max_requests default 20, p_window_seconds default 60)`
  が `auth.uid()`（呼び出し元 JWT）を内部で参照し、直近 `p_window_seconds` 秒間の
  リクエスト数が `p_max_requests` を超えていないかを原子的にチェック・カウントアップする。
  `SECURITY DEFINER` で `authenticated` ロールにのみ `EXECUTE` を許可し、クライアントからの
  テーブル直接アクセスは行わない（RLS はポリシーなしで有効化のみ）。
- Edge Function 側は `supabase/functions/_shared/rate-limit.ts` の `checkChatRateLimit()` から
  この RPC を呼び出し、`index.ts` のハンドラ冒頭（認証チェック直後・Gemini 呼び出し前）で
  判定する。超過時は本文 `{ error: "rate_limited" }`、`Retry-After` ヘッダ付きで **429** を返す。
- デフォルトのしきい値は **1 分あたり 20 リクエスト**。単一ユーザー前提のため厳密なブルート
  フォース対策ではなく、無料枠を実効的に守るための最低限のガードという位置づけ。
- クライアント (`useInventoryChat`) は 429 応答を `ChatRateLimitError` として区別し、
  `InventoryChatPanel` はチャット枠に汎用エラーとは異なる `chat.rateLimited` メッセージを表示する
  （UI 側の多重クリック防止 `isLoading` とは独立した、サーバ側の実効的なガード）。

## 5. 無料枠への配慮

- `gemini-2.5-flash` は無料枠あり。`thinkingBudget` を低めに抑え、会話履歴は直近数件に制限。
- 在庫コンテキストは必要列のみを JSON 化して送信（トークン削減）。
- Edge Function 側のユーザー単位レート制限（4.1）により、短時間の連打や誤動作クライアントによる
  無制限呼び出しを防ぎ、上記の設計を実効化する。

## 6. テスト / CI

- フロント: `useInventoryChat` のハッピーパス、`InventoryChatPanel` の状態遷移を `bun test`。
- 新規 atom/molecule/organism には `.stories.tsx` を必ず追加（Storybook ビルド）。
- Edge Function: 純粋関数テストを `chat.test.ts` に追加し `_test.yml` の deno-test に登録。
- i18n: `chat.json` を ja/en 双方に用意し、parser 差分ゼロ。

## 7. 完了条件

- ページトップ AI ボタン → チャットで在庫質問 → 回答表示が動作。
- PR の CI（quality / test / knip / commitlint / lighthouse 等）がすべて緑。
