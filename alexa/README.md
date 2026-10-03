# Alexa Skill「ハウスキーパー」セットアップ手順

## 前提条件

- Amazon Developer Account（https://developer.amazon.com）
- Alexa対応デバイスまたはAlexaアプリ
- Supabase Edge Function `alexa-skill` がデプロイ済み
  （実装: `supabase/functions/alexa-skill/`）

---

## 1. Alexaスキルの作成

1. [Alexa Developer Console](https://developer.amazon.com/alexa/console/ask) にログイン
2. **「スキルの作成」** をクリック
3. 設定：
   - スキル名：**ハウスキーパー**
   - ライブラリ：**その他**
   - ホスティング方法：**独自のプロビジョニング**
   - テンプレート：**スクラッチ**

---

## 2. インタラクションモデルのインポート

1. サイドバーから **「インタラクションモデル」→「JSONエディタ」** を開く
2. このリポジトリの `alexa/interaction_model.json` の内容をコピー＆ペースト
3. **「モデルを保存」→「モデルをビルド」** をクリック（数分かかります）

---

## 3. エンドポイントの設定

1. サイドバーから **「エンドポイント」** を開く
2. **「HTTPS」** を選択
3. デフォルトのエンドポイントURL：
   ```
   https://<your-supabase-project>.supabase.co/functions/v1/alexa-skill
   ```
4. SSL証明書の種類：**「サブドメインのワイルドカード証明書を持つ証明機関が発行した証明書」** を選択
5. **「エンドポイントを保存」** をクリック

---

## 4. Supabase Secrets の設定

```bash
supabase secrets set ALEXA_SKILL_ID=amzn1.ask.skill.xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
supabase secrets set GEMINI_API_KEY=<your-gemini-api-key>
```

Skill IDはAlexaスキルの **「エンドポイント」** ページの上部に表示されます。  
`GEMINI_API_KEY` は Gemini 2.5 Flash による在庫ファジーマッチング（発話→商品名変換）に使用します。

Alexa が Account Linking で渡す Supabase access token を Edge Function が検証し、ユーザー JWT と anon key で RLS を適用します。固定の `USER_ID` と `SUPABASE_SERVICE_ROLE_KEY` は使用しません。Supabase Edge Functions が `SUPABASE_URL` と `SUPABASE_ANON_KEY` を環境変数として提供することを確認してください。

---

## 5. Supabase Auth の OAuth Server 設定

1. Supabase Dashboard の **Authentication → OAuth Server** で OAuth 2.1 Server を有効にする
2. Site URL を Housekeeper の公開 URL に設定し、Authorization Path を `/oauth/consent` に設定する
3. **Authentication → OAuth Apps** で Alexa 用の confidential client を登録する
   - Client name: `Housekeeper Alexa`
   - Redirect URI: Alexa Developer Console の Account Linking に表示される各地域の Redirect URL をすべて登録する（完全一致が必要）
   - Token endpoint authentication: Alexa に設定する方式に合わせて `client_secret_post` または `client_secret_basic` を選ぶ
4. OAuth client の Client ID / Client Secret を控える

Supabase OAuth Server は `https://<project-ref>.supabase.co/auth/v1/oauth/authorize` と `https://<project-ref>.supabase.co/auth/v1/oauth/token` を使用します。Alexa 側の PKCE を有効にし、Supabase OAuth Server が SHA-256 PKCE に対応することを確認してください。Authorization Path には認証済みユーザーが `authorization_id` の内容を確認して承認できる画面が必要です。

## 6. Alexa Developer Console の Account Linking

1. Alexa Developer Console でスキルを開き **Build → Account Linking** に移動する
2. Account Linking を有効にし、**Auth Code Grant** を選択する
3. Supabase OAuth Server の Authorization URI と Access Token URI、Client ID / Secret を設定する
4. Alexa Client ID / Secret を設定し、PKCE (SHA-256) を有効にする
5. Alexa が表示する全地域の Redirect URL を Supabase OAuth client に登録したことを確認し、保存する

Alexa Developer Console と Supabase Dashboard の OAuth client / redirect URI 登録は外部コンソール上の操作です。このリポジトリからは変更できないため、上記の手順を手動で完了してください。

---

## 7. テスト

### シミュレータでのテスト

1. **「テスト」** タブを開く
2. **「スキルのテストが有効」** をONに切り替え
3. 「ハウスキーパーを開いて」と入力してテスト

### 発話例

| 発話                             | 期待する応答                       |
| -------------------------------- | ---------------------------------- |
| 「牛乳はある？」                 | 「明治 おいしい牛乳が2本あります」 |
| 「牛乳の賞味期限は？」           | 「賞味期限は6月5日です」           |
| 「冷蔵庫に何がある？」           | 「冷蔵庫には〇〇など3件あります」  |
| 「牛乳はどこにある？」           | 「冷蔵庫にあります」               |
| 「牛乳はあとどれくらい？」       | 「350mL残っています」              |
| 「牛乳を買い物リストに追加して」 | 確認ダイアログ後、追加             |

---

## 8. 本番公開（任意）

このスキルは個人利用を想定しており、Alexaスキルストアへの公開は不要です。  
開発者アカウントに紐づいたデバイスでそのまま使用できます。
