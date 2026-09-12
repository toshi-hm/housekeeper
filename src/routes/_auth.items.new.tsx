import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { NewItemPage } from "@/components/pages/NewItemPage";

const searchSchema = z.object({
  cloneFrom: z.string().optional(),
  /** シェルフスキャンの「未登録候補」からの遷移時、OCR認識名をプリフィルする (#1027)。 */
  prefillName: z.string().optional(),
});

const NewItemRoute = () => {
  const { cloneFrom, prefillName } = Route.useSearch();
  return <NewItemPage cloneFrom={cloneFrom} prefillName={prefillName} />;
};

export const Route = createFileRoute("/_auth/items/new")({
  validateSearch: searchSchema,
  component: NewItemRoute,
});
