import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";

const FAILURE_HISTORY_KEY = ["notification-failures"] as const;

const fetchNotificationFailures = async () => {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("notification_failures")
    .select("id, notification_type, channel, failure_code, failed_at")
    .eq("user_id", authData.user.id)
    .order("failed_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return data ?? [];
};

export const useNotificationFailures = () =>
  useQuery({
    queryKey: FAILURE_HISTORY_KEY,
    queryFn: fetchNotificationFailures,
    staleTime: 60_000,
  });
