# レシート一括登録（Receipt Scan）

## 1. 目的 / 背景

現在の在庫登録導線（バーコードスキャン / 期限日OCR / 手動入力、いずれも
`docs/specs/features/barcode.md` 参照）は **1件ずつ登録**が前提になっている。
まとめ買い（スーパーで5〜20点購入）のたびに同じフローを購入点数分繰り返す
必要があり、この「バッチ登録」のニーズに対応する導線がない（元issue: #696）。

- レシートを撮影/アップロードすると、Gemini Vision が品目（商品名・価格・数量）を
  抽出する
- 抽出結果は**即座に確定登録しない**。レビュー用のステージング一覧画面で
  各行のカテゴリ・保管場所・期限日をユーザーが確認/補完してから、既存の
  `useCreateItem` 系フックで一括登録する
- 抽出した価格は `item_lots.unit_price` に自動反映し、統計（支出トレンド等）や
  #697（店舗別価格比較）の精度向上にも寄与する

## 2. 制約 / 前提

- バックエンドサーバは持たない（CLAUDE.md）。Supabase クライアントサイドのみ。
- **Gemini API キーは秘匿が必要** → クライアントから直接叩かず、Supabase Edge Function
  経由で呼ぶ（`inventory-chat` / `barcode-lookup` と同じパターン）。
- 新しい Edge Function `receipt-scan` を新設する（関数ディレクトリ間の import は
  Supabase デプロイで壊れやすいため、必要なロジックは関数内に閉じる）。
- レシート画像は Edge Function・クライアントいずれにも**永続保存しない**
  （抽出後は破棄。プライバシー配慮 + Storage 運用コストを増やさないため）。
- Web チャット（`inventory-chat`）と同様、**認証済みユーザーの JWT** を使い RLS で
  スコープする（service-role は使わない）。将来 #64（多人数共有）が実装されても、
  RLS ベースのため変更不要（`household_id` 導入後は該当 household のマスタ
  カテゴリ/保管場所を選択肢に出す形で自然に拡張できる）。
- モバイルファースト。レビュー画面はスクロール一覧 + フッター固定の一括登録ボタン。

## 3. アーキテクチャ

```
[React: レシートから登録]
   │ 1. カメラ撮影 or ファイル選択（<input capture>、ImageUploader を再利用）
   │ 2. supabase.functions.invoke("receipt-scan", { image: base64, mimeType })
   │    (Authorization: Bearer <user access token> が自動付与)
   ▼
[Edge Function receipt-scan] ── verify_jwt (default true)
   │ 1. checkChatRateLimit 相当のユーザー単位レート制限（画像解析はコスト高のため
   │    inventory-chat より厳しめの閾値にする、4.1 参照）
   │ 2. Gemini Vision に画像 + JSON Schema 指定で品目抽出を依頼
   │ 3. { items: ReceiptLineItem[] } を返す（DBへの書き込みは行わない）
   ▼
[Gemini API gemini-2.5-flash（無料枠、Vision入力対応）]

[React: レビュー画面 ReceiptReviewPanel]
   │ 1. 抽出行ごとにカテゴリ/保管場所/期限日を確認・編集（未確定はプレースホルダ表示）
   │ 2. 行の除外（チェックを外す）/ 手動追加も可能
   │ 3. 「一括登録」→ 各行を既存 useCreateItem.mutateAsync でループ登録
   │    （新規 RPC は作らない。1件ずつ失敗しても他の行の登録は継続し、
   │    成功/失敗件数をトーストで表示 — #694 と同じ「バッチ全体を落とさない」方針）
   ▼
[items / item_lots]（既存スキーマ、変更なし）
```

### 3.1 Edge Function `receipt-scan`

| ファイル          | 役割                                                                  |
| ----------------- | --------------------------------------------------------------------- |
| `index.ts`        | `Deno.serve` / CORS / リクエスト検証 / 全体オーケストレーション       |
| `gemini.ts`       | レシート画像 → 品目抽出の Gemini Vision 呼び出し（JSON スキーマ応答） |
| `types.ts`        | リクエスト / レスポンス / Gemini 型                                   |
| `receipt.test.ts` | リクエスト検証・レスポンス整形などの純粋関数テスト（Deno）            |

#### リクエスト / レスポンス

```ts
// Request body
interface ReceiptScanRequest {
  image: string; // base64（データURLではなく生base64。先頭のdata:...;base64,は除去してから送る）
  mimeType: "image/jpeg" | "image/png" | "image/webp";
}

// Response body
interface ReceiptScanResponse {
  items: ReceiptLineItem[];
}

interface ReceiptLineItem {
  name: string; // 商品名（レシート記載のまま。長い場合は省略しない — レビュー画面で編集可能）
  quantity: number; // 個数（読み取れない場合は 1）
  unitPrice: number | null; // 1点あたりの価格（円）。読み取れない/割引等で不明瞭な場合は null
  confidence: "high" | "low"; // 抽出信頼度。low の行はレビュー画面で強調表示する
}
```

- 画像1枚に対して1回のGemini呼び出し（複数レシートの合成・複数画像対応はスコープ外）。
- 小計・合計・割引行・非商品行（ポイント表記等）はプロンプトで除外を指示する。完全な除外を
  保証はできないため、レビュー画面でのユーザー確認を最終防衛線とする。

#### Gemini 呼び出しの方針

- モデル: `gemini-2.5-flash`（無料枠 / GA、Vision入力対応）
- `responseMimeType: application/json` + `responseSchema` で `{ items: [...] }` を強制
- `temperature: 0.1`（抽出タスクのため `inventory-chat` の会話用途より低めにし、ブレを抑える）
- タイムアウト: 25s（画像解析は文字チャットより時間がかかるため `inventory-chat` の20sより
  やや長めに設定）
- 失敗時は `{ kind: "error" | "timeout" | "no_items_found" }` を返し、UI にフォールバック
  メッセージ（「レシートを認識できませんでした。手動で登録してください」等）を出す

### 3.2 フロントエンド（Atomic Design）

| 区分     | コンポーネント       | 役割                                                                          |
| -------- | -------------------- | ----------------------------------------------------------------------------- |
| hook     | `useReceiptScan`     | `receipt-scan` を invoke、ローディング/エラー管理                             |
| molecule | `ReceiptLineItemRow` | 抽出1行の編集UI（名前・数量・単価・カテゴリ・保管場所・期限日・除外チェック） |
| organism | `ReceiptReviewPanel` | レビュー一覧全体（読み込み中/エラー/空状態、フッター固定の一括登録ボタン）    |
| page     | `ReceiptScanPage`    | 撮影/選択 → 解析中 → レビュー、の3ステップを管理する新規ルート                |

- ルート: `/_auth/items/receipt-scan`（ダッシュボードの「追加」導線からエントリーポイントを
  1つ追加する。既存の「新規登録」「バーコード」と並ぶ第3の入口）。
- 画像選択は既存 `ImageUploader` molecule のカメラ撮影パターンを流用（`capture="environment"`）。
- 状態: Idle(撮影待ち) → Scanning(解析中、ローディング) → Review(編集) → Submitting(登録中) →
  Done（成功件数を表示して一覧に戻る）。
- 一括登録の実行中は各行にインライン状態（登録済み/失敗）を表示し、失敗した行だけ再試行できる
  ようにする（#694と同じ「部分失敗を可視化する」方針をUIレベルで踏襲）。

### 3.3 i18n

- 新名前空間 `receiptScan`（`src/locales/{ja,en}/receiptScan.json`）を追加し
  `src/lib/i18n.ts` に登録。
- すべての文言は `t()` の文字列リテラルで参照する。

## 4. セキュリティ

- Gemini API キーは Edge Function の環境変数 `GEMINI_API_KEY`（既存 `inventory-chat` /
  Alexa と共用）。
- Edge Function は `verify_jwt`（デフォルト有効）で未認証リクエストを拒否。
- 画像はレスポンス生成後に破棄し、Edge Function・DB いずれにも保存しない。
- `mimeType` は Zod（`z.enum(["image/jpeg", "image/png", "image/webp"])`）で検証。
- `image` の base64 サイズに上限を設ける（目安 8MB相当。`ImageUploader` の
  既存 `MAX_RAW_SIZE_BYTES` 運用（#702 で見直し済み）を踏まえ、Edge Function 側でも
  デコード前にサイズをチェックし、超過時は 413 相当のエラーを返す）。

### 4.1 レート制限

画像解析は文字チャットよりGemini無料枠消費が大きいため、`inventory-chat` の
`checkChatRateLimit`（4.1、60秒あたり20回）より厳しい専用の閾値を設ける。

- 同じ `_shared/rate-limit.ts` の仕組みを再利用し、`receipt-scan` 用の別ウィンドウ
  （例: 60秒あたり5回）を切る。あるいは既存の `chat_rate_limits` テーブルを
  `feature` 列で区別して共用するか、実装時に判断する（初期スコープでは新規
  Postgres 関数 `check_receipt_scan_rate_limit()` を追加する想定）。
- 超過時は `{ error: "rate_limited" }` + `Retry-After` ヘッダ付きで 429 を返す。

## 5. データへの影響

- 既存スキーマ（`items` / `item_lots`）のみを使用。マイグレーション不要。
- レビュー画面からの登録は、既存の `createItem` / `createLot`（`useItems.ts` /
  `useItemLots.ts`）をそのまま呼ぶ。バーコードは読み取らないため `barcode: null` で作成し、
  ユーザーは後から手動でバーコードを追加できる（既存動線をそのまま利用）。
- 抽出した `unitPrice` は新規ロットの `unit_price` にそのまま渡す。

## 6. やらないこと（スコープ外）

- レシート画像の永続保存・後からの再閲覧
- 店舗名の自動抽出（店舗名手入力は #697 のスコープ。将来 #697 が実装されたら
  レビュー画面に店舗名フィールドを追加する形で統合できる）
- 複数レシート/複数画像のバッチ解析
- 抽出精度のユーザー訂正を学習に反映する仕組み（本プロジェクトはGemini API利用のみで
  独自モデル学習は行わない）
- 既存アイテムとのバーコード突合・スタック検出（新規アイテムとして作成する。統合したい
  場合は登録後に手動でスタックする運用とする）

## 7. テスト / CI

- フロント: `useReceiptScan` のハッピーパス、`ReceiptReviewPanel` の行編集・除外・
  一括登録（部分失敗を含む）を `bun test`。
- 新規 atom/molecule/organism には `.stories.tsx` を必ず追加（Storybook ビルド）。
- Edge Function: 純粋関数テストを `receipt.test.ts` に追加し `_test.yml` の deno-test に登録。
- i18n: `receiptScan.json` を ja/en 双方に用意し、parser 差分ゼロ。

## 8. 完了条件

- 「レシートから登録」→ 撮影/選択 → 解析 → レビュー編集 → 一括登録 → 一覧に反映、が動作。
- PR の CI（quality / test / knip / commitlint / lighthouse 等）がすべて緑。
