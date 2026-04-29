# Feature Spec: Notifications

## 概要

期限接近 / 期限切れの item をユーザーに通知する。
配信手段は **Web Push** と **Email**、両方ユーザーが選択可能（複数同時可・両方 OFF も可）。

## ユーザーストーリー

- 設定画面で Push / Email / 両方 / なし を選べる
- 通知を出す閾値日数（デフォルト 3）を変更できる
- 通知時刻（デフォルト 08:00）を変更できる
- Push を有効化すると、ブラウザ通知許可がリクエストされる
- iOS Safari など対応外環境ではトーストで案内し、Email を代替で勧める
- 1 日 1 回の配信で、対象 item 件数とサマリが届く

## データ

`notification_preferences` / `push_subscriptions`（`docs/specs/database.md` 参照）

## API

| hook                           | 機能                   |
| ------------------------------ | ---------------------- |
| `useNotificationPreferences()` | 設定取得 / 更新        |
| `usePushSubscription()`        | 購読登録 / 解除        |
| `useTestNotification()`        | テスト通知送信（任意） |

### Edge Functions

| 名前                        | 内容                                                                                                | トリガ                                                                                    |
| --------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `subscribe-push`            | クライアントから受け取った購読を `push_subscriptions` に upsert（VAPID 鍵管理を Function 内に隠す） | クライアント                                                                              |
| `send-expiry-notifications` | 全ユーザーをループし、`notification_preferences` を見て送信                                         | `pg_cron` で `notify_at` 付近に発火（ユーザー TZ は当面サーバ TZ で代替、Backlog で改善） |

### 環境変数（Edge Function 側）

- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`
- `RESEND_API_KEY`（Email プロバイダ）
- `RESEND_FROM_ADDRESS`

クライアント側には `VITE_VAPID_PUBLIC_KEY` を埋め込み、購読作成時に使用。

## 配信ロジック

```
SELECT user_id FROM notification_preferences WHERE push_enabled OR email_enabled;

for each user:
  対象 = items WHERE user_id = U
                AND (expiry_date - today) <= preferences.threshold_days
                AND units > 0
                AND opened_remaining IS DISTINCT FROM 0;

  if 対象が空: skip;

  if push_enabled:
    each subscription in push_subscriptions(user_id):
      web-push で payload 送信、410/404 なら subscription 削除

  if email_enabled:
    Resend で 1 通送信（subject: "X 件の食材が期限間近です"）
```

## エラー

- Push 購読失敗（権限拒否 / VAPID 不整合）→ 設定画面でメッセージ
- 失効した購読は配信時に削除
- Email 送信失敗 → 失敗ログ（v1 はコンソール、Backlog で永続化）

## 必要な Web 標準

- `Notification.requestPermission()`
- `navigator.serviceWorker.register('/sw.js')`
- `registration.pushManager.subscribe({ applicationServerKey })`

Service Worker は `vite-plugin-pwa` の `injectManifest` 戦略で書く（PWA 仕様と統合 → `pwa.md`）。

## v1.2 範囲

- 設定画面（preference + 購読）
- Edge Functions 2 本（`subscribe-push`, `send-expiry-notifications`）
- `pg_cron` でスケジュール
- VAPID 鍵生成と環境変数設定の手順を README に追記

## Backlog

- ユーザータイムゾーン対応
- 通知種別の細分化（期限切れ / 在庫切れ / 補充提案）
- アプリ内通知センター
