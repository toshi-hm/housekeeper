import { Bell, Mail } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  subscribePush,
  unsubscribePush,
  useNotificationPreferences,
  useUpdateNotificationPreferences,
} from "@/hooks/useNotificationPreferences";
import { OfflineError } from "@/lib/requireOnline";
import { useToast } from "@/lib/toast-context";

export const NotificationSettings = () => {
  const { t } = useTranslation("notifications");
  const { data: prefs } = useNotificationPreferences();
  const updatePrefs = useUpdateNotificationPreferences();
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
        await updatePrefs.mutateAsync({ push_enabled: false });
      } else {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          toast(t("pushPermissionDenied"), "error");
          return;
        }
        await subscribePush();
        await updatePrefs.mutateAsync({ push_enabled: true });
        toast(t("pushEnabled"), "success");
      }
    } catch (err) {
      toast(
        err instanceof OfflineError ? t("common:offlineError") : t("common:unknownError"),
        "error",
      );
    } finally {
      setIsPushLoading(false);
    }
  };

  const handleEmailToggle = async () => {
    try {
      await updatePrefs.mutateAsync({ email_enabled: !prefs?.email_enabled });
    } catch {
      toast(t("common:unknownError"), "error");
    }
  };

  const handleEmailAddressBlur = async (address: string) => {
    try {
      await updatePrefs.mutateAsync({ email_address: address.trim() || null });
    } catch {
      toast(t("common:unknownError"), "error");
    }
  };

  const handleThresholdBlur = async (val: string) => {
    const days = parseInt(val, 10);
    if (isNaN(days) || days < 0) return;
    try {
      await updatePrefs.mutateAsync({ threshold_days: days });
    } catch {
      toast(t("common:unknownError"), "error");
    }
  };

  const handleNotifyAtBlur = async (val: string) => {
    if (!val) return;
    try {
      await updatePrefs.mutateAsync({ notify_at: val });
    } catch {
      toast(t("common:unknownError"), "error");
    }
  };

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
            defaultValue={prefs?.notify_at ?? "08:00"}
            onBlur={(e) => void handleNotifyAtBlur(e.target.value)}
          />
        </div>
      </div>
    </div>
  );
};
