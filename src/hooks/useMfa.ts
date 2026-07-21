import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { MfaFactorSummary } from "@/lib/mfa";
import { requireOnline } from "@/lib/requireOnline";
import { supabase } from "@/lib/supabase";

const MFA_FACTORS_KEY = ["mfa-factors"] as const;

export interface TotpEnrollment {
  factorId: string;
  qrCodeUri: string;
  secret: string;
}

const fetchMfaFactors = async (): Promise<MfaFactorSummary[]> => {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw error;
  return data.totp.map((f) => ({ id: f.id, factorType: f.factor_type, status: f.status }));
};

export const useMfaFactors = () =>
  useQuery({
    queryKey: MFA_FACTORS_KEY,
    queryFn: fetchMfaFactors,
    staleTime: 30_000,
  });

export const useEnrollTotp = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<TotpEnrollment> => {
      requireOnline();
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        issuer: "Housekeeper",
      });
      if (error) throw error;
      return { factorId: data.id, qrCodeUri: data.totp.uri, secret: data.totp.secret };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: MFA_FACTORS_KEY });
    },
  });
};

export const useVerifyTotpEnrollment = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ factorId, code }: { factorId: string; code: string }): Promise<void> => {
      requireOnline();
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId,
      });
      if (challengeError) throw challengeError;
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code,
      });
      if (verifyError) throw verifyError;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: MFA_FACTORS_KEY });
    },
  });
};

export const useUnenrollTotp = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (factorId: string): Promise<void> => {
      requireOnline();
      const { error } = await supabase.auth.mfa.unenroll({ factorId });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: MFA_FACTORS_KEY });
    },
  });
};
