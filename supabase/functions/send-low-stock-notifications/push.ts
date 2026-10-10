export interface StoredPushSubscription {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** web-push が要求する `{ endpoint, keys: { p256dh, auth } }` 形式へ変換する (#1205)。 */
export const toWebPushSubscription = (sub: StoredPushSubscription) => ({
  endpoint: sub.endpoint,
  keys: { p256dh: sub.p256dh, auth: sub.auth },
});
