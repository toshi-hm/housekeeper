# Feature Spec: Auth

## 概要

Supabase Auth（email + password）による単一ユーザー認証。
未認証ユーザーは `/login` 以外にアクセスできない。

## ユーザーストーリー

- ユーザーは email / password でサインアップできる
- ユーザーは email / password でサインインできる
- ユーザーはサインアウトできる
- 認証状態は再読み込みでも維持される
- 未認証で保護ルートにアクセスすると `/login` にリダイレクトされる

## 画面・動線

| ルート | 表示 |
| --- | --- |
| `/login` | サインイン / サインアップを 1 画面でタブ切替（または 1 フォーム + モード切替） |
| `/_auth/*` | 認証ガード。未認証なら `redirect({ to: '/login' })` |

主要 organism: `AuthForm`（`src/components/organisms/AuthForm.tsx`）

## データ

`auth.users` のみ使用。アプリ側のテーブルなし。
サインアップ完了時に `user_settings` 行を作成（DB トリガまたは初回アクセス時 upsert）。

## API

```ts
supabase.auth.signUp({ email, password })
supabase.auth.signInWithPassword({ email, password })
supabase.auth.signOut()
supabase.auth.onAuthStateChange((event, session) => ...)
```

`AuthProvider`（`src/lib/auth.tsx`）が session を Context で提供し、`_auth.tsx` が判定する。

## エラー

- メール形式不正: クライアント側 Zod で弾く
- 認証失敗: トースト + フィールドエラー
- ネットワーク失敗: トーストでリトライを促す
- 既登録メールでサインアップ: Supabase のエラーメッセージを i18n で表示

## アクセシビリティ

- パスワードは `type="password"` + 表示切替トグル
- ラベル必須
- Enter で送信

## v1 範囲

- 既存実装の polish のみ（新機能なし）
- i18n に対応（ja/en）

## v1.1+ Backlog

- パスワードリセット
- OAuth プロバイダ追加
- 2FA
