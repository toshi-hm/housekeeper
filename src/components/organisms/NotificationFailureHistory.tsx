import { AlertCircle, Loader2, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import type { Database } from "@/lib/supabase";

type NotificationFailure = Pick<
  Database["public"]["Tables"]["notification_failures"]["Row"],
  "id" | "notification_type" | "channel" | "failure_code" | "failed_at"
>;

interface NotificationFailureHistoryProps {
  failures: NotificationFailure[];
  isLoading?: boolean;
  hasError?: boolean;
  onRetry?: () => void;
}

export const NotificationFailureHistory = ({
  failures,
  isLoading = false,
  hasError = false,
  onRetry,
}: NotificationFailureHistoryProps) => {
  const { t, i18n } = useTranslation("notifications");

  return (
    <section
      className="rounded-lg border p-4 space-y-3"
      aria-labelledby="notification-failures-title"
    >
      <div className="flex items-center gap-2">
        <AlertCircle className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <h3 id="notification-failures-title" className="font-medium">
          {t("failureHistory.title")}
        </h3>
      </div>
      {isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          {t("failureHistory.loading")}
        </p>
      ) : hasError ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-destructive" role="alert">
            {t("failureHistory.loadError")}
          </p>
          {onRetry && (
            <Button variant="outline" size="sm" onClick={onRetry}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              {t("failureHistory.retry")}
            </Button>
          )}
        </div>
      ) : failures.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("failureHistory.empty")}</p>
      ) : (
        <ul className="divide-y">
          {failures.map((failure) => (
            <li
              key={failure.id}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3 first:pt-0 last:pb-0"
            >
              <span className="text-sm">
                {t(`failureHistory.types.${failure.notification_type}`)} ·{" "}
                {t(`failureHistory.channels.${failure.channel}`)}
                <span className="block text-xs text-muted-foreground">
                  {t(`failureHistory.codes.${failure.failure_code}`)}
                </span>
              </span>
              <time className="text-xs text-muted-foreground" dateTime={failure.failed_at}>
                {new Intl.DateTimeFormat(i18n.language, {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(failure.failed_at))}
              </time>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">{t("failureHistory.privacy")}</p>
    </section>
  );
};
