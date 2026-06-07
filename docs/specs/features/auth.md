# Feature Spec: Auth

## 概要

Supabase Auth（email + password）による単一ユーザー認証。
未認証ユーザーは `/login` 以外にアクセスできない。

> 2026-06 時点では個人利用を優先するため、`src/config/auth.ts` の `isAvailableRegisterNewUser` を `false` にして新規ユーザー登録の画面導線を一時的に閉じる。再開時は同フラグを `true` に戻す。

## ユーザーストーリー

- 登録済みユーザーは email / password でサインインできる
- `isAvailableRegisterNewUser` が `true` の場合、ユーザーは email / password でサインアップできる
- ユーザーはサインアウトできる
- 認証状態は再読み込みでも維持される
- 未認証で保護ルートにアクセスすると `/login` にリダイレクトされる

## 画面・動線

| ルート     | 表示                                                                                                                            |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `/login`   | `isAvailableRegisterNewUser` が `false` の場合はサインインフォームのみ。`true` の場合はサインイン / サインアップを 1 画面で切替 |
| `/_auth/*` | 認証ガード。未認証なら `redirect({ to: '/login' })`                                                                             |

主要 page component: `LoginPage`（`src/components/pages/LoginPage.tsx`）

## データ

`auth.users` のみ使用。アプリ側のテーブルなし。
サインアップ完了時に `user_settings` 行を作成（DB トリガまたは初回アクセス時 upsert）。

## API

```ts
// isAvailableRegisterNewUser が true の場合のみ画面から呼び出す
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
- 新規ユーザー登録停止中: `isAvailableRegisterNewUser` が `false` の場合、`/login` に停止中の案内を表示し、サインアップフォーム・ボタンは出さない
- 新規ユーザー登録再開時: `isAvailableRegisterNewUser` を `true` にし、既存のサインアップフォーム・`supabase.auth.signUp` 導線を復帰する

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
