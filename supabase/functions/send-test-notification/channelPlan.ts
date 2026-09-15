/**
 * Decides which channels a test notification should be attempted on, given
 * the user's notification_preferences row. Extracted as a pure function so
 * it can be unit tested without mocking Supabase or the webpush/Resend
 * network calls (#1063: previously this endpoint only ever attempted push,
 * so an email-only user had no way to verify their settings worked).
 */
export interface NotificationPreferenceRow {
  push_enabled: boolean;
  email_enabled: boolean;
  email_address: string | null;
}

export interface TestChannelPlan {
  sendPush: boolean;
  sendEmail: boolean;
}

export const planTestChannels = (prefs: NotificationPreferenceRow | null): TestChannelPlan => ({
  sendPush: !!prefs?.push_enabled,
  sendEmail: !!prefs?.email_enabled && !!prefs?.email_address,
});
