import { createFileRoute } from "@tanstack/react-router";

import { NewItemPage } from "@/components/pages/NewItemPage";

export const Route = createFileRoute("/_auth/items/new")({
  component: NewItemPage,
});
