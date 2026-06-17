import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { NewItemPage } from "@/components/pages/NewItemPage";

const searchSchema = z.object({
  cloneFrom: z.string().optional(),
});

const NewItemRoute = () => {
  const { cloneFrom } = Route.useSearch();
  return <NewItemPage cloneFrom={cloneFrom} />;
};

export const Route = createFileRoute("/_auth/items/new")({
  validateSearch: searchSchema,
  component: NewItemRoute,
});
