export const registerPwaServiceWorker = (): (() => void) | undefined => {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  const handler = () => {
    void navigator.serviceWorker.register("/sw.js").catch((err: unknown) => {
      // oxlint-disable-next-line no-console
      console.error("[PWA] Service worker registration failed:", err);
    });
  };
  window.addEventListener("load", handler);
  return () => window.removeEventListener("load", handler);
};
