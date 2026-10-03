import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

import { LoginPage } from "@/components/pages/LoginPage";
import { isMfaChallengeRequired } from "@/lib/mfa";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/login")({
  validateSearch: z.object({
    returnTo: z
      .string()
      .regex(/^\/oauth\/consent(?:\?|$)/)
      .optional(),
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;

    // セッションはあるがMFAコード入力（aal2への昇格）が未完了の場合は、
    // /login にとどまりLoginPage側でコード入力ステップを表示する（#366）。
    const { data: aal, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalError || isMfaChallengeRequired(aal)) return;

    throw redirect({ to: "/" });
  },
  component: function LoginRouteComponent() {
    const { returnTo } = Route.useSearch();
    return <LoginPage returnTo={returnTo} />;
  },
});
