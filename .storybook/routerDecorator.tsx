import type { Decorator } from "@storybook/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";

export const withRouter: Decorator = (Story) => {
  const rootRoute = createRootRoute({ component: Story });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory(),
  });
  return <RouterProvider router={router} />;
};
