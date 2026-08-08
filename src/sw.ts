import { ExpirationPlugin } from "workbox-expiration";
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { NetworkFirst } from "workbox-strategies";

import { resolveNotificationTargetUrl } from "@/lib/notificationTarget";

declare const self: ServiceWorkerGlobalScope;

cleanupOutdatedCaches();

// Precache the app shell (injected by vite-plugin-pwa)
precacheAndRoute(self.__WB_MANIFEST);

// #784: SPA navigation fallback. TanStack Router uses real browser history
// (not hash routing), so a direct/offline navigation to e.g. "/items/xxx"
// is a request for that exact URL, which has no precache entry of its own
// (only the app shell's "/index.html" is precached). Without this route,
// Workbox's precache handler doesn't match, the request falls through to
// the network, and — offline — the browser renders its default offline
// error page instead of the SPA shell (which would let TanStack Router
// render the route client-side once JS boots).
//
// `NavigationRoute` only matches requests with `request.mode === "navigate"`
// (top-level document loads). Asset requests (JS/CSS/images) and API calls
// use other request modes ("cors"/"same-origin"/"no-cors"), regardless of
// origin — the Supabase REST route below, for instance, still gets its own
// fetch events and is handled by its own NetworkFirst route, not this one.
// So navigation fallback and API caching never compete for the same
// request, and nothing here can cause an API/auth request to be served
// stale HTML.
registerRoute(new NavigationRoute(createHandlerBoundToURL("index.html")));

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
  const data = event.data.json() as { title?: string; body?: string; data?: { url?: string } };
  event.waitUntil(
    self.registration.showNotification(data.title ?? "housekeeper", {
      body: data.body,
      icon: "/favicon.svg",
      badge: "/favicon.svg",
      // #671: 対象アイテム/期限カレンダーへのディープリンク。notificationclick側で読む。
      data: data.data,
    }),
  );
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const targetPath = resolveNotificationTargetUrl(event.notification.data);
  event.waitUntil(
    (async () => {
      const targetUrl = new URL(targetPath, self.location.origin).href;
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
        await self.clients.openWindow(targetPath);
      }
    })(),
  );
});
