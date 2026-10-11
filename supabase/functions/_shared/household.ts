type MembershipResult = {
  data: { household_id: string } | null;
  error: unknown | null;
};
type MembershipReader = (userId: string) => PromiseLike<MembershipResult>;

/**
 * Resolve the household a user currently belongs to (1 user = 1 household).
 *
 * The cron Edge Functions run with the service_role key, which bypasses RLS, so
 * they must scope shared data (items, consumption logs, ...) by household
 * themselves instead of by `user_id` (the creator) — otherwise items registered
 * by other members are never notified, and a removed member keeps receiving the
 * names of items they created (#1210).
 *
 * Returns null when the lookup fails or the user has no membership; callers
 * should skip that user for this run rather than falling back to `user_id`.
 */
export const resolveHouseholdId = async (
  read: MembershipReader,
  userId: string,
): Promise<string | null> => {
  try {
    const { data, error } = await read(userId);
    if (error) {
      console.error("Failed to resolve household for user", userId);
      return null;
    }
    return data?.household_id ?? null;
  } catch {
    console.error("Failed to resolve household for user", userId);
    return null;
  }
};
