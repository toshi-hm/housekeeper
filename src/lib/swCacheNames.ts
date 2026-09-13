/**
 * Service Worker（`src/sw.ts`）が Cache Storage へ登録するキャッシュ名。メインスレッド側
 * （`AuthProvider.tsx` のログアウト処理、#1057）からも同じ名前で `caches.delete()` する
 * 必要があるため、文字列のずれを防ぐ共有定数として切り出している。
 */
export const SUPABASE_REST_CACHE_NAME = "supabase-rest-v1";
