import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";

export interface NotificationPreferences {
  user_id: string;
  push_enabled: boolean;
  email_enabled: boolean;
  email_address: string | null;
  threshold_days: number;
  notify_at: string;
}

type UpdatePrefs = Partial<Omit<NotificationPreferences, "user_id">>;

const PREFS_KEY = ["notification-preferences"] as const;

const fetchPreferences = async (): Promise<NotificationPreferences | null> => {
  const { data, error } = await supabase.from("notification_preferences").select("*").maybeSingle();
  if (error) throw error;
  return data as NotificationPreferences | null;
};

const upsertPreferences = async (update: UpdatePrefs): Promise<NotificationPreferences> => {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("notification_preferences")
    .upsert({ ...update, user_id: userData.user.id, updated_at: new Date().toISOString() })
    .select()
    .single();
  if (error) throw error;
  return data as NotificationPreferences;
};

const urlBase64ToUint8Array = (base64String: string): Uint8Array => {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
};

export const subscribePush = async (): Promise<void> => {
  const registration = await navigator.serviceWorker.ready;
  const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string;
  if (!vapidKey) throw new Error("VITE_VAPID_PUBLIC_KEY is not set");

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidKey).buffer as ArrayBuffer,
  });

  const json = subscription.toJSON();
  await supabase.functions.invoke("subscribe-push", {
    body: {
      endpoint: json.endpoint,
      keys: { p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" },
    },
  });
};

export const unsubscribePush = async (): Promise<void> => {
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  await supabase.functions.invoke("subscribe-push", {
    body: { action: "unsubscribe", endpoint: subscription.endpoint },
  });
  await subscription.unsubscribe();
};

export const useNotificationPreferences = () =>
  useQuery({
    queryKey: PREFS_KEY,
    queryFn: fetchPreferences,
    staleTime: 5 * 60_000,
  });

export const useUpdateNotificationPreferences = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: upsertPreferences,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: PREFS_KEY });
    },
  });
};
