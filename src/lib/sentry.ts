import * as Sentry from "@sentry/react";

/**
 * Optional, opt-in client-side error monitoring via Sentry.
 *
 * This app is self-hosted and single-user, so it must never "phone home"
 * unless the user explicitly opts in by setting `VITE_SENTRY_DSN`. When the
 * DSN is unset, every export here is a no-op.
 *
 * PII scrubbing: only error messages, stack traces, and minimal protocol
 * metadata are sent. The allowlist below reconstructs events so integrations
 * cannot accidentally add inventory data through another event field.
 */

const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;

export const isSentryEnabled = Boolean(dsn);

const sanitizeFilename = (filename: string | undefined): string | undefined =>
  filename?.replace(/[?#].*$/, "");

export const sanitizeSentryEvent = (event: Sentry.ErrorEvent): Sentry.ErrorEvent => {
  const sanitized = {} as Sentry.ErrorEvent;

  if (event.event_id !== undefined) sanitized.event_id = event.event_id;
  if (event.timestamp !== undefined) sanitized.timestamp = event.timestamp;
  if (event.platform !== undefined) sanitized.platform = event.platform;
  if (event.level !== undefined) sanitized.level = event.level;
  if (event.message !== undefined) sanitized.message = event.message;

  const values = event.exception?.values;
  if (values) {
    sanitized.exception = {
      values: values.map((exception) => ({
        ...(exception.type !== undefined ? { type: exception.type } : {}),
        ...(exception.value !== undefined ? { value: exception.value } : {}),
        ...(exception.stacktrace
          ? {
              stacktrace: {
                frames: exception.stacktrace.frames?.map((frame) => ({
                  ...(sanitizeFilename(frame.filename) !== undefined
                    ? { filename: sanitizeFilename(frame.filename) }
                    : {}),
                  ...(frame.function !== undefined ? { function: frame.function } : {}),
                  ...(frame.module !== undefined ? { module: frame.module } : {}),
                  ...(frame.lineno !== undefined ? { lineno: frame.lineno } : {}),
                  ...(frame.colno !== undefined ? { colno: frame.colno } : {}),
                  ...(frame.in_app !== undefined ? { in_app: frame.in_app } : {}),
                })),
              },
            }
          : {}),
      })),
    };
  }

  return sanitized;
};

export const initSentry = (): void => {
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    // No performance tracing / session replay — keep footprint minimal and
    // avoid capturing anything beyond errors for this single-user app.
    tracesSampleRate: 0,
    sendDefaultPii: false,
    maxBreadcrumbs: 0,
    beforeBreadcrumb: () => null,
    beforeSend: sanitizeSentryEvent,
  });
};

export const reportError = (error: Error): void => {
  if (!dsn || !(error instanceof Error)) return;
  Sentry.captureException(error);
};
