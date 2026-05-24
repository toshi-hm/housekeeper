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
supabase secrets set USER_ID=<your-supabase-user-id>
```

Skill IDはAlexaスキルの **「エンドポイント」** ページの上部に表示されます。  
`GEMINI_API_KEY` は Gemini 2.5 Flash による在庫ファジーマッチング（発話→商品名変換）に使用します。  
User IDはSupabaseダッシュボードの **Authentication → Users** から確認できます。

---

## 5. テスト

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

## 6. 本番公開（任意）

このスキルは個人利用を想定しており、Alexaスキルストアへの公開は不要です。  
開発者アカウントに紐づいたデバイスでそのまま使用できます。
