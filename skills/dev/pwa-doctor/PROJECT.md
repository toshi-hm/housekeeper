# PROJECT.md — pwa-doctor（housekeeper 固有設定）

このファイルは housekeeper リポジトリ専用の設定。SKILL.md の一般論より **こちらを優先** する。
他リポジトリへ持ち出す場合はこのファイルを削除するか、移植先の値で書き直すこと。

## 真実の源（必読）

- `docs/specs/features/pwa.md` — **オフラインは参照のみ**。編集系のオフラインキューイングは作らない
- `docs/specs/features/notifications.md` — SW は Web Push と統合（`injectManifest` 戦略の理由）

## PWA 構成

| 要素           | 実体                                                                  |
| -------------- | --------------------------------------------------------------------- |
| プラグイン     | `vite-plugin-pwa`（`vite.config.ts`）、strategy は `injectManifest`   |
| Service Worker | `src/sw.ts`（workbox-precaching / routing / strategies / expiration） |
| SW 用 tsconfig | `tsconfig.sw.json`                                                    |
| クエリ永続化   | TanStack Query persister + `idb-keyval`（IndexedDB、24h）             |
| オフライン抑止 | `useOnlineStatus` / `requireOnline()`（`src/lib/requireOnline.ts`）   |
| 配信           | Cloudflare（`wrangler.jsonc`）                                        |

## 方針の具体値（チェックリスト B/C をこの値で検証する）

- オフライン方針: **参照のみ**。mutation はオフライン時に抑止 + トースト
- PostgREST GET（items / categories / storage_locations / user_settings）:
  `stale-while-revalidate`、TTL 1h、maxEntries 100
- 画像（Supabase Storage の signed URL）: ネットワーク優先
  （短命 URL をキャッシュキーにしない。将来 image_path 単位の正規化を検討）
- Query persist: 24h
- mutation 抑止の検証: `rg "useMutation" src/hooks` で列挙し、各 hook が先頭で
  `requireOnline()` を呼んでいるか突き合わせる

## 動作確認コマンド

```bash
bun run build && bun run preview
```

`bun run dev` では SW の挙動が本番と異なるため、オフライン検証は必ず build + preview で行う。

## 完了前チェック

```bash
npx oxfmt . && bun run check
```
