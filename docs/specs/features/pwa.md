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
   - PostgREST GET（items / categories / locations / settings）: `network-first`（timeout 5s でキャッシュへフォールバック）、TTL 1h、最大 100
     - ※ 当初は `stale-while-revalidate` だったが、mutation 直後の TanStack Query refetch に
       古いキャッシュが返り、更新結果が画面に反映されないバグがあったため network-first に変更
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

## Widgets（ホーム画面ウィジェット, 実験的機能 / 将来対応見込み, #367）

### 背景・ブラウザ対応状況

Web App Widgets（`manifest.json` の `widgets` フィールドでホーム画面ウィジェットを宣言する仕様）は、
2026-07 時点で **Chrome / Edge 138+ の Origin Trial 段階**の仕様であり、W3C Web Incubator
Community Group（WICG）でも draft のまま標準化が完了していない。
現状ほとんどのブラウザ・OS はホーム画面ウィジェットとしてのレンダリングに対応しておらず、
本実装は「対応が広がった際にすぐ使えるようにする」ための **先行実装** という位置付け。

- 対応見込み: Chrome/Edge（Origin Trial → 標準化されれば安定版へ）、Windows 11 Widgets Board
- 現状非対応: Safari / Firefox / モバイル Chrome（Android のホーム画面ウィジェットとは別仕組み）
- 参考: [MicrosoftEdge/MSEdgeExplainers – PWAWidgets](https://github.com/MicrosoftEdge/MSEdgeExplainers/blob/main/PWAWidgets/README.md)

### 実装した範囲

1. **manifest 設定**: `vite.config.ts` で `manifest.widgets` に `tag: "inventory-alert"` の
   ウィジェット定義を 1 件追加。`VITE_SUPABASE_URL` が未設定（CI のビルド等）の場合は
   `widgets` フィールド自体を省略し、ビルドが失敗しないようにしている（フィーチャーゲート）。
2. **データ API**: Supabase Edge Function `supabase/functions/widget-data`
   （`GET`、Bearer JWT 認証、`subscribe-push` と同じ認証パターン）。
   期限切れ／期限間近の件数・低在庫の件数・代表アイテム（各最大 5 件）を JSON で返す。
   - 期限切れ／期限間近の判定基準は send-expiry-notifications（#445）と同じ
     （`units > 0` かつ `opened_remaining !== 0`）。ダッシュボードの `urgentItems`
     （`_auth.index.tsx`, #450）は `units > 0` のみで `opened_remaining` は見ておらず、
     判定基準が異なる点に注意（ウィジェットとダッシュボードで件数が一致しない場合がある）。
   - 低在庫の判定は `minimum_stock`（#230）を利用（`units <= minimum_stock`）。
     消費ペースからの補充タイミング予測（#68 / #392）はこの時点でまだ `main` に
     マージされていなかったため未利用。将来 `minimum_stock` に加えて予測ベースの
     低在庫判定が使えるようになった場合はこのエンドポイントの拡張を検討する。
   - ロジック本体（`summary.ts`）は Supabase クライアントに依存しない純粋関数として切り出し、
     Deno test（`summary.test.ts`）でレスポンス形状を検証している。
3. **Adaptive Card テンプレート**: `public/widgets/templates/inventory-alert.json`
   （最小構成: 期限切れ／期限間近／低在庫の件数 + 代表アイテムのリスト）。

### 実装しなかった範囲（意図的にスコープ外）

- **Periodic Background Sync**: ウィジェットホスト自身が manifest の `update`
  （秒単位のポーリング間隔、現状 3600 秒 = 1 時間）に従って `data` エンドポイントを
  直接ポーリングする仕様のため、Service Worker 側で追加の定期同期処理を実装する必要はない。
  Periodic Background Sync は権限モデル・ブラウザ対応がさらに限定的でリスクが大きい割に
  得られる価値が小さいため、今回は意図的に実装しない。
- **ウィジェット向けの認証トークン発行フロー**: 現行の Widget ホスト実装は、
  ページ外（OS ウィジェットサーフェス）から `data` エンドポイントを取得する際に
  独自の `Authorization` ヘッダーやクッキーをクロスオリジンで付与する手段を
  標準化していない。そのため `widget-data` は `subscribe-push` と同じ Bearer JWT
  認証を実装してはいるが、**実機のウィジェットから認証付きで取得できることは
  現時点では保証されない**（手動検証・将来のブラウザ対応拡大に備えた実装）。
- **非対応環境でのフィーチャーディテクション用 JS**: Widgets は manifest 宣言のみで
  完結する仕組みで、ページ側の JavaScript から機能有無を検出して分岐する API
  （`navigator.setAppBadge` のような）は存在しない。非対応ブラウザは単に
  `widgets` フィールドを無視するだけなので、追加のフォールバック実装は不要。
