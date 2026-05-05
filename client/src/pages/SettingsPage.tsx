import { CheckCircle2, XCircle } from "lucide-react";

import { SipProfileForm } from "../components/softphone/SipProfileForm";
import { Button } from "../components/shared/Button";
import { Card } from "../components/shared/Card";
import { PageHeader } from "../components/shared/PageHeader";
import { useAppState } from "../hooks/useAppState";

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function isPlaceholder(value: string, placeholders: string[]) {
  const normalized = normalize(value);
  return !normalized || placeholders.includes(normalized) || normalized.startsWith("replace-with-");
}

function isWebsocketUrl(value: string) {
  const trimmed = value.trim();
  return /^(wss?:)\/\//i.test(trimmed) && !isPlaceholder(trimmed, ["wss://sip.example.com"]);
}

function isSipDomain(value: string) {
  const trimmed = value.trim();
  return Boolean(trimmed) && !isPlaceholder(trimmed, ["sip.example.com"]) && !trimmed.includes(" ");
}

function isSipUsername(value: string) {
  const trimmed = value.trim();
  return Boolean(trimmed) && !isPlaceholder(trimmed, ["agent1001", "your-sip-username"]);
}

function isCallerId(value: string) {
  const trimmed = value.trim();
  return Boolean(trimmed) && trimmed !== "+10000000000";
}

function StatusRow({
  label,
  value,
}: {
  label: string;
  value: boolean;
}) {
  return (
    <div className="crm-subtle-card flex items-center justify-between px-4 py-3">
      <span className="text-[12px] text-slate-700 dark:text-slate-200">{label}</span>
      <span className={value ? "text-emerald-600 dark:text-emerald-300" : "text-rose-600 dark:text-rose-300"}>
        {value ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
      </span>
    </div>
  );
}

export function SettingsPage() {
  const {
    activeSipProfile,
    activateSipProfile,
    createSipProfile,
    currentUser,
    settingsStatus,
    sipProfiles,
    theme,
    setTheme,
    voiceConfig,
  } = useAppState();
  const voiceFieldStatus = activeSipProfile
    ? {
        websocketUrl: isWebsocketUrl(activeSipProfile.providerUrl),
        sipDomain: isSipDomain(activeSipProfile.sipDomain),
        sipUsername: isSipUsername(activeSipProfile.sipUsername),
        sipPassword: Boolean(activeSipProfile.passwordPreview),
        callerId: isCallerId(activeSipProfile.callerId),
      }
    : voiceConfig.source === "profile" && voiceConfig.available
      ? {
          websocketUrl: Boolean(voiceConfig.websocketUrl),
          sipDomain: Boolean(voiceConfig.sipDomain),
          sipUsername: Boolean(voiceConfig.username),
          sipPassword: true,
          callerId: Boolean(voiceConfig.callerId),
        }
    : settingsStatus.voice.configuredFields;
  const missingVoiceFields = Object.entries(voiceFieldStatus)
    .filter(([, configured]) => !configured)
    .map(([field]) => field);
  const voiceReady = Object.values(voiceFieldStatus).every(Boolean);
  const showMissingVoiceFields = !voiceReady && (activeSipProfile ? true : sipProfiles.length === 0);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Settings"
        title="Workspace configuration"
        description="Auth, imports, Supabase, and browser calling status."
      />

      <div className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
        <Card className="space-y-4 p-5">
          <div className="crm-subtle-card flex items-center justify-between px-4 py-4">
            <div>
              <p className="font-medium text-slate-900 dark:text-white">Theme</p>
              <p className="text-[12px] text-slate-500 dark:text-slate-400">
                Keep the workspace in light or dark mode.
              </p>
            </div>
            <Button
              variant="secondary"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? "Use light" : "Use dark"}
            </Button>
          </div>

          <div className="crm-subtle-card px-4 py-4">
            <p className="font-medium text-slate-900 dark:text-white">Auth mode</p>
            <p className="mt-1 text-[12px] text-slate-600 dark:text-slate-300">
              Supabase Auth with backend-issued workspace JWT.
            </p>
          </div>

          <div className="crm-subtle-card px-4 py-4">
            <p className="font-medium text-slate-900 dark:text-white">Signup</p>
            <p className="mt-1 text-[12px] text-slate-600 dark:text-slate-300">
              {settingsStatus.signupEnabled
                ? "Public agent signup is enabled."
                : "Signup is disabled."}
            </p>
          </div>

          <div className="crm-subtle-card px-4 py-4">
            <p className="font-medium text-slate-900 dark:text-white">Bulk import</p>
            <p className="mt-1 text-[12px] text-slate-600 dark:text-slate-300">
              Supported formats: {settingsStatus.importFormats.join(", ")}
            </p>
          </div>
        </Card>

        <div className="space-y-5">
          <Card className="space-y-3 p-5">
            <div>
              <h3 className="text-[18px] font-semibold text-slate-900 dark:text-white">CRM softphone</h3>
              <p className="mt-1 text-[12px] text-slate-500 dark:text-slate-400">
                The inbuilt CRM softphone uses the active SIP profile selected for this workspace user.
              </p>
            </div>
            <StatusRow label="WebSocket URL" value={voiceFieldStatus.websocketUrl} />
            <StatusRow label="SIP domain" value={voiceFieldStatus.sipDomain} />
            <StatusRow label="SIP username" value={voiceFieldStatus.sipUsername} />
            <StatusRow label="SIP password" value={voiceFieldStatus.sipPassword} />
            <StatusRow label="Outbound caller ID" value={voiceFieldStatus.callerId} />
            <div className="crm-subtle-card px-4 py-3 text-sm">
              {activeSipProfile
                ? `Active profile: ${activeSipProfile.label} · ${activeSipProfile.sipUsername}@${activeSipProfile.sipDomain} · Caller ID ${activeSipProfile.callerId}`
                : settingsStatus.voice.available
                  ? `Environment fallback is available. Caller ID: ${settingsStatus.voice.callerId}`
                  : "No active SIP profile is selected yet. Browser calling stays blocked until you activate one."}
            </div>
            <div className="crm-subtle-card px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
              Active source: {voiceConfig.source}
              {voiceConfig.profileLabel ? ` · ${voiceConfig.profileLabel}` : ""}
            </div>
            {showMissingVoiceFields ? (
              <div className="crm-subtle-card px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                Missing fields: {missingVoiceFields.join(", ")}
                <div className="mt-2 font-mono text-xs text-slate-500 dark:text-slate-400">
                  Legacy Unified Voice env names are still accepted.
                </div>
              </div>
            ) : null}
          </Card>

          <Card className="space-y-4 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-[18px] font-semibold text-slate-900 dark:text-white">Saved SIP profiles</h3>
                <p className="mt-1 text-[12px] text-slate-500 dark:text-slate-400">
                  Select which credential the browser softphone should use for this account.
                </p>
              </div>
              <div className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-medium text-slate-600">
                {sipProfiles.length} profiles
              </div>
            </div>

            <div className="space-y-3">
              {sipProfiles.map((profile) => (
                <div
                  key={profile.id}
                  className="crm-subtle-card flex items-center justify-between gap-4 px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        {profile.label}
                      </p>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                        {profile.isShared ? "Shared" : "Personal"}
                      </span>
                      {profile.isActive ? (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">
                          Active
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {profile.sipUsername}@{profile.sipDomain} · Caller ID {profile.callerId}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Password {profile.passwordPreview ?? "configured"}
                      {profile.ownerUserName ? ` · Owner ${profile.ownerUserName}` : ""}
                    </p>
                  </div>
                  <Button
                    variant={profile.isActive ? "secondary" : "primary"}
                    disabled={profile.isActive}
                    onClick={() => void activateSipProfile(profile.id)}
                  >
                    {profile.isActive ? "Active" : "Use profile"}
                  </Button>
                </div>
              ))}
            </div>
          </Card>

          <Card className="space-y-4 p-5">
            <div>
              <h3 className="text-[18px] font-semibold text-slate-900 dark:text-white">Add SIP profile</h3>
              <p className="mt-1 text-[12px] text-slate-500 dark:text-slate-400">
                Save additional softphone credentials for this user or as a shared workspace profile.
              </p>
            </div>

            <SipProfileForm
              onSubmit={(input) => createSipProfile(input).then(() => undefined)}
              submitLabel="Save profile"
              allowShared={currentUser?.role !== "agent"}
              initialShared={currentUser?.role !== "agent"}
            />
          </Card>

          <Card className="space-y-3 p-5">
            <div>
              <h3 className="text-[18px] font-semibold text-slate-900 dark:text-white">Supabase status</h3>
              <p className="mt-1 text-[12px] text-slate-500 dark:text-slate-400">
                Backend data and authentication health checks.
              </p>
            </div>
            <StatusRow label="Backend connected" value={settingsStatus.supabase.connected} />
            <StatusRow
              label="Publishable key configured"
              value={settingsStatus.supabase.publishableKeyConfigured}
            />
            <StatusRow
              label="Service role configured"
              value={settingsStatus.supabase.serviceRoleConfigured}
            />
            <StatusRow
              label="Realtime available"
              value={settingsStatus.supabase.realtimeAvailable ?? settingsStatus.supabase.connected}
            />
            {settingsStatus.supabase.reason ? (
              <div className="crm-subtle-card px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                {settingsStatus.supabase.reason}
              </div>
            ) : null}
          </Card>
        </div>
      </div>
    </div>
  );
}
