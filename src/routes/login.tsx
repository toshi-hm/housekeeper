import { createFileRoute, redirect } from "@tanstack/react-router";

import { LoginPage } from "@/components/pages/LoginPage";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/login")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      throw redirect({ to: "/" });
    }
  },
  component: LoginPage,
});
