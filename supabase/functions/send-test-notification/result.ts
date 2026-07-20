/**
 * Summarizes the outcome of sending a test push notification to one or more
 * subscriptions (a user may have several devices registered). Extracted as a
 * pure function so the success/failure aggregation can be unit tested
 * without needing to mock Supabase or web-push network calls.
 */
export interface TestNotificationSummary {
  sent: number;
  failed: number;
  /** true when every subscription failed — the caller should treat this as an error response. */
  allFailed: boolean;
}

export const summarizeResults = (
  results: readonly PromiseSettledResult<void>[],
): TestNotificationSummary => {
  const sent = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.length - sent;
  return { sent, failed, allFailed: results.length > 0 && sent === 0 };
};
