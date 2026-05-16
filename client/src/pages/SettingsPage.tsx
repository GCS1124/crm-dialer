import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, RotateCcw, XCircle } from "lucide-react";

import { Button } from "../components/shared/Button";
import { Card } from "../components/shared/Card";
import { PageHeader } from "../components/shared/PageHeader";
import { formatRingCentralPhoneNumber, isRingCentralOutboundNumber } from "../lib/ringcentral";
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
      <span
        className={value ? "text-emerald-600 dark:text-emerald-300" : "text-rose-600 dark:text-rose-300"}
      >
        {value ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
      </span>
    </div>
  );
}

export function SettingsPage() {
  const {
    settingsStatus,
    theme,
    setTheme,
    ringCentralStatus,
    connectRingCentral,
    disconnectRingCentral,
    setRingCentralCallerId,
    refreshRingCentralStatus,
  } = useAppState();
  const [ringCentralActionMessage, setRingCentralActionMessage] = useState<string | null>(null);
  const [selectedCallerId, setSelectedCallerId] = useState(ringCentralStatus.selectedCallerId ?? "");

  useEffect(() => {
    setSelectedCallerId(ringCentralStatus.selectedCallerId ?? "");
  }, [ringCentralStatus.selectedCallerId]);

  const selectableNumbers = useMemo(
    () => ringCentralStatus.availableCallerIds.filter(isRingCentralOutboundNumber),
    [ringCentralStatus.availableCallerIds],
  );

  const options = selectableNumbers.length ? selectableNumbers : ringCentralStatus.availableCallerIds;
  const canSaveCallerId =
    ringCentralStatus.connected &&
    selectedCallerId !== (ringCentralStatus.selectedCallerId ?? "");

  const handleSaveCallerId = async () => {
    try {
      setRingCentralActionMessage(null);
      await setRingCentralCallerId(selectedCallerId || null);
      await refreshRingCentralStatus();
    } catch (error) {
      setRingCentralActionMessage(
        error instanceof Error ? error.message : "Unable to save that forwarding number.",
      );
    }
  };

  const handleDisconnect = async () => {
    try {
      setRingCentralActionMessage(null);
      await disconnectRingCentral();
    } catch (error) {
      setRingCentralActionMessage(
        error instanceof Error ? error.message : "Unable to disconnect RingCentral.",
      );
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Settings"
        title="Workspace configuration"
        description="Auth, imports, Supabase, and RingCentral caller-ID settings."
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
            <Button variant="secondary" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
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
          <Card className="space-y-4 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-[18px] font-semibold text-slate-900 dark:text-white">
                  RingCentral connection
                </h3>
                <p className="mt-1 text-[12px] text-slate-500 dark:text-slate-400">
                  The CRM places RingOut calls and uses the forwarding number you choose below.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" onClick={refreshRingCentralStatus}>
                  <RotateCcw size={14} />
                  Refresh
                </Button>
                {ringCentralStatus.connected ? (
                  <Button variant="danger" size="sm" onClick={handleDisconnect}>
                    Disconnect
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      setRingCentralActionMessage(null);
                      void connectRingCentral().catch((error) => {
                        setRingCentralActionMessage(
                          error instanceof Error ? error.message : "Unable to start RingCentral connection.",
                        );
                      });
                    }}
                  >
                    Connect RingCentral
                  </Button>
                )}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="crm-subtle-card px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                  Status
                </p>
                <p className="mt-1 text-sm font-medium text-slate-900 dark:text-white">
                  {ringCentralStatus.connected ? "Connected" : "Not connected"}
                </p>
              </div>
              <div className="crm-subtle-card px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                  Selected forwarding number
                </p>
                <p className="mt-1 text-sm font-medium text-slate-900 dark:text-white">
                  {ringCentralStatus.selectedCallerId
                    ? formatRingCentralPhoneNumber(ringCentralStatus.selectedCallerId)
                    : "None selected"}
                </p>
              </div>
            </div>

            <div className="crm-subtle-card space-y-3 px-4 py-4">
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-white">
                  Outbound RingOut forwarding number
                </p>
                <p className="mt-1 text-[12px] text-slate-500 dark:text-slate-400">
                  RingOut uses a forwarding target from your RingCentral account. Any supported
                  number that appears here can be used for outbound dialing. Leave it blank to use
                  RingCentral's default desktop, web, or mobile app target.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <label className="block">
                  <span className="sr-only">RingOut number</span>
                  <select
                    className="h-10 w-full rounded-[12px] border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-[#1f7db3] dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    value={selectedCallerId}
                    onChange={(event) => setSelectedCallerId(event.target.value)}
                    disabled={!ringCentralStatus.connected || options.length === 0}
                  >
                    <option value="">Select a forwarding number</option>
                    {options.map((number) => (
                      <option key={number.phoneNumber} value={number.phoneNumber}>
                        {number.label ?? formatRingCentralPhoneNumber(number.phoneNumber)}
                      </option>
                    ))}
                  </select>
                </label>

                <Button
                  variant="secondary"
                  onClick={handleSaveCallerId}
                  disabled={!canSaveCallerId}
                >
                  Save forwarding number
                </Button>
              </div>

              {ringCentralStatus.message ? (
                <div className="crm-subtle-card px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
                  {ringCentralStatus.message}
                </div>
              ) : null}

              {ringCentralActionMessage ? (
                <div className="crm-subtle-card px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
                  {ringCentralActionMessage}
                </div>
              ) : null}

              {ringCentralStatus.connectedAt ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="crm-subtle-card px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                    Connected at {new Date(ringCentralStatus.connectedAt).toLocaleString()}
                  </div>
                  <div className="crm-subtle-card px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                    {options.length} outbound number{options.length === 1 ? "" : "s"} available
                  </div>
                </div>
              ) : null}
            </div>
          </Card>

          <Card className="space-y-3 p-5">
            <div>
              <h3 className="text-[18px] font-semibold text-slate-900 dark:text-white">
                Supabase status
              </h3>
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
