---
name: pwa-doctor
description: >-
  Use when working on PWA / offline / Service Worker concerns — 「PWAを確認して」「オフラインで動かない」
  「Service Workerを直して」「インストールできない」「キャッシュがおかしい」「manifest を見て」など。
  spec（docs/specs/features/pwa.md）との突き合わせ診断と、修正の実装を行う。
---

# Skill: pwa-doctor

PWA / オフライン / Service Worker まわりの診断と修正を行う。

## 真実の源

- `docs/specs/features/pwa.md` — オフラインは **参照のみ**。編集系のオフラインキューイングは作らない
- `docs/specs/features/notifications.md` — SW は Web Push と統合（`injectManifest` 戦略の理由）

spec と実装が食い違っていたら、**実装を spec に寄せる**のが原則。
spec 自体を変えたい場合は先にユーザーへ提案する。

## このリポジトリの PWA 構成

| 要素           | 実体                                                                  |
| -------------- | --------------------------------------------------------------------- |
| プラグイン     | `vite-plugin-pwa`（`vite.config.ts`）、strategy は `injectManifest`   |
| Service Worker | `src/sw.ts`（workbox-precaching / routing / strategies / expiration） |
| SW 用 tsconfig | `tsconfig.sw.json`                                                    |
| クエリ永続化   | TanStack Query persister + `idb-keyval`（IndexedDB、24h）             |
| オフライン抑止 | `useOnlineStatus` / `requireOnline()`（`src/lib/requireOnline.ts`）   |
| 配信           | Cloudflare（`wrangler.jsonc`）                                        |

## 診断チェックリスト

上から順に確認し、結果を ✅ / ⚠️ / ❌ で報告する。

### A. インストール可能性

- [ ] manifest が生成される（name / short_name / icons 192・512 / theme_color / display: standalone）
- [ ] `public/` にアイコン実体がある（maskable 含む）
- [ ] SW が登録される（`virtual:pwa-register` 等の登録コードが main 側にある）
- [ ] HTTPS 前提の記述に問題がない

### B. オフライン参照（spec F-10 の中核）

- [ ] app shell（HTML/CSS/JS/フォント/アイコン）がプリキャッシュされる
- [ ] PostgREST GET（items / categories / storage_locations / user_settings）が
      `stale-while-revalidate`、TTL 1h、maxEntries 100 でランタイムキャッシュされる
- [ ] TanStack Query の persist が効き、リロード直後に last-known データが出る
- [ ] 画像（signed URL）はネットワーク優先（短命 URL をキャッシュキーにしない）

### C. オフライン時の編集抑止

- [ ] すべての mutation hook が先頭で `requireOnline()` を呼ぶ
      （`rg "useMutation" src/hooks` で列挙し、`requireOnline` の有無を突き合わせる）
- [ ] オフライン編集試行時にトーストが出る
- [ ] オフラインキューイングを**実装していない**こと（spec 違反の先回り実装がないか）

### D. SW 更新フロー

- [ ] 新 SW 配信時の更新挙動（autoUpdate / prompt）が意図どおりか
- [ ] 古いキャッシュが `workbox-expiration` / precache cleanup で掃除されるか

### E. Push 統合（v1.2）

- [ ] `src/sw.ts` に push / notificationclick ハンドラが同居できる構成か
      （generateSW に切り替えるような変更をしていないか）

## 動作確認手順

```bash
bun run build && bun run preview
```

1. ブラウザで preview URL を開き、DevTools → Application → Manifest / Service Workers を確認
2. 一覧・詳細を一度表示してキャッシュを温める
3. DevTools → Network → Offline に切り替えてリロード → 一覧・詳細・バッジが表示されること
4. オフラインのまま編集操作 → トーストで抑止されること
5. Online に戻す → データが自動更新されること

**注意**: `bun run dev` では SW の挙動は本番と異なる（devOptions 次第）。
オフライン検証は必ず build + preview で行う。

## よくある故障と対処

| 症状                       | 原因候補                                                                                 |
| -------------------------- | ---------------------------------------------------------------------------------------- |
| インストールバナーが出ない | manifest の icons 不足 / display 設定 / SW 未登録                                        |
| オフラインで真っ白         | プリキャッシュ漏れ（ハッシュ付きアセットが injectManifest の glob 対象外）               |
| 古い画面が出続ける         | SW 更新フロー未実装、skipWaiting/clientsClaim の方針不整合                               |
| オフラインでデータが出ない | ランタイムキャッシュ未ヒット + Query persist 未設定/期限切れ                             |
| signed URL 画像が壊れる    | 短命 URL をそのままキャッシュ（image_path 単位の正規化を検討 or ネットワーク優先に戻す） |
| SW のビルドエラー          | `tsconfig.sw.json` のスコープ外 import（DOM 前提コードを sw.ts に混ぜた）                |

## 修正時の注意

- SW（`src/sw.ts`）は WebWorker コンテキスト。`window` / DOM API を使わない
- キャッシュ戦略の変更は spec の数値（TTL 1h / maxEntries 100 / persist 24h）から
  逸脱する場合、理由を報告する
- 修正後は必ず「動作確認手順」を再実行し、`npx oxfmt . && bun run check` を通す

## Definition of Done

- [ ] 診断チェックリスト A〜E の結果を報告した
- [ ] 修正した場合、build + preview でのオフライン動作確認結果を報告した
- [ ] `npx oxfmt . && bun run check` が通る
