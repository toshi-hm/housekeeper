# Feature Spec: PWA / Offline (read-only)

## 概要

`vite-plugin-pwa` を導入してアプリをインストール可能にし、オフライン時に **参照** ができる状態を作る。
編集系操作（add/update/delete/consume/upload）はオフラインでは抑止し、トーストで通知する。

## スコープ判断（再掲）

- Q5=a → 参照のみ
- 編集オフラインキューイングは **作らない**

## ユーザーストーリー

- ホーム画面追加 / インストール可能
- 機内モードでも一覧 / 詳細 / バッジが表示される
- 機内モードで編集ボタンを押すと「オフラインのため操作できません」のトースト
- 再接続後、データが自動更新される

## 実装方針

1. `vite-plugin-pwa` を追加
2. `manifest.webmanifest` を Vite plugin が生成（icons / theme color / display=standalone）
3. **strategy**: `injectManifest`（Notifications spec の Service Worker と統合するため）
4. プリキャッシュ: app shell（HTML/CSS/JS）、アイコン、フォント
5. ランタイムキャッシュ:
   - PostgREST GET（items / categories / locations / settings）: `stale-while-revalidate`、TTL 1h、最大 100
   - 画像（signed URL は短命なので image_path 単位でキャッシュキーを正規化する手法を検討、当面はネットワーク優先）
6. mutation の抑止: `useOnlineStatus()` で `navigator.onLine` を監視、オフライン時は mutation hook 全体で早期 return + トースト

### TanStack Query の永続化

- `@tanstack/query-sync-storage-persister` + IndexedDB（idb-keyval）で last-known を保持
- `persistQueryClient` で 24h まで保持

## データ

スキーマ変更なし。

## エラー

- Service Worker 登録失敗: コンソールログのみ（致命でない）
- キャッシュ取得失敗: ネットワークにフォールバック
- 編集試行（オフライン）: トースト

## v1.2 範囲

- インストール可能化
- 一覧・詳細の参照オフライン
- mutation の抑止

## Backlog

- mutation のオフラインキューイング（`@tanstack/query` の persist + retry on reconnect）
- Background Sync
- Web Share Target（バーコード画像受け取り）
