import { createFileRoute } from "@tanstack/react-router";

import { ArchivedItemsPage } from "@/components/pages/ArchivedItemsPage";

export const Route = createFileRoute("/_auth/settings/archived-items")({
  component: ArchivedItemsPage,
});
