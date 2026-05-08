import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, Bell, ChevronRight, Globe, MapPin, Tag } from "lucide-react";
import { useTranslation } from "react-i18next";

import { LanguageToggle } from "@/components/atoms/LanguageToggle";
import { Spinner } from "@/components/atoms/Spinner";
import { NotificationSettings } from "@/components/organisms/NotificationSettings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUpdateUserSettings, useUserSettings } from "@/hooks/useUserSettings";
import { useToast } from "@/lib/toast";

const SettingsPage = () => {
  const { t } = useTranslation("settings");
  const navigate = useNavigate();
  const matches = useRouterState({ select: (s) => s.matches });
  const isChildActive = matches.some(
    (m) => m.routeId === "/_auth/settings/categories" || m.routeId === "/_auth/settings/locations",
  );
  const { data: settings, isLoading } = useUserSettings();
  const updateSettings = useUpdateUserSettings();
  const { toast } = useToast();

  const handleLanguageChange = async (lang: "ja" | "en") => {
    try {
      await updateSettings.mutateAsync({ language: lang });
      toast(t("saveSuccess"), "success");
    } catch {
      toast(t("common:unknownError"), "error");
    }
  };

  const handleWarningDaysChange = async (days: number) => {
    if (isNaN(days) || days < 0) return;
    try {
      await updateSettings.mutateAsync({ expiry_warning_days: days });
    } catch {
      toast(t("common:unknownError"), "error");
    }
  };

  if (isChildActive) {
    return <Outlet />;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={() => void navigate({ to: "/" })}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold">{t("title")}</h1>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Language */}
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <Globe className="h-4 w-4" />
              {t("language")}
            </h2>
            <LanguageToggle
              value={settings?.language ?? "ja"}
              onChange={(lang) => {
                void handleLanguageChange(lang as "ja" | "en");
              }}
            />
          </section>

          {/* Expiry warning days */}
          <section>
            <h2 className="mb-1 text-sm font-semibold text-muted-foreground">
              {t("expiryWarningDays")}
            </h2>
            <p className="mb-2 text-xs text-muted-foreground">{t("expiryWarningDaysHelp")}</p>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                max={30}
                defaultValue={settings?.expiry_warning_days ?? 3}
                className="w-24"
                onBlur={(e) => {
                  void handleWarningDaysChange(parseInt(e.target.value, 10));
                }}
              />
              <Label>日前</Label>
            </div>
          </section>

          {/* Notification Settings */}
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <Bell className="h-4 w-4" />
              {t("notifications")}
            </h2>
            <NotificationSettings />
          </section>

          {/* Master data links */}
          <section>
            <h2 className="mb-3 text-sm font-semibold text-muted-foreground">{t("masterData")}</h2>
            <div className="divide-y rounded-lg border">
              <Link
                to="/settings/categories"
                className="flex items-center justify-between p-4 hover:bg-muted/50"
              >
                <div className="flex items-center gap-3">
                  <Tag className="h-5 w-5 text-muted-foreground" />
                  <span>{t("categories")}</span>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
              <Link
                to="/settings/locations"
                className="flex items-center justify-between p-4 hover:bg-muted/50"
              >
                <div className="flex items-center gap-3">
                  <MapPin className="h-5 w-5 text-muted-foreground" />
                  <span>{t("storageLocations")}</span>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

export const Route = createFileRoute("/_auth/settings")({
  component: SettingsPage,
});
