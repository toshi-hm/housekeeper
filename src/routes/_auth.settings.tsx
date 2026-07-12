import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, Bell, ChevronRight, Globe, MapPin, Moon, Tag } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { LanguageToggle } from "@/components/atoms/LanguageToggle";
import { Skeleton } from "@/components/atoms/Skeleton";
import { ThemeToggle } from "@/components/atoms/ThemeToggle";
import { NotificationSettings } from "@/components/organisms/NotificationSettings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUpdateUserSettings, useUserSettings } from "@/hooks/useUserSettings";
import { OfflineError } from "@/lib/requireOnline";
import { useToast } from "@/lib/toast-context";

export const SettingsPage = () => {
  const { t } = useTranslation("settings");
  const navigate = useNavigate();
  const matches = useRouterState({ select: (s) => s.matches });
  const isChildActive = matches.some(
    (m) => m.routeId === "/_auth/settings/categories" || m.routeId === "/_auth/settings/locations",
  );
  const { data: settings, isLoading } = useUserSettings();
  const updateSettings = useUpdateUserSettings();
  const { toast } = useToast();
  const [warningDays, setWarningDays] = useState<string | null>(null);
  const warningDaysValue =
    warningDays ??
    (settings?.expiry_warning_days !== undefined ? String(settings.expiry_warning_days) : "");

  const handleLanguageChange = async (lang: "ja" | "en") => {
    try {
      await updateSettings.mutateAsync({ language: lang });
      toast(t("saveSuccess"), "success");
    } catch (error) {
      if (!(error instanceof OfflineError)) {
        toast(t("common:unknownError"), "error");
      }
    }
  };

  const handleWarningDaysChange = async (days: number) => {
    if (isNaN(days) || days < 1 || days > 30) {
      toast(t("invalidWarningDays"), "error");
      return;
    }
    try {
      await updateSettings.mutateAsync({ expiry_warning_days: days });
      setWarningDays(null);
      toast(t("saveSuccess"), "success");
    } catch (error) {
      if (!(error instanceof OfflineError)) {
        toast(t("common:unknownError"), "error");
      }
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
        <div className="space-y-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-full rounded-md" />
            </div>
          ))}
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

          {/* Theme */}
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <Moon className="h-4 w-4" />
              {t("theme")}
            </h2>
            <ThemeToggle />
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
                min={1}
                max={30}
                value={warningDaysValue}
                className="w-24"
                onChange={(e) => setWarningDays(e.target.value)}
                onBlur={(e) => {
                  void handleWarningDaysChange(parseInt(e.target.value, 10));
                }}
              />
              <Label>{t("daysBefore")}</Label>
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
