import { type QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { persister } from "@/lib/queryClient";
import { requireOnline } from "@/lib/requireOnline";
import { supabase } from "@/lib/supabase";
import { SUPABASE_REST_CACHE_NAME } from "@/lib/swCacheNames";
import type { Database } from "@/types/supabase";

const HOUSEHOLD_KEY = ["household"] as const;
const INVITE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const INVITE_TTL_MS = 24 * 60 * 60 * 1000;

type Household = Database["public"]["Tables"]["households"]["Row"];
type HouseholdMember = Database["public"]["Tables"]["household_members"]["Row"];
type HouseholdInviteRow = Database["public"]["Tables"]["household_invites"]["Row"];

interface HouseholdInvite extends HouseholdInviteRow {
  isExpired: boolean;
}

export interface HouseholdDetails {
  household: Household;
  members: HouseholdMember[];
  invites: HouseholdInvite[];
  currentUserId: string;
}

const CURRENT_HOUSEHOLD_ID_KEY = ["household", "current-id"] as const;

export class HouseholdInviteError extends Error {
  readonly code: "HK006" | "HK007" | "HK008" | "HK009";

  constructor(code: "HK006" | "HK007" | "HK008" | "HK009") {
    super(code);
    this.name = "HouseholdInviteError";
    this.code = code;
  }
}

export type HouseholdManagementErrorCode = "HK010" | "HK011" | "HK012" | "HK013";

const isHouseholdManagementErrorCode = (code: unknown): code is HouseholdManagementErrorCode =>
  code === "HK010" || code === "HK011" || code === "HK012" || code === "HK013";

/** Owner-only management RPCs (rename / remove member) failed with a known reason. */
export class HouseholdManagementError extends Error {
  readonly code: HouseholdManagementErrorCode;

  constructor(code: HouseholdManagementErrorCode) {
    super(code);
    this.name = "HouseholdManagementError";
    this.code = code;
  }
}

const throwManagementError = (error: { code?: string }): never => {
  if (isHouseholdManagementErrorCode(error.code)) throw new HouseholdManagementError(error.code);
  throw error;
};

const fetchHousehold = async (): Promise<HouseholdDetails> => {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) throw new Error("Not authenticated");

  const { data: membership, error: membershipError } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (membershipError) throw membershipError;
  if (!membership) throw new Error("Household membership is missing");

  const [householdResult, membersResult, invitesResult] = await Promise.all([
    supabase.from("households").select("*").eq("id", membership.household_id).single(),
    supabase
      .from("household_members")
      .select("*")
      .eq("household_id", membership.household_id)
      .order("joined_at", { ascending: true }),
    supabase
      .from("household_invites")
      .select("*")
      .eq("household_id", membership.household_id)
      .order("created_at", { ascending: false }),
  ]);

  if (householdResult.error) throw householdResult.error;
  if (membersResult.error) throw membersResult.error;
  if (invitesResult.error) throw invitesResult.error;

  return {
    household: householdResult.data,
    members: membersResult.data ?? [],
    invites: (invitesResult.data ?? []).map((invite) => ({
      ...invite,
      isExpired: Date.parse(invite.expires_at) <= Date.now(),
    })),
    currentUserId: user.id,
  };
};

export const fetchCurrentHouseholdId = async (): Promise<string> => {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Household membership is missing");
  return data.household_id;
};

const createInviteCode = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (byte) => INVITE_CODE_ALPHABET[byte % INVITE_CODE_ALPHABET.length]).join(
    "",
  );
};

const createHouseholdInvite = async (householdId: string, userId: string) => {
  requireOnline();
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data, error } = await supabase
      .from("household_invites")
      .insert({
        household_id: householdId,
        created_by: userId,
        code: createInviteCode(),
        expires_at: expiresAt,
      })
      .select()
      .single();
    if (!error) return data;
    if (error.code !== "23505" || attempt === 2) throw error;
  }

  throw new Error("Unable to create invite code");
};

interface RedeemHouseholdInviteInput {
  code: string;
  /** User explicitly acknowledged that personal data of the former household becomes inaccessible. */
  confirmPersonalDataInaccessible: boolean;
}

const redeemHouseholdInvite = async ({
  code,
  confirmPersonalDataInaccessible,
}: RedeemHouseholdInviteInput): Promise<string> => {
  requireOnline();
  if (!confirmPersonalDataInaccessible) throw new HouseholdInviteError("HK006");
  const normalizedCode = code.trim().toUpperCase();
  if (!/^[A-Z0-9]{6,32}$/.test(normalizedCode)) throw new HouseholdInviteError("HK006");

  const { data, error } = await supabase.rpc("redeem_household_invite", {
    p_code: normalizedCode,
    p_confirm_personal_data_inaccessible: confirmPersonalDataInaccessible,
  });
  if (error) throw error;

  const result = data?.[0];
  if (!result || result.error_code) {
    const errorCode = result?.error_code;
    throw new HouseholdInviteError(
      errorCode === "HK007" || errorCode === "HK008" || errorCode === "HK009" ? errorCode : "HK006",
    );
  }
  return result.household_id;
};

export const useHousehold = () =>
  useQuery({
    queryKey: HOUSEHOLD_KEY,
    queryFn: fetchHousehold,
    staleTime: 30_000,
  });

export const useCurrentHouseholdId = () =>
  useQuery({
    queryKey: CURRENT_HOUSEHOLD_ID_KEY,
    queryFn: fetchCurrentHouseholdId,
    staleTime: 30_000,
  });

export const useCreateHouseholdInvite = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const current = queryClient.getQueryData<HouseholdDetails>(HOUSEHOLD_KEY);
      if (!current) throw new Error("Household is not loaded");
      return createHouseholdInvite(current.household.id, current.currentUserId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: HOUSEHOLD_KEY });
    },
  });
};

/**
 * Membership changed, so cached rows from the former household must not remain
 * visible while queries refresh under the new RLS scope. The Service Worker's
 * NetworkFirst REST cache is keyed by URL only and shared-data queries no longer
 * filter by user_id, so it must be dropped as well (same hazard as sign-out, #1057).
 */
export const resetCachesAfterHouseholdChange = async (queryClient: QueryClient) => {
  queryClient.clear();
  await persister.removeClient();
  if (typeof caches !== "undefined") {
    await caches.delete(SUPABASE_REST_CACHE_NAME);
  }
};

export const useRedeemHouseholdInvite = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: redeemHouseholdInvite,
    onSuccess: () => resetCachesAfterHouseholdChange(queryClient),
  });
};

const renameHousehold = async (name: string): Promise<void> => {
  requireOnline();
  const { error } = await supabase.rpc("rename_household", { p_name: name });
  if (error) throwManagementError(error);
};

const removeHouseholdMember = async (userId: string): Promise<void> => {
  requireOnline();
  const { error } = await supabase.rpc("remove_household_member", { p_user_id: userId });
  if (error) throwManagementError(error);
};

export const useRenameHousehold = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: renameHousehold,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: HOUSEHOLD_KEY });
    },
  });
};

export const useRemoveHouseholdMember = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: removeHouseholdMember,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: HOUSEHOLD_KEY });
    },
  });
};
