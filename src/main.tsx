import "./index.css";
import "./lib/i18n";

import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { registerPwaServiceWorker } from "@/lib/pwa";
import { persister, queryClient } from "@/lib/queryClient";
import { ToastProvider } from "@/lib/toast";

import { routeTree } from "./routeTree.gen";

const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element not found");

registerPwaServiceWorker();

createRoot(rootElement).render(
  <StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, maxAge: 1000 * 60 * 60 * 24 }}
    >
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </PersistQueryClientProvider>
  </StrictMode>,
);
