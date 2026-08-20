import type { QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { createRootRouteWithContext, Link, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { useTranslation } from "react-i18next";

import { useSwUpdatePrompt } from "@/hooks/useSwUpdatePrompt";
import { AuthProvider } from "@/lib/AuthProvider";

interface RouterContext {
  queryClient: QueryClient;
}

const RootLayout = () => {
  // 認証状態によらず常時マウントされるルートで、新しいService Workerの
  // 有効化を検知して再読み込みを促す(#785)
  useSwUpdatePrompt();

  return (
    <AuthProvider>
      <Outlet />
      {import.meta.env.DEV && (
        <>
          <TanStackRouterDevtools />
          <ReactQueryDevtools />
        </>
      )}
    </AuthProvider>
  );
};

export const NotFoundPage = () => {
  const { t } = useTranslation("common");
  return (
    <div className="flex min-h-screen flex-col items-center justify-center">
      <h1 className="text-2xl font-bold">{t("notFound")}</h1>
      <Link to="/" className="mt-4 text-primary underline">
        {t("goHome")}
      </Link>
    </div>
  );
};

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  notFoundComponent: NotFoundPage,
});
