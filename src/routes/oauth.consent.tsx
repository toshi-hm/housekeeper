import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isMfaChallengeRequired } from "@/lib/mfa";
import { supabase } from "@/lib/supabase";

interface AuthorizationDetails {
  clientName: string;
  redirectUri: string;
  scopes: string[];
}

const OAuthConsentPage = () => {
  const { t } = useTranslation("auth");
  const { authorization_id: authorizationId } = Route.useSearch();
  const [details, setDetails] = useState<AuthorizationDetails | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void supabase.auth.oauth
      .getAuthorizationDetails(authorizationId)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) {
          setErrorMessage(t("oauthConsentLoadFailed"));
          return;
        }
        if ("redirect_url" in data) {
          window.location.assign(data.redirect_url);
          return;
        }
        if (!("client" in data) || !("redirect_uri" in data)) {
          setErrorMessage(t("oauthConsentLoadFailed"));
          return;
        }
        setDetails({
          clientName: data.client.name,
          redirectUri: data.redirect_uri,
          scopes: ("scope" in data ? data.scope : "").split(" ").filter(Boolean),
        });
      })
      .catch(() => {
        if (!cancelled) setErrorMessage(t("oauthConsentLoadFailed"));
      });
    return () => {
      cancelled = true;
    };
  }, [authorizationId, t]);

  const decide = async (approved: boolean) => {
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const result = approved
        ? await supabase.auth.oauth.approveAuthorization(authorizationId)
        : await supabase.auth.oauth.denyAuthorization(authorizationId);
      if (result.error || !result.data?.redirect_url) {
        setErrorMessage(t("oauthConsentActionFailed"));
        setIsSubmitting(false);
        return;
      }
      window.location.assign(result.data.redirect_url);
    } catch {
      setErrorMessage(t("oauthConsentActionFailed"));
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-8">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>{t("oauthConsentTitle")}</CardTitle>
          <CardDescription>{t("oauthConsentDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {details ? (
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="font-medium">{t("oauthConsentClient")}</dt>
                <dd>{details.clientName}</dd>
              </div>
              <div>
                <dt className="font-medium">{t("oauthConsentScopes")}</dt>
                <dd>
                  {details.scopes.length > 0
                    ? details.scopes.join(", ")
                    : t("oauthConsentInventoryAccess")}
                </dd>
              </div>
              <div>
                <dt className="font-medium">{t("oauthConsentRedirect")}</dt>
                <dd className="break-all">{details.redirectUri}</dd>
              </div>
            </dl>
          ) : (
            <p role="status">{t("oauthConsentLoading")}</p>
          )}
          {errorMessage && (
            <p role="alert" className="text-sm text-destructive">
              {errorMessage}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button disabled={!details || isSubmitting} onClick={() => void decide(true)}>
              {t("oauthConsentAllow")}
            </Button>
            <Button
              variant="outline"
              disabled={!details || isSubmitting}
              onClick={() => void decide(false)}
            >
              {t("oauthConsentDeny")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
};

export const Route = createFileRoute("/oauth/consent")({
  validateSearch: z.object({ authorization_id: z.string().min(1) }),
  beforeLoad: async ({ search }) => {
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      const { data: aal, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (!error && !isMfaChallengeRequired(aal)) return;
    }
    const returnTo = `/oauth/consent?authorization_id=${encodeURIComponent(search.authorization_id)}`;
    throw redirect({ to: "/login", search: { returnTo } });
  },
  component: OAuthConsentPage,
});
