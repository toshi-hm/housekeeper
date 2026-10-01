import { unsubscribePushOnSignOut } from "@/hooks/useNotificationPreferences";
import { supabase } from "@/lib/supabase";

/**
 * #1134: ユーザー操作によるサインアウト。`SIGNED_OUT` 発火時点ではセッションが
 * 破棄済みで subscribe-push が401になるため、Push購読の解除はセッションが有効な
 * signOut() の「前」に行う。
 */
export const signOutUser = async (
  unsubscribePush: () => Promise<void> = unsubscribePushOnSignOut,
): Promise<void> => {
  await unsubscribePush();
  await supabase.auth.signOut();
};
