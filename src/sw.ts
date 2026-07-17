import { ExpirationPlugin } from "workbox-expiration";
import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { NetworkFirst } from "workbox-strategies";

declare const self: ServiceWorkerGlobalScope;

cleanupOutdatedCaches();

// Precache the app shell (injected by vite-plugin-pwa)
precacheAndRoute(self.__WB_MANIFEST);

// Runtime cache: Supabase PostgREST GET requests with network-first.
// StaleWhileRevalidate would serve cached (stale) data to the refetch that
// TanStack Query fires right after a mutation, so the UI would keep showing
// pre-update values. NetworkFirst always returns fresh data while online and
// falls back to the cache only when the network is unavailable (offline read).
registerRoute(
  ({ url }: { url: URL }) =>
    url.hostname.endsWith(".supabase.co") && url.pathname.startsWith("/rest/v1/"),
  new NetworkFirst({
    cacheName: "supabase-rest-v1",
    networkTimeoutSeconds: 5,
    plugins: [
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 60 * 60, // 1 hour
      }),
    ],
  }),
  "GET",
);

// Handle push notifications
self.addEventListener("push", (event: PushEvent) => {
  if (!event.data) return;
  const data = event.data.json() as { title?: string; body?: string };
  event.waitUntil(
    self.registration.showNotification(data.title ?? "housekeeper", {
      body: data.body,
      icon: "/favicon.svg",
      badge: "/favicon.svg",
    }),
  );
});

const NOTIFICATION_TARGET_URL = "/";

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const targetUrl = new URL(NOTIFICATION_TARGET_URL, self.location.origin).href;
      const allClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const existing = allClients.find(
        (client): client is WindowClient => "focus" in client && client.url === targetUrl,
      );
      if (existing) {
        await existing.focus();
      } else {
        await self.clients.openWindow(NOTIFICATION_TARGET_URL);
      }
    })(),
  );
});
