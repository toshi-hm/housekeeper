---
name: pwa-doctor
description: >-
  Use when working on PWA / offline / Service Worker concerns — 「PWAを確認して」「オフラインで動かない」
  「Service Workerを直して」「インストールできない」「キャッシュがおかしい」「manifest を見て」など。
  プロジェクトのオフライン方針と突き合わせた診断チェックリストの適用と、修正の実装を行う。
---

# Skill: pwa-doctor

PWA / オフライン / Service Worker まわりの診断と修正を行う。

## Step 0. プロジェクト設定の解決

1. **同ディレクトリの `PROJECT.md` があれば読み、その構成・方針を最優先する**
2. なければ以下から自動検出する:
   - ビルド設定（`vite.config.*` 等）— PWA プラグインと strategy（generateSW / injectManifest）
   - SW ソースファイル（`src/sw.*` / `service-worker.*`）と専用 tsconfig
   - manifest（生成設定 or `public/manifest.webmanifest`）
   - データ永続化（Query persister / IndexedDB 等）とオフライン検知コード
   - プロジェクトの spec / ドキュメントにオフライン方針の記述があるか
3. **オフライン方針（どこまでオフラインで動くべきか）を必ず特定する**:
   参照のみ？ 編集のキューイングあり？ 完全オンライン前提？
   方針が不明なままキャッシュを足すのは事故のもと — ドキュメントにも実装にも根拠がなければ
   ユーザーに確認する

spec / ドキュメントと実装が食い違っていたら、**実装を spec に寄せる**のが原則。
spec 自体を変えたい場合は先にユーザーへ提案する。

## 診断チェックリスト（汎用）

上から順に確認し、結果を ✅ / ⚠️ / ❌ で報告する。

### A. インストール可能性

- [ ] manifest が配信される（name / short_name / icons 192・512 / theme_color / display）
- [ ] アイコン実体が存在する（maskable 含む）
- [ ] SW が登録される（登録コードがエントリポイント側にある）
- [ ] HTTPS 前提が満たされる構成か

### B. オフライン動作（プロジェクト方針に沿って）

- [ ] app shell（HTML/CSS/JS/フォント/アイコン）がプリキャッシュされる
- [ ] API GET のランタイムキャッシュ戦略が方針どおり
      （stale-while-revalidate / network-first 等、TTL・maxEntries 含む）
- [ ] クライアント状態の永続化（Query persist 等）が効き、リロード直後に last-known データが出る
- [ ] 認証付き・短命 URL のリソース（signed URL 等）を不用意にキャッシュしていない

### C. オフライン時の書き込み

- [ ] 方針が「抑止」なら: すべての mutation がオンライン必須ガードを通り、ユーザーに通知される。
      キューイングを先回り実装していない
- [ ] 方針が「キューイング」なら: 再送・競合・重複送信の扱いが定義どおり

### D. SW 更新フロー

- [ ] 新 SW 配信時の更新挙動（autoUpdate / prompt）が意図どおり
- [ ] 古いキャッシュが expiration / precache cleanup で掃除される

### E. 通知など SW 拡張機能（採用している場合）

- [ ] push / notificationclick 等のハンドラが現行の strategy と両立している
      （カスタムハンドラがあるのに generateSW に切り替える、などの構成破壊がないか)

## 動作確認手順（汎用）

1. 本番相当でビルドしてローカル配信する（dev サーバーでは SW の挙動が本番と異なる）
2. DevTools → Application → Manifest / Service Workers を確認
3. 主要画面を一度表示してキャッシュを温める
4. DevTools → Network → Offline に切り替えてリロード → 方針どおりの範囲が動くこと
5. オフラインのまま書き込み操作 → 方針どおり（抑止 or キュー）に動くこと
6. Online に戻す → データが自動更新されること

## よくある故障と対処

| 症状                       | 原因候補                                                    |
| -------------------------- | ----------------------------------------------------------- |
| インストールバナーが出ない | manifest の icons 不足 / display 設定 / SW 未登録           |
| オフラインで真っ白         | プリキャッシュ漏れ（ハッシュ付きアセットが glob 対象外）    |
| 古い画面が出続ける         | SW 更新フロー未実装、skipWaiting/clientsClaim の方針不整合  |
| オフラインでデータが出ない | ランタイムキャッシュ未ヒット + 状態 persist 未設定/期限切れ |
| 認証付きリソースが壊れる   | 短命 URL をそのままキャッシュキーにしている                 |
| SW のビルドエラー          | SW は Worker コンテキスト — `window` / DOM 前提コードの混入 |

## 修正時の注意

- SW は WebWorker コンテキスト。`window` / DOM API を使わない
- キャッシュ戦略の数値（TTL / maxEntries）を spec から逸脱させる場合は理由を報告する
- 修正後は「動作確認手順」を再実行し、プロジェクトの format / lint / typecheck を通す

## Definition of Done

- [ ] オフライン方針を特定し、チェックリスト A〜E の結果を報告した
- [ ] 修正した場合、本番相当ビルドでのオフライン動作確認結果を報告した
- [ ] プロジェクトの format / lint / typecheck が通る
