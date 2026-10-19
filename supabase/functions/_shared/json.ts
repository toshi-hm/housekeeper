/**
 * `req.json()` は JSON の `null` / 配列 / プリミティブも返すため、プロパティ参照の前に
 * オブジェクトであることを確認する（未捕捉例外で CORS なしの 500 になるのを防ぐ）。
 */
export const isJsonObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
