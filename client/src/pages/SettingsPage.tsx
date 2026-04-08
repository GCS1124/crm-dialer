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
    <div className="flex items-center justify-between rounded-[8px] border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
      <span className="text-[12px] text-slate-700 dark:text-slate-200">{label}</span>
      <span className={value ? "text-emerald-600 dark:text-emerald-300" : "text-rose-600 dark:text-rose-300"}>
        {value ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
      </span>
    </div>
  );
}

export function SettingsPage() {
  const { theme, setTheme, settingsStatus } = useAppState();
  const missingTwilioFields = Object.entries(settingsStatus.twilio.configuredFields)
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
        <Card className="space-y-4">
          <div className="flex items-center justify-between rounded-[8px] border border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-800 dark:bg-slate-900">
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

          <div className="rounded-[8px] border border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-800 dark:bg-slate-900">
            <p className="font-medium text-slate-900 dark:text-white">Auth mode</p>
            <p className="mt-1 text-[12px] text-slate-600 dark:text-slate-300">
              {settingsStatus.authMode === "supabase"
                ? "Supabase Auth with backend-issued workspace JWT"
                : settingsStatus.authMode}
            </p>
          </div>

          <div className="rounded-[8px] border border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-800 dark:bg-slate-900">
            <p className="font-medium text-slate-900 dark:text-white">Signup</p>
            <p className="mt-1 text-[12px] text-slate-600 dark:text-slate-300">
              {settingsStatus.signupEnabled
                ? "Public agent signup is enabled."
                : "Signup is disabled."}
            </p>
          </div>

          <div className="rounded-[8px] border border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-800 dark:bg-slate-900">
            <p className="font-medium text-slate-900 dark:text-white">Bulk import</p>
            <p className="mt-1 text-[12px] text-slate-600 dark:text-slate-300">
              Supported formats: {settingsStatus.importFormats.join(", ")}
            </p>
          </div>
        </Card>

        <div className="space-y-5">
          <Card className="space-y-3">
            <div>
              <h3 className="text-[18px] font-semibold text-slate-900 dark:text-white">Twilio status</h3>
              <p className="mt-1 text-[12px] text-slate-500 dark:text-slate-400">
                Browser calling goes live when the voice app, API keys, and caller ID are ready.
              </p>
            </div>
            <StatusRow label="Account SID" value={settingsStatus.twilio.configuredFields.accountSid} />
            <StatusRow label="API key" value={settingsStatus.twilio.configuredFields.apiKey} />
            <StatusRow label="API secret" value={settingsStatus.twilio.configuredFields.apiSecret} />
            <StatusRow label="TwiML App SID" value={settingsStatus.twilio.configuredFields.appSid} />
            <StatusRow label="Outbound caller ID" value={settingsStatus.twilio.configuredFields.callerId} />
            <div className="rounded-[8px] border border-slate-200 px-4 py-3 text-sm dark:border-slate-800">
              {settingsStatus.twilio.available
                ? `Twilio is live. Caller ID: ${settingsStatus.twilio.callerId}`
                : "Twilio is not fully configured yet. The dialer stays in manual call logging mode until every required field is set."}
            </div>
            {!settingsStatus.twilio.available ? (
              <div className="rounded-[8px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                Missing fields: {missingTwilioFields.join(", ")}
                <div className="mt-2 font-mono text-xs text-slate-500 dark:text-slate-400">
                  Voice webhook: /api/dialer/voice/outbound
                </div>
              </div>
            ) : null}
          </Card>

          <Card className="space-y-3">
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
          </Card>
        </div>
      </div>
    </div>
  );
}
