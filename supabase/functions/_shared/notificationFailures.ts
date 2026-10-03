export type NotificationType = "expiry" | "waste_digest" | "low_stock";
export type NotificationChannel = "push" | "email";
export type NotificationFailureCode =
  | "push_config_missing"
  | "push_subscriptions_unavailable"
  | "push_no_subscriptions"
  | "push_delivery_failed"
  | "email_config_missing"
  | "email_address_missing"
  | "email_delivery_failed";

export interface NotificationFailureInput {
  user_id: string;
  notification_type: NotificationType;
  channel: NotificationChannel;
  failure_code: NotificationFailureCode;
}

type FailureInsertResult = { error: unknown | null };
type FailureWriter = (failure: NotificationFailureInput) => PromiseLike<FailureInsertResult>;

/** Persist a fixed, non-sensitive failure code without interrupting notification delivery. */
export const recordNotificationFailure = async (
  write: FailureWriter,
  failure: NotificationFailureInput,
): Promise<void> => {
  try {
    const { error } = await write(failure);
    if (error) console.error("Failed to persist notification failure record");
  } catch {
    console.error("Failed to persist notification failure record");
  }
};
