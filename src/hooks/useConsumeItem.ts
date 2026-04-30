import { useMutation, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { computeConsumption, type Item } from "@/types/item";

interface ConsumeParams {
  item: Item;
  deltaAmount: number;
}

const consumeItem = async ({ item, deltaAmount }: ConsumeParams): Promise<Item> => {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error("Not authenticated");

  const result = computeConsumption(item, deltaAmount);
  if (result.error) throw new Error(result.error);

  const { data, error } = await supabase
    .from("items")
    .update({
      units: result.units_after,
      opened_remaining: result.opened_remaining_after,
      updated_at: new Date().toISOString(),
    })
    .eq("id", item.id)
    .select()
    .single();
  if (error) throw error;

  await supabase.from("consumption_logs").insert({
    user_id: userData.user.id,
    item_id: item.id,
    delta_amount: deltaAmount,
    delta_unit: item.content_unit,
    units_before: item.units,
    units_after: result.units_after,
    opened_remaining_before: item.opened_remaining ?? null,
    opened_remaining_after: result.opened_remaining_after,
  });

  return data as Item;
};

export const useConsumeItem = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: consumeItem,
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ["items"] });
      void qc.setQueryData(["items", data.id], data);
    },
  });
};
