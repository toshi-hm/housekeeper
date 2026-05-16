import { createFileRoute } from "@tanstack/react-router";

import { EditItemPage } from "@/components/pages/EditItemPage";

const EditItemRoute = () => {
  const { itemId } = Route.useParams();
  return <EditItemPage itemId={itemId} />;
};

export const Route = createFileRoute("/_auth/items/$itemId/edit")({
  component: EditItemRoute,
});
