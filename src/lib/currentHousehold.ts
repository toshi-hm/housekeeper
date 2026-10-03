import { supabase } from "@/lib/supabase";

export const getCurrentHouseholdId = async (userId: string): Promise<string> => {
  const { data, error } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", userId)
    .single();

  if (error || !data?.household_id) {
    throw new Error(error?.message ?? "Household membership not found");
  }

  return data.household_id;
};
