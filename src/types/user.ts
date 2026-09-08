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
  /** 週次食品ロスダイジェスト（send-waste-digest、月曜配信）の受信可否（#925）。
   *  配信曜日・時刻のユーザー設定UIはv1では作らず、notify_atを流用する。 */
  waste_digest_enabled: boolean;
}

export type UpdatePrefs = Partial<Omit<NotificationPreferences, "user_id">>;
