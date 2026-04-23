import { CheckCircle2, XCircle } from "lucide-react";

import { Button } from "../components/shared/Button";
import { Card } from "../components/shared/Card";
import { PageHeader } from "../components/shared/PageHeader";
import { useAppState } from "../hooks/useAppState";

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
  const { theme, setTheme, settingsStatus } = useAppState();
  const missingVoiceFields = Object.entries(settingsStatus.voice.configuredFields)
    .filter(([, configured]) => !configured)
    .map(([field]) => field);

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
              {settingsStatus.authMode === "supabase"
                ? "Supabase Auth with backend-issued workspace JWT"
                : "Local development auth with backend-issued JWT sessions"}
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
              <h3 className="text-[18px] font-semibold text-slate-900 dark:text-white">CRM softphone status</h3>
              <p className="mt-1 text-[12px] text-slate-500 dark:text-slate-400">
                The inbuilt CRM softphone goes live when the SIP WebSocket, domain, credentials, and caller ID are ready.
              </p>
            </div>
            <StatusRow label="WebSocket URL" value={settingsStatus.voice.configuredFields.websocketUrl} />
            <StatusRow label="SIP domain" value={settingsStatus.voice.configuredFields.sipDomain} />
            <StatusRow label="SIP username" value={settingsStatus.voice.configuredFields.sipUsername} />
            <StatusRow label="SIP password" value={settingsStatus.voice.configuredFields.sipPassword} />
            <StatusRow label="Outbound caller ID" value={settingsStatus.voice.configuredFields.callerId} />
            <div className="crm-subtle-card px-4 py-3 text-sm">
              {settingsStatus.voice.available
                ? `CRM softphone is live. Caller ID: ${settingsStatus.voice.callerId}`
                : "The CRM softphone is not fully configured yet. The dialer stays in manual call logging mode until every required field is set."}
            </div>
            {!settingsStatus.voice.available ? (
              <div className="crm-subtle-card px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                Missing fields: {missingVoiceFields.join(", ")}
                <div className="mt-2 font-mono text-xs text-slate-500 dark:text-slate-400">
                  Legacy Unified Voice env names are still accepted.
                </div>
              </div>
            ) : null}
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
