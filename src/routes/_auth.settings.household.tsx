import { createFileRoute } from "@tanstack/react-router";

import { HouseholdSettingsPage } from "@/components/pages/HouseholdSettingsPage";

export const Route = createFileRoute("/_auth/settings/household")({
  component: HouseholdSettingsPage,
});
