import { Bell, Loader2, Mail, Send } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  subscribePush,
  unsubscribePush,
  useNotificationPreferences,
  useTestNotification,
  useUpdateNotificationPreferences,
} from "@/hooks/useNotificationPreferences";
import { OfflineError } from "@/lib/requireOnline";
import { listAvailableTimezones } from "@/lib/timezone";
import { useToast } from "@/lib/toast-context";

/**
 * notify_at の表示を "HH:00" に丸める。
 * 配信は毎時0分実行のcronで時単位でしか判定されないため、
 * 過去に分単位で保存された値が残っていても表示上は時単位に揃える (#708)
 */
const toHourOnly = (value: string): string => {
  const hour = parseInt(value.split(":")[0] ?? "", 10);
  if (isNaN(hour) || hour < 0 || hour > 23) return "08:00";
  return `${hour.toString().padStart(2, "0")}:00`;
};

export const NotificationSettings = () => {
  const { t } = useTranslation("notifications");
  const { data: prefs } = useNotificationPreferences();
  const updatePrefs = useUpdateNotificationPreferences();
  const testNotification = useTestNotification();
  const { toast } = useToast();
  const [isPushLoading, setIsPushLoading] = useState(false);

  const isPushSupported =
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window;

  const handlePushToggle = async () => {
    if (!isPushSupported) return;
    setIsPushLoading(true);
    try {
      if (prefs?.push_enabled) {
        await unsubscribePush();
      } else {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          toast(t("pushPermissionDenied"), "error");
          setIsPushLoading(false);
          return;
        }
        await subscribePush();
      }
    } catch (err) {
      // subscribePush/unsubscribePush errors are not covered by hook onError
      toast(
        err instanceof OfflineError ? t("common:offlineError") : t("common:unknownError"),
        "error",
      );
      setIsPushLoading(false);
      return;
    }
    try {
      if (prefs?.push_enabled) {
        await updatePrefs.mutateAsync({ push_enabled: false });
      } else {
        await updatePrefs.mutateAsync({ push_enabled: true });
        toast(t("pushEnabled"), "success");
      }
    } catch (err) {
      if (!(err instanceof OfflineError)) {
        toast(t("common:unknownError"), "error");
      }
      // OfflineError is handled by useUpdateNotificationPreferences onError
    } finally {
      setIsPushLoading(false);
    }
  };

  const handleEmailToggle = async () => {
    try {
      await updatePrefs.mutateAsync({ email_enabled: !prefs?.email_enabled });
    } catch (error) {
      if (!(error instanceof OfflineError)) {
        toast(t("common:unknownError"), "error");
      }
    }
  };

  const handleEmailAddressBlur = async (address: string) => {
    const trimmed = address.trim();
    if (trimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast(t("invalidEmailAddress"), "error");
      return;
    }
    try {
      await updatePrefs.mutateAsync({ email_address: trimmed || null });
    } catch (error) {
      if (!(error instanceof OfflineError)) {
        toast(t("common:unknownError"), "error");
      }
    }
  };

  const handleThresholdBlur = async (val: string) => {
    const days = parseInt(val, 10);
    if (isNaN(days) || days < 0 || days > 30) {
      toast(t("invalidThresholdDays"), "error");
      return;
    }
    try {
      await updatePrefs.mutateAsync({ threshold_days: days });
    } catch (error) {
      if (!(error instanceof OfflineError)) {
        toast(t("common:unknownError"), "error");
      }
    }
  };

  const handleNotifyAtBlur = async (val: string) => {
    if (!val) {
      toast(t("invalidNotifyAt"), "error");
      return;
    }
    const hour = parseInt(val.split(":")[0] ?? "", 10);
    if (isNaN(hour) || hour < 0 || hour > 23) {
      toast(t("invalidNotifyAt"), "error");
      return;
    }
    // 配信は毎時0分実行のcronで時単位でしか判定されないため、
    // UIも時単位に丸めて実態と一致させる (#708)
    const normalized = `${hour.toString().padStart(2, "0")}:00`;
    try {
      await updatePrefs.mutateAsync({ notify_at: normalized });
    } catch (error) {
      if (!(error instanceof OfflineError)) {
        toast(t("common:unknownError"), "error");
      }
    }
  };

  const handleTimezoneChange = async (value: string) => {
    try {
      await updatePrefs.mutateAsync({ timezone: value });
    } catch (error) {
      if (!(error instanceof OfflineError)) {
        toast(t("common:unknownError"), "error");
      }
    }
  };

  const timezones = useMemo(() => listAvailableTimezones(), []);

  // key forces re-mount of uncontrolled inputs when prefs load
  return (
    <div className="space-y-5" key={prefs?.user_id ?? "loading"}>
      {/* Push */}
      <div className="rounded-lg border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{t("pushEnabled")}</span>
          </div>
          <Button
            variant={prefs?.push_enabled ? "default" : "outline"}
            size="sm"
            onClick={() => void handlePushToggle()}
            disabled={!isPushSupported || isPushLoading}
          >
            {prefs?.push_enabled ? t("common:enabled") : t("common:disabled")}
          </Button>
        </div>
        {!isPushSupported && (
          <p className="text-xs text-muted-foreground">{t("pushNotSupported")}</p>
        )}
        {prefs?.push_enabled && (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => testNotification.mutate()}
            disabled={testNotification.isPending}
          >
            {testNotification.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {t("sendTestNotification")}
          </Button>
        )}
      </div>

      {/* Email */}
      <div className="rounded-lg border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{t("emailEnabled")}</span>
          </div>
          <Button
            variant={prefs?.email_enabled ? "default" : "outline"}
            size="sm"
            onClick={() => void handleEmailToggle()}
          >
            {prefs?.email_enabled ? t("common:enabled") : t("common:disabled")}
          </Button>
        </div>
        {prefs?.email_enabled && (
          <div className="space-y-1">
            <Label htmlFor="email_address">{t("emailAddress")}</Label>
            <Input
              id="email_address"
              type="email"
              defaultValue={prefs.email_address ?? ""}
              placeholder="you@example.com"
              onBlur={(e) => void handleEmailAddressBlur(e.target.value)}
            />
            {!prefs.email_address && (
              <p className="text-xs text-destructive">{t("emailAddressMissingWarning")}</p>
            )}
          </div>
        )}
      </div>

      {/* Threshold & time */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="threshold_days">{t("thresholdDays")}</Label>
          <div className="flex items-center gap-1">
            <Input
              id="threshold_days"
              type="number"
              min={0}
              max={30}
              defaultValue={prefs?.threshold_days ?? 3}
              className="w-20"
              onBlur={(e) => void handleThresholdBlur(e.target.value)}
            />
            <span className="text-sm text-muted-foreground">{t("daysBefore")}</span>
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="notify_at">{t("notifyAt")}</Label>
          <Input
            id="notify_at"
            type="time"
            step={3600}
            defaultValue={toHourOnly(prefs?.notify_at ?? "08:00")}
            onBlur={(e) => void handleNotifyAtBlur(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">{t("notifyAtHelp")}</p>
        </div>
        <div className="col-span-2 space-y-1">
          <Label htmlFor="timezone">{t("timezone")}</Label>
          <Select
            id="timezone"
            defaultValue={prefs?.timezone ?? "Asia/Tokyo"}
            onChange={(e) => void handleTimezoneChange(e.target.value)}
          >
            {timezones.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </Select>
          <p className="text-xs text-muted-foreground">{t("timezoneHelp")}</p>
        </div>
      </div>
    </div>
  );
};
