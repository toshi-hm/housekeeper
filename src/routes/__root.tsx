import type { QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { createRootRouteWithContext, Link, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/router-devtools";
import { useTranslation } from "react-i18next";

interface RouterContext {
  queryClient: QueryClient;
}

const RootLayout = () => (
  <>
    <Outlet />
    {import.meta.env.DEV && (
      <>
        <TanStackRouterDevtools />
        <ReactQueryDevtools />
      </>
    )}
  </>
);

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
