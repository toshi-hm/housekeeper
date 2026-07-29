export interface NotificationPreferences {
  user_id: string;
  push_enabled: boolean;
  email_enabled: boolean;
  email_address: string | null;
  threshold_days: number;
  notify_at: string;
  /** IANAタイムゾーン文字列（例: "Asia/Tokyo"）。notify_at をどのタイムゾーンの
   *  時刻として解釈するかを決める（#660）。 */
  timezone: string;
}

export type UpdatePrefs = Partial<Omit<NotificationPreferences, "user_id">>;
