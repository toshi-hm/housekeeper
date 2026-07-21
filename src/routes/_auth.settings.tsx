import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Bell,
  ChevronRight,
  Download,
  Globe,
  History,
  ListPlus,
  MapPin,
  Moon,
  Plus,
  Ruler,
  Tag,
  Tags,
  X,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { LanguageToggle } from "@/components/atoms/LanguageToggle";
import { Skeleton } from "@/components/atoms/Skeleton";
import { Spinner } from "@/components/atoms/Spinner";
import { ThemeToggle } from "@/components/atoms/ThemeToggle";
import { DataExportPanel } from "@/components/organisms/DataExportPanel";
import { NotificationSettings } from "@/components/organisms/NotificationSettings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useCreateCustomUnit, useCustomUnits, useDeleteCustomUnit } from "@/hooks/useCustomUnits";
import { useUpdateUserSettings, useUserSettings } from "@/hooks/useUserSettings";
import { OfflineError } from "@/lib/requireOnline";
import { useToast } from "@/lib/toast-context";
import { CONTENT_UNITS, DEFAULT_AUTO_ARCHIVE_AFTER_DAYS } from "@/types/item";

export const SettingsPage = () => {
  const { t } = useTranslation("settings");
  const navigate = useNavigate();
  const matches = useRouterState({ select: (s) => s.matches });
  const isChildActive = matches.some(
    (m) =>
      m.routeId === "/_auth/settings/categories" ||
      m.routeId === "/_auth/settings/locations" ||
      m.routeId === "/_auth/settings/tags" ||
      m.routeId === "/_auth/settings/archived-items" ||
      m.routeId === "/_auth/settings/purchase-history",
  );
  const { data: settings, isLoading } = useUserSettings();
  const updateSettings = useUpdateUserSettings();
  const { data: customUnits = [], isLoading: isLoadingCustomUnits } = useCustomUnits();
  const createCustomUnit = useCreateCustomUnit();
  const deleteCustomUnit = useDeleteCustomUnit();
  const { toast } = useToast();
  const [warningDays, setWarningDays] = useState<string | null>(null);
  const [newUnitName, setNewUnitName] = useState("");
  const [deletingUnitId, setDeletingUnitId] = useState<string | null>(null);
  const warningDaysValue =
    warningDays ??
    (settings?.expiry_warning_days !== undefined ? String(settings.expiry_warning_days) : "");
  const [autoArchiveDays, setAutoArchiveDays] = useState<string | null>(null);
  const autoArchiveEnabled = (settings?.auto_archive_after_days ?? null) !== null;
  const autoArchiveDaysValue =
    autoArchiveDays ??
    (settings?.auto_archive_after_days !== null && settings?.auto_archive_after_days !== undefined
      ? String(settings.auto_archive_after_days)
      : String(DEFAULT_AUTO_ARCHIVE_AFTER_DAYS));
  const [forecastDays, setForecastDays] = useState<string | null>(null);
  const forecastDaysValue =
    forecastDays ??
    (settings?.low_stock_forecast_days !== undefined
      ? String(settings.low_stock_forecast_days)
      : "");

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

  const handleDefaultUnitChange = async (unit: string) => {
    try {
      await updateSettings.mutateAsync({ default_unit: unit });
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

  const handleAutoArchiveToggle = async (enabled: boolean) => {
    try {
      await updateSettings.mutateAsync({
        auto_archive_after_days: enabled
          ? (settings?.auto_archive_after_days ?? DEFAULT_AUTO_ARCHIVE_AFTER_DAYS)
          : null,
      });
      setAutoArchiveDays(null);
      toast(t("saveSuccess"), "success");
    } catch (error) {
      if (!(error instanceof OfflineError)) {
        toast(t("common:unknownError"), "error");
      }
    }
  };

  const handleAutoArchiveDaysChange = async (days: number) => {
    if (isNaN(days) || days < 1 || days > 365) {
      toast(t("invalidAutoArchiveDays"), "error");
      return;
    }
    try {
      await updateSettings.mutateAsync({ auto_archive_after_days: days });
      setAutoArchiveDays(null);
      toast(t("saveSuccess"), "success");
    } catch (error) {
      if (!(error instanceof OfflineError)) {
        toast(t("common:unknownError"), "error");
      }
    }
  };

  const handleForecastDaysChange = async (days: number) => {
    if (isNaN(days) || days < 0 || days > 90) {
      toast(t("invalidLowStockForecastDays"), "error");
      return;
    }
    try {
      await updateSettings.mutateAsync({ low_stock_forecast_days: days });
      setForecastDays(null);
      toast(t("saveSuccess"), "success");
    } catch (error) {
      if (!(error instanceof OfflineError)) {
        toast(t("common:unknownError"), "error");
      }
    }
  };

  const handleCreateCustomUnit = async () => {
    if (!newUnitName.trim()) return;
    try {
      await createCustomUnit.mutateAsync(newUnitName.trim());
      setNewUnitName("");
      toast(t("common:saveSuccess"), "success");
    } catch {
      // error toast is handled by the mutation's onError
    }
  };

  const handleDeleteCustomUnit = async (id: string) => {
    setDeletingUnitId(id);
    try {
      await deleteCustomUnit.mutateAsync(id);
      toast(t("common:deleteSuccess"), "success");
    } catch {
      // error toast is handled by the mutation's onError
    } finally {
      setDeletingUnitId(null);
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

          {/* Low-stock forecast days (#68, #392) */}
          <section>
            <h2 className="mb-1 text-sm font-semibold text-muted-foreground">
              {t("lowStockForecastDays")}
            </h2>
            <p className="mb-2 text-xs text-muted-foreground">{t("lowStockForecastDaysHelp")}</p>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                max={90}
                value={forecastDaysValue}
                className="w-24"
                onChange={(e) => setForecastDays(e.target.value)}
                onBlur={(e) => {
                  void handleForecastDaysChange(parseInt(e.target.value, 10));
                }}
              />
              <Label>{t("daysBefore")}</Label>
            </div>
          </section>

          {/* Default unit */}
          <section>
            <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <Ruler className="h-4 w-4" />
              {t("defaultUnit")}
            </h2>
            <Select
              className="w-32"
              value={settings?.default_unit ?? "mL"}
              onChange={(e) => {
                void handleDefaultUnitChange(e.target.value);
              }}
            >
              {CONTENT_UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </Select>
          </section>

          {/* Custom units */}
          <section>
            <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <ListPlus className="h-4 w-4" />
              {t("customUnits")}
            </h2>
            <p className="mb-2 text-xs text-muted-foreground">{t("customUnitsHelp")}</p>
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input
                  value={newUnitName}
                  onChange={(e) => setNewUnitName(e.target.value)}
                  placeholder={t("customUnitName")}
                  maxLength={40}
                  disabled={createCustomUnit.isPending}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleCreateCustomUnit();
                  }}
                />
                <Button
                  onClick={() => {
                    void handleCreateCustomUnit();
                  }}
                  disabled={createCustomUnit.isPending || !newUnitName.trim()}
                  size="icon"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {isLoadingCustomUnits ? (
                <Skeleton className="h-8 w-full rounded-md" />
              ) : customUnits.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("noCustomUnits")}</p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {customUnits.map((unit) => (
                    <li
                      key={unit.id}
                      className="flex items-center gap-1 rounded-full border bg-muted/50 px-3 py-1 text-sm"
                    >
                      {unit.name}
                      <button
                        type="button"
                        aria-label={t("common:delete")}
                        className="text-muted-foreground hover:text-destructive disabled:opacity-40"
                        disabled={deletingUnitId === unit.id}
                        onClick={() => {
                          void handleDeleteCustomUnit(unit.id);
                        }}
                      >
                        {deletingUnitId === unit.id ? (
                          <Spinner className="h-3 w-3" />
                        ) : (
                          <X className="h-3 w-3" />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
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

          {/* Auto-archive expired items (#419) */}
          <section>
            <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <Archive className="h-4 w-4" />
              {t("autoArchive")}
            </h2>
            <p className="mb-2 text-xs text-muted-foreground">{t("autoArchiveHelp")}</p>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="rounded"
                checked={autoArchiveEnabled}
                onChange={(e) => {
                  void handleAutoArchiveToggle(e.target.checked);
                }}
              />
              {t("autoArchiveEnable")}
            </label>
            {autoArchiveEnabled && (
              <div className="mt-2 flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={365}
                  value={autoArchiveDaysValue}
                  className="w-24"
                  onChange={(e) => setAutoArchiveDays(e.target.value)}
                  onBlur={(e) => {
                    void handleAutoArchiveDaysChange(parseInt(e.target.value, 10));
                  }}
                />
                <Label>{t("daysAfterExpiry")}</Label>
              </div>
            )}
            <Link
              to="/settings/archived-items"
              className="mt-3 flex items-center justify-between rounded-lg border p-3 hover:bg-muted/50"
            >
              <div className="flex items-center gap-3">
                <ArchiveRestore className="h-5 w-5 text-muted-foreground" />
                <span>{t("archivedItems")}</span>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          </section>

          {/* Data export */}
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <Download className="h-4 w-4" />
              {t("exportDataSection")}
            </h2>
            <DataExportPanel />
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
              <Link
                to="/settings/tags"
                className="flex items-center justify-between p-4 hover:bg-muted/50"
              >
                <div className="flex items-center gap-3">
                  <Tags className="h-5 w-5 text-muted-foreground" />
                  <span>{t("tags")}</span>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            </div>
          </section>

          {/* Purchase history */}
          <section>
            <div className="divide-y rounded-lg border">
              <Link
                to="/settings/purchase-history"
                className="flex items-center justify-between p-4 hover:bg-muted/50"
              >
                <div className="flex items-center gap-3">
                  <History className="h-5 w-5 text-muted-foreground" />
                  <span>{t("purchaseHistory")}</span>
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
