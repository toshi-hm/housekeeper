import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Check, Copy, Plus, UserMinus, Users } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Spinner } from "@/components/atoms/Spinner";
import { ConfirmDialog } from "@/components/molecules/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  type HouseholdDetails,
  HouseholdInviteError,
  HouseholdManagementError,
  type HouseholdManagementErrorCode,
  useCreateHouseholdInvite,
  useHousehold,
  useRedeemHouseholdInvite,
  useRemoveHouseholdMember,
  useRenameHousehold,
} from "@/hooks/useHousehold";
import { OfflineError } from "@/lib/requireOnline";
import { useToast } from "@/lib/toast-context";

const isOwner = (household: HouseholdDetails): boolean =>
  household.members.some(
    (member) => member.user_id === household.currentUserId && member.role === "owner",
  );

const managementErrorKey = {
  HK010: "householdNotOwner",
  HK011: "householdNameInvalid",
  HK012: "householdCannotRemoveOwner",
  HK013: "householdMemberNotFound",
} as const satisfies Record<HouseholdManagementErrorCode, string>;

export const HouseholdSettingsPage = () => {
  const { t } = useTranslation("settings");
  const { t: tCommon } = useTranslation("common");
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data, isLoading, isError } = useHousehold();
  const createInvite = useCreateHouseholdInvite();
  const redeemInvite = useRedeemHouseholdInvite();
  const renameHousehold = useRenameHousehold();
  const removeMember = useRemoveHouseholdMember();
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState("");
  const [confirmPrivateData, setConfirmPrivateData] = useState(false);

  const handleCreateInvite = async () => {
    try {
      await createInvite.mutateAsync();
      toast(t("householdInviteCreated"), "success");
    } catch {
      toast(tCommon("unknownError"), "error");
    }
  };

  const handleRedeemInvite = async () => {
    try {
      await redeemInvite.mutateAsync({
        code: inviteCode,
        confirmPersonalDataInaccessible: confirmPrivateData,
      });
      setInviteCode("");
      setConfirmPrivateData(false);
      toast(t("householdJoined"), "success");
      await navigate({ to: "/" });
    } catch (error) {
      if (error instanceof HouseholdInviteError) {
        const errorKey =
          error.code === "HK007"
            ? "householdInviteRateLimited"
            : error.code === "HK009"
              ? "householdInviteOwnerCannotLeave"
              : "householdInviteInvalid";
        toast(t(errorKey), "error");
      } else if (error instanceof OfflineError) {
        toast(tCommon("offlineError"), "error");
      } else {
        toast(tCommon("unknownError"), "error");
      }
    }
  };

  const showManagementError = (error: unknown) => {
    if (error instanceof HouseholdManagementError) {
      toast(t(managementErrorKey[error.code]), "error");
    } else if (error instanceof OfflineError) {
      toast(tCommon("offlineError"), "error");
    } else {
      toast(tCommon("unknownError"), "error");
    }
  };

  const handleRename = async () => {
    if (nameDraft === null) return;
    try {
      await renameHousehold.mutateAsync(nameDraft);
      setNameDraft(null);
      toast(t("householdRenamed"), "success");
    } catch (error) {
      showManagementError(error);
    }
  };

  const handleRemoveMember = async () => {
    if (!memberToRemove) return;
    try {
      await removeMember.mutateAsync(memberToRemove);
      toast(t("householdMemberRemoved"), "success");
    } catch (error) {
      showManagementError(error);
    } finally {
      setMemberToRemove(null);
    }
  };

  const handleCopy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast(t("householdInviteCopied"), "success");
    } catch {
      toast(t("householdInviteCopyFailed"), "error");
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("backToSettings")}
          onClick={() => void navigate({ to: "/settings" })}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold">{t("householdTitle")}</h1>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12" aria-label={tCommon("loading")}>
          <Spinner />
        </div>
      ) : isError || !data ? (
        <p role="alert" className="rounded-lg border border-destructive/40 p-4 text-sm">
          {t("householdLoadError")}
        </p>
      ) : (
        <>
          <section className="space-y-4 rounded-lg border p-4">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-muted-foreground" />
              <h2 className="font-semibold">{data.household.name}</h2>
            </div>
            {isOwner(data) && (
              <form
                className="flex flex-wrap items-end gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleRename();
                }}
              >
                <div className="min-w-0 flex-1">
                  <label className="text-sm text-muted-foreground" htmlFor="household-name">
                    {t("householdNameLabel")}
                  </label>
                  <Input
                    id="household-name"
                    value={nameDraft ?? data.household.name}
                    maxLength={50}
                    autoComplete="off"
                    onChange={(event) => setNameDraft(event.target.value)}
                  />
                </div>
                <Button
                  type="submit"
                  disabled={
                    nameDraft === null ||
                    nameDraft.trim().length === 0 ||
                    nameDraft.trim() === data.household.name ||
                    renameHousehold.isPending
                  }
                >
                  {renameHousehold.isPending && <Spinner className="mr-2 h-4 w-4" />}
                  {t("householdRenameButton")}
                </Button>
              </form>
            )}
            <p className="text-sm text-muted-foreground">
              {t("householdMemberCount", { count: data.members.length })}
            </p>
            <ul className="divide-y rounded-md border">
              {data.members.map((member) => (
                <li
                  key={member.user_id}
                  className="flex items-center justify-between gap-3 p-3 text-sm"
                >
                  <span className="break-all font-mono text-xs" title={member.user_id}>
                    {member.user_id === data.currentUserId
                      ? t("householdYou")
                      : `${member.user_id.slice(0, 8)}…`}
                  </span>
                  <span className="flex shrink-0 items-center gap-2 text-muted-foreground">
                    {t(member.role === "owner" ? "householdOwner" : "householdMember")}
                    {isOwner(data) && member.user_id !== data.currentUserId && (
                      <Button
                        variant="outline"
                        size="sm"
                        aria-label={t("householdRemoveMemberAria", {
                          member: `${member.user_id.slice(0, 8)}…`,
                        })}
                        onClick={() => setMemberToRemove(member.user_id)}
                      >
                        <UserMinus className="mr-1 h-4 w-4" />
                        {t("householdRemoveMember")}
                      </Button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-3 rounded-lg border p-4">
            <div>
              <h2 className="font-semibold">{t("householdInvites")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t("householdInviteHelp")}</p>
            </div>
            <Button onClick={() => void handleCreateInvite()} disabled={createInvite.isPending}>
              {createInvite.isPending ? (
                <Spinner className="mr-2 h-4 w-4" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              {t("householdCreateInvite")}
            </Button>
            {data.invites.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("householdNoInvites")}</p>
            ) : (
              <ul className="space-y-2">
                {data.invites.map((invite) => {
                  const inactive = invite.redeemed_at !== null || invite.isExpired;
                  return (
                    <li
                      key={invite.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
                    >
                      <div>
                        <code className="text-lg font-semibold tracking-widest">{invite.code}</code>
                        <p className="text-xs text-muted-foreground">
                          {inactive
                            ? t(
                                invite.redeemed_at
                                  ? "householdInviteUsed"
                                  : "householdInviteExpired",
                              )
                            : t("householdInviteExpires", {
                                date: new Date(invite.expires_at).toLocaleString(),
                              })}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={inactive}
                        onClick={() => void handleCopy(invite.code)}
                      >
                        <Copy className="mr-2 h-4 w-4" />
                        {t("householdCopyInvite")}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="space-y-3 rounded-lg border p-4">
            <div>
              <h2 className="font-semibold">{t("householdJoin")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t("householdJoinHelp")}</p>
            </div>
            <label className="sr-only" htmlFor="household-invite-code">
              {t("householdInviteCode")}
            </label>
            <Input
              id="household-invite-code"
              value={inviteCode}
              maxLength={32}
              autoComplete="off"
              spellCheck={false}
              placeholder={t("householdInviteCode")}
              onChange={(event) => setInviteCode(event.target.value.toUpperCase())}
            />
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1 rounded"
                checked={confirmPrivateData}
                onChange={(event) => setConfirmPrivateData(event.target.checked)}
              />
              <span>{t("householdPrivateDataConfirmation")}</span>
            </label>
            <Button
              onClick={() => void handleRedeemInvite()}
              disabled={
                !confirmPrivateData || inviteCode.trim().length < 6 || redeemInvite.isPending
              }
            >
              {redeemInvite.isPending ? (
                <Spinner className="mr-2 h-4 w-4" />
              ) : (
                <Check className="mr-2 h-4 w-4" />
              )}
              {t("householdJoinButton")}
            </Button>
          </section>
        </>
      )}

      <ConfirmDialog
        open={memberToRemove !== null}
        title={t("householdRemoveConfirmTitle")}
        message={t("householdRemoveConfirmMessage")}
        confirmLabel={t("householdRemoveMember")}
        isConfirming={removeMember.isPending}
        onConfirm={() => void handleRemoveMember()}
        onCancel={() => setMemberToRemove(null)}
      />
    </div>
  );
};
