import { Radio, Shield, UserRound } from "lucide-react";

import { useAppState } from "../../hooks/useAppState";
import type { SipProfile } from "../../types";
import { Button } from "../shared/Button";
import { Card } from "../shared/Card";
import { SipProfileForm } from "./SipProfileForm";

function SipProfileRow({
  profile,
  onActivate,
  busy,
}: {
  profile: SipProfile;
  onActivate: (profileId: string) => Promise<void>;
  busy: boolean;
}) {
  return (
    <div className="crm-subtle-card flex items-center justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-slate-900">{profile.label}</p>
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
            {profile.isShared ? <Shield size={12} /> : <UserRound size={12} />}
            {profile.isShared ? "Shared" : "Personal"}
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          {profile.sipUsername}@{profile.sipDomain}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Caller ID {profile.callerId} · Password {profile.passwordPreview ?? "configured"}
        </p>
      </div>
      <Button
        variant={profile.isActive ? "secondary" : "primary"}
        disabled={busy || profile.isActive}
        onClick={() => void onActivate(profile.id)}
      >
        {profile.isActive ? "Active" : "Use profile"}
      </Button>
    </div>
  );
}

export function SipProfileSelectorDialog() {
  const {
    currentUser,
    sipProfiles,
    activateSipProfile,
    createSipProfile,
    workspaceLoading,
  } = useAppState();

  if (!currentUser) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/35 px-4 py-8 backdrop-blur-sm">
      <Card className="w-full max-w-[980px] space-y-5 rounded-[24px] p-6 shadow-[0_32px_80px_rgba(15,23,42,0.25)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700">
              <Radio size={13} />
              CRM softphone setup
            </div>
            <h2 className="mt-3 text-[28px] font-semibold tracking-[-0.03em] text-slate-950">
              Select a SIP profile before placing calls
            </h2>
            <p className="mt-2 max-w-[640px] text-sm text-slate-600">
              Choose one of the configured softphone identities or add a new one for this user. The selected profile becomes the active browser calling credential for this CRM session.
            </p>
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">Available profiles</h3>
              <span className="text-xs text-slate-500">{sipProfiles.length} saved</span>
            </div>

            {sipProfiles.length ? (
              <div className="space-y-3">
                {sipProfiles.map((profile) => (
                  <SipProfileRow
                    key={profile.id}
                    profile={profile}
                    onActivate={activateSipProfile}
                    busy={workspaceLoading}
                  />
                ))}
              </div>
            ) : (
              <div className="crm-subtle-card px-4 py-4 text-sm text-slate-600">
                No SIP profiles are available yet. Add the first one on the right.
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Add a new profile</h3>
              <p className="mt-1 text-xs text-slate-500">
                New profiles can be activated immediately after saving.
              </p>
            </div>

            <div className="crm-subtle-card p-4">
              <SipProfileForm
                onSubmit={(input) => createSipProfile(input, { activate: true }).then(() => undefined)}
                submitLabel="Save and use"
                allowShared={currentUser.role !== "agent"}
                initialShared={currentUser.role !== "agent"}
              />
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
