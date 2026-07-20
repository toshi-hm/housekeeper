# Architecture Spec

## Component Design: Atomic Design

All components follow Atomic Design principles.

### Directory Structure

```
src/
  components/
    atoms/          # 最小単位。単体で意味を持つ
    molecules/      # atomsを組み合わせた小さなUI
    organisms/      # molecules/atomsで構成される独立したUIブロック
    templates/      # ページレイアウトの骨格（データを持たない）
    pages/          # templatesにデータを流し込む最上位コンポーネント
    ui/             # shadcn/ui 自動生成コンポーネント（Atomic分類しない）
```

### Classification Guide

| Layer     | 例                                                   |
| --------- | ---------------------------------------------------- |
| atoms     | Button, Badge, Input, Label, ExpiryBadge, Spinner    |
| molecules | FormField, ItemCard, SearchBar, BarcodeButton        |
| organisms | ItemForm, ItemList, BarcodeScanner, Header, AuthForm |
| templates | DashboardTemplate, LoginTemplate                     |
| pages     | DashboardPage, LoginPage（routesからimportされる）   |

### Rules

- atomsはpropsのみで動作し、外部状態に依存しない
- molecules以上はatomsを使う（直接HTMLタグを多用しない）
- organisms以上でのみhooksやSupabase呼び出しを許可する
- templatesはchildren/slotでコンテンツを受け取るだけ（ロジックなし）
- shadcn/uiコンポーネントはsrc/components/ui/に置き、Atomic分類しない

## Routing (TanStack Router, file-based)

```
src/routes/
  __root.tsx
  login.tsx
  _auth.tsx
  _auth.index.tsx
  _auth.items.new.tsx
  _auth.items.$itemId.tsx
  _auth.items.$itemId.edit.tsx
```

- \_auth.tsx: 未認証なら/loginへリダイレクト
- routesはpagesをimportするだけ。ロジックはpages以下に書く

## Observability（エラー監視）

自己ホスト・単一ユーザー前提のため、デフォルトでは一切の外部送信を行わない。
`VITE_SENTRY_DSN` を設定した場合のみ opt-in で有効化される。

- 実装: `src/lib/sentry.ts`
  - `initSentry()`: `VITE_SENTRY_DSN` 未設定なら何もしない（no-op）。`src/main.tsx` の描画前に呼び出す。
  - `reportError(error)`: `Error` のみを受け取り、DSN 未設定時は no-op。`ErrorBoundary`（`src/components/atoms/ErrorBoundary.tsx`）の
    `componentDidCatch` から呼ばれ、未捕捉の描画時例外を送信する。
- 送信データの絞り込み（PII / 在庫データの非送信）
  - `sendDefaultPii: false`、`tracesSampleRate: 0`（パフォーマンストレース無効）、Session Replay 未導入
  - `beforeSend` はallowlist方式でイベントを再構築し、エラーメッセージ、スタックトレース、最小限の
    プロトコルメタデータのみを送信する。`user` / `request` / `contexts` / `tags` / `extra` / `transaction` /
    `fingerprint` / source context / frame変数は送信しない。stack frameのファイル名からquery/hashも除去する
  - breadcrumbは種類を問わず `maxBreadcrumbs: 0` と `beforeBreadcrumb: () => null` で送信しない
- 有効化方法: `.env.local` に `VITE_SENTRY_DSN=<your DSN>` を設定してビルド/起動するだけ。未設定であれば
  従来通り `console.error`（`ErrorBoundary` 経由）のみ。
