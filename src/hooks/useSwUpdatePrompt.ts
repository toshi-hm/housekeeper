import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import { onSwUpdateAvailable } from "@/lib/pwa";
import { useToast } from "@/lib/toast-context";

// #785: The default action-toast duration (8s, src/lib/toast.tsx) is too
// short for an update notice the user might not act on right away — missing
// it just means they keep running the current version a little longer
// (harmless; the update is only ever applied once they click "reload", see
// src/lib/pwa.ts / swLifecycle.ts), but it's still worth giving them a much
// longer window to notice it than a routine action toast. ~24.8 days is the
// practical ceiling for a single `setTimeout` delay (browsers coerce longer
// values to fire almost immediately due to the underlying 32-bit signed int),
// so this is effectively "stays until dismissed" for any real session.
const UPDATE_TOAST_DURATION_MS = 2_147_483_647;

/**
 * #785: By default a newly-installed service worker doesn't take over until
 * every open tab closes. `src/lib/swLifecycle.ts` (used by `src/sw.ts`)
 * makes the new worker activate on request instead, and `src/lib/pwa.ts`
 * requests that (and then reloads) only once the user accepts here — a
 * silent/forced reload could interrupt the user mid-task (e.g.
 * mid-form-entry), so instead this surfaces the app's existing toast with a
 * "reload" action button and lets the user choose when to refresh.
 *
 * Mounted once at the app root (`__root.tsx`) so it's active regardless of
 * auth state.
 */
export const useSwUpdatePrompt = (): void => {
  const { toast, dismiss } = useToast();
  const { t } = useTranslation("common");
  // If a newer update supersedes one the user hasn't acted on yet, replace
  // the stale toast instead of stacking a second one — its `applyUpdate`
  // would otherwise become a silent no-op (posting to a now-redundant
  // worker) while lingering on screen with no indication it stopped working.
  const currentToastId = useRef<string | null>(null);

  useEffect(
    () =>
      onSwUpdateAvailable((applyUpdate) => {
        if (currentToastId.current) dismiss(currentToastId.current);
        currentToastId.current = toast(t("pwaUpdateAvailable"), "default", {
          durationMs: UPDATE_TOAST_DURATION_MS,
          action: {
            label: t("pwaUpdateReload"),
            onClick: applyUpdate,
          },
        });
      }),
    [toast, dismiss, t],
  );
};
