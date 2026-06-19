export interface NotificationPreferences {
  user_id: string;
  push_enabled: boolean;
  email_enabled: boolean;
  email_address: string | null;
  threshold_days: number;
  notify_at: string;
}

export type UpdatePrefs = Partial<Omit<NotificationPreferences, "user_id">>;
