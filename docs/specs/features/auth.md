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
- ユーザーは設定画面から TOTP（認証アプリ）による2段階認証を有効化/無効化できる（#366）
- 2段階認証が有効なユーザーは、email / password でのサインイン後に認証アプリの6桁コード入力を求められる
- ユーザーはサインアップ時に秘密の質問と答えを登録し、パスワードを忘れた場合は `/forgot-password` から秘密の質問に答えることでパスワードを再設定できる（#449 実装済み）

## 画面・動線

| ルート                        | 表示                                                                                                                                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/login`                      | `isAvailableRegisterNewUser` が `false` の場合はサインインフォームのみ。`true` の場合はサインイン / サインアップを1画面で切替。2段階認証が未完了のセッションがある場合はコード入力ステップを表示 |
| `/_auth/*`                    | 認証ガード。未認証、またはMFAコード入力未完了（aal2未達）なら `redirect({ to: '/login' })`                                                                                                       |
| `/settings`（セキュリティ節） | `SecuritySettings`（`src/components/organisms/SecuritySettings.tsx`）でTOTPの有効化/無効化を管理                                                                                                 |

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

// MFA（TOTP）
supabase.auth.mfa.enroll({ factorType: 'totp', issuer: 'Housekeeper' })
supabase.auth.mfa.challenge({ factorId })
supabase.auth.mfa.verify({ factorId, challengeId, code })
supabase.auth.mfa.challengeAndVerify({ factorId, code }) // ログイン時のチャレンジで使用
supabase.auth.mfa.unenroll({ factorId })
supabase.auth.mfa.listFactors()
supabase.auth.mfa.getAuthenticatorAssuranceLevel()
```

`AuthProvider`（`src/lib/auth.tsx`）が session を Context で提供し、`_auth.tsx` が判定する。

## パスワードリセット（秘密の質問、#449）

Supabase Auth 標準のメールリンク方式ではなく、**秘密の質問と答え**によるパスワードリセットを実装している（`user_security_questions` テーブル、Edge Function 2本）。

### データ

`public.user_security_questions`（`supabase/migrations/20260506000001_create_user_security_questions.sql`）

| カラム                      | 型          | 備考                                                                                 |
| --------------------------- | ----------- | ------------------------------------------------------------------------------------ |
| `user_id`                   | uuid PK     | `auth.users(id)` 参照、`on delete cascade`                                           |
| `email`                     | text        | 検索用に正規化して保持                                                               |
| `question`                  | text        | `SECURITY_QUESTIONS`（`src/lib/auth.ts`）から選択した質問文言（日本語固定）          |
| `answer_hash`               | text        | `sha256(user_id + ":" + answer.toLowerCase().trim())` のハッシュ値。平文は保存しない |
| `created_at` / `updated_at` | timestamptz |                                                                                      |

RLS: `auth.uid() = user_id` の owner-only ポリシー。ただし読み書きは主に `SUPABASE_SERVICE_ROLE_KEY` を使う Edge Function 経由で行われる（未認証状態からの呼び出しのため）。

### 登録フロー（サインアップ時）

`LoginPage`（`src/components/pages/LoginPage.tsx`）のサインアップフォームで秘密の質問（`SECURITY_QUESTIONS` からの選択式）と答えを入力させ、サインアップ成功直後にクライアントから直接 `user_security_questions` に `upsert`する（答えは `sha256(user_id + ":" + answer)` としてハッシュ化してから保存、平文は送信元に残らない）。

### リセットフロー（`/forgot-password`、未認証）

1. **Step1**（メール入力）: Edge Function `get-security-question`（`supabase/functions/get-security-question/`）にメールアドレスを送信し、登録済みの質問文言を取得する。未登録メールでもメール存在を推測されないよう、常に汎用の質問文言（`t("genericSecurityQuestion")`）にフォールバックして次のステップへ進む（#449）
2. **Step2**（答え + 新パスワード入力）: Edge Function `verify-security-answer`（`supabase/functions/verify-security-answer/`）に答え・新パスワードを送信。サーバー側でハッシュを再計算し `timingSafeEqual` で定数時間比較、一致すれば `supabase.auth.admin.updateUserById()` でパスワードを更新する
3. 両 Edge Function とも、未登録メール／不正解のいずれも同一のエラーレスポンス・ステータスコードを返し、メールアドレスの存在を推測させない
4. 両 Edge Function とも `checkRateLimit()`（`supabase/_shared/rate-limit.ts`）でメールアドレス単位のレート制限を掛け、総当たり攻撃を抑止する（#433）

### 制約・注意点

- 秘密の質問はナレッジベース認証（knowledge-based authentication）であり、パスワードリセットの認証方式としては一般に強度が低いとされる（本人以外でも推測・調査で突破され得る）。単一ユーザー・自宅利用という本アプリの脅威モデル上は許容しているが、将来的にメールリンク方式や2要素の組み合わせへ強化する余地がある
- 質問文言・答えは現状 i18n 非対応で日本語固定（#620 で追跡）
- ログイン中（既存セッションあり）に `/forgot-password` へアクセスすると `/` にリダイレクトされる（`beforeLoad`）

## MFA（2段階認証、TOTP）

Supabase Auth のネイティブMFA機能（TOTP factor）を利用する。サーバー側の追加実装は不要（Supabase Auth側で完結）。

### 有効化フロー（設定画面）

1. 設定 → セキュリティ で「有効化」を押すと `supabase.auth.mfa.enroll()` を呼び、factorId・QRコード用の otpauth URI・シークレットを取得する
2. `TotpQrCode`（`src/components/molecules/TotpQrCode.tsx`）が `qrcode` パッケージで otpauth URI をQRコードとして描画（認証アプリでスキャン）。QRコードを読み取れない場合はシークレットの手動入力にも対応
3. 認証アプリに表示された6桁コードを入力し、`supabase.auth.mfa.challenge()` → `supabase.auth.mfa.verify()` の順で検証すると有効化完了
4. セットアップを中断した場合は、未検証（unverified）のfactorを `supabase.auth.mfa.unenroll()` でベストエフォートに削除する
5. 無効化は確認ダイログ（`ConfirmDialog`）を挟んで `supabase.auth.mfa.unenroll()` を呼ぶ

UIロジックは `SecuritySettings`（`src/components/organisms/SecuritySettings.tsx`）、TOTP関連のドメインロジック（コードのZodバリデーション、factor選択、aal判定、エラーメッセージ変換）は `src/lib/mfa.ts` に集約する。react-query hooksは `src/hooks/useMfa.ts`（`useMfaFactors` / `useEnrollTotp` / `useVerifyTotpEnrollment` / `useUnenrollTotp`）。

### ログイン時のチャレンジフロー

- `supabase.auth.signInWithPassword()` は2段階認証が有効なユーザーでも成功し、aal1のセッションを返す（Supabase Authの仕様）
- ログイン直後・および `/login` `/_auth/*` の `beforeLoad` で `supabase.auth.mfa.getAuthenticatorAssuranceLevel()` を呼び、`nextLevel === 'aal2' && nextLevel !== currentLevel` であればMFAコード入力が未完了と判定する（`isMfaChallengeRequired()`、`src/lib/mfa.ts`）
- 未完了の場合、`LoginPage` はパスワードフォームの代わりにコード入力ステップ（TOTPコード6桁）を表示し、`supabase.auth.mfa.challengeAndVerify({ factorId, code })` で検証してからホームへ遷移する
- ページ再読み込み等でコード入力前のセッションが残っている場合も、`LoginPage` マウント時に同じ判定を行いコード入力ステップへ復帰する
- `/_auth/*` の `beforeLoad` は、セッションはあるがaal2未達の場合も `/login` へリダイレクトする（保護ルートを直接開けない）
- AAL取得またはfactor取得に失敗した場合は認証済みとして扱わず、安全側に倒して保護ルートを拒否する
- DBのrestrictive RLS policyでも、verified factorを持つユーザーはJWTの`aal`が`aal2`のときだけ個人データへアクセスできる
- コード入力ステップから「サインアウトしてやり直す」を選ぶと `supabase.auth.signOut()` を呼びログインフォームに戻る

### 対応方式

- TOTP（認証アプリ）: v1.1で対応
- Email OTP: 未対応（Backlogのまま）

## エラー

- メール形式不正: クライアント側 Zod で弾く
- 認証失敗: トースト + フィールドエラー
- ネットワーク失敗: トーストでリトライを促す
- 新規ユーザー登録停止中: `isAvailableRegisterNewUser` が `false` の場合、`/login` に停止中の案内を表示し、サインアップフォーム・ボタンは出さない
- 新規ユーザー登録再開時: `isAvailableRegisterNewUser` を `true` にし、既存のサインアップフォーム・`supabase.auth.signUp` 導線を復帰する
- MFAコード不正・期限切れ: `translateMfaError()`（`src/lib/mfa.ts`）でメッセージ変換し、フィールドエラー/トーストで表示
- MFA設定中のオフライン操作: `requireOnline()` で弾き、オフライントーストを表示

## アクセシビリティ

- パスワードは `type="password"` + 表示切替トグル
- ラベル必須
- Enter で送信
- MFAコード入力は `inputMode="numeric"` + `autoComplete="one-time-code"`（`TotpCodeInput`）

## v1 範囲

- 既存実装の polish のみ（新機能なし）
- i18n に対応（ja/en）

## v1.1+ Backlog

- OAuth プロバイダ追加
- ~~2FA~~ → TOTPによる2段階認証は実装済み（#366）。Email OTPは引き続きBacklog
