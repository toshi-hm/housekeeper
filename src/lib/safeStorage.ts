/**
 * localStorage への安全なアクセス。サイトデータのブロックや private browsing、
 * 容量超過では getItem/setItem が例外を投げるため、永続化の失敗で画面を壊さない
 * よう握りつぶす（保存できなくても React state 側で表示は継続できる）。
 */
export const safeGetItem = (key: string): string | null => {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

export const safeSetItem = (key: string, value: string): void => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // 非致命: 永続化できなくても操作自体は続行する
  }
};
