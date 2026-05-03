import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { StaleWhileRevalidate } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";

declare const self: ServiceWorkerGlobalScope;

cleanupOutdatedCaches();

// Precache the app shell (injected by vite-plugin-pwa)
precacheAndRoute(self.__WB_MANIFEST);

// Runtime cache: Supabase PostgREST GET requests with stale-while-revalidate
registerRoute(
  ({ url }: { url: URL }) =>
    url.hostname.endsWith(".supabase.co") && url.pathname.startsWith("/rest/v1/"),
  new StaleWhileRevalidate({
    cacheName: "supabase-rest-v1",
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

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  event.waitUntil(
    (self.clients as Clients).openWindow("/"),
  );
});
