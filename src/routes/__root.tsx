import { createRootRouteWithContext, Link, Outlet } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/router-devtools'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import type { QueryClient } from '@tanstack/react-query'

interface RouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  notFoundComponent: () => (
    <div className="flex min-h-screen flex-col items-center justify-center">
      <h1 className="text-2xl font-bold">404 — Page not found</h1>
      <Link to="/" className="mt-4 text-primary underline">Go home</Link>
    </div>
  ),
})

function RootLayout() {
  return (
    <>
      <Outlet />
      {import.meta.env.DEV && (
        <>
          <TanStackRouterDevtools />
          <ReactQueryDevtools />
        </>
      )}
    </>
  )
}
