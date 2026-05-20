import { useEffect, useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";

import { Button } from "../components/shared/Button";
import { Card } from "../components/shared/Card";
import { PageHeader } from "../components/shared/PageHeader";
import { PasswordResetPanel } from "../components/auth/PasswordResetPanel";
import {
  formatRingCentralPhoneNumber,
  isRingCentralOutboundNumber,
} from "../lib/ringcentral";
import { useAppState } from "../hooks/useAppState";

export function SettingsPage() {
  const {
    ringCentralStatus,
    connectRingCentral,
    disconnectRingCentral,
    setRingCentralRingOutNumber,
    refreshRingCentralStatus,
  } = useAppState();
  const [ringCentralActionMessage, setRingCentralActionMessage] = useState<string | null>(null);
  const [selectedRingOutNumber, setSelectedRingOutNumber] = useState(
    ringCentralStatus.selectedRingOutNumber ?? "",
  );

  useEffect(() => {
    setSelectedRingOutNumber(ringCentralStatus.selectedRingOutNumber ?? "");
  }, [ringCentralStatus.selectedRingOutNumber]);

  const selectableNumbers = useMemo(
    () => ringCentralStatus.availableRingOutNumbers.filter(isRingCentralOutboundNumber),
    [ringCentralStatus.availableRingOutNumbers],
  );

  const options = selectableNumbers;
  const canSaveRingOutNumber =
    ringCentralStatus.connected &&
    selectedRingOutNumber !== (ringCentralStatus.selectedRingOutNumber ?? "");

  const handleSaveRingOutNumber = async () => {
    try {
      setRingCentralActionMessage(null);
      await setRingCentralRingOutNumber(selectedRingOutNumber || null);
    } catch (error) {
      setRingCentralActionMessage(
        error instanceof Error ? error.message : "Unable to save that caller ID number.",
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
      />

      <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <Card className="space-y-4 p-5">
          <PasswordResetPanel mode="settings" />
        </Card>

        <Card className="space-y-4 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-[18px] font-semibold text-slate-900 dark:text-white">
                RingCentral connection
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => refreshRingCentralStatus({ force: true })}>
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
                Selected caller ID
              </p>
              <p className="mt-1 text-sm font-medium text-slate-900 dark:text-white">
                {ringCentralStatus.selectedRingOutNumber
                  ? formatRingCentralPhoneNumber(ringCentralStatus.selectedRingOutNumber)
                  : "RingCentral default"}
              </p>
            </div>
          </div>

          <div className="crm-subtle-card space-y-3 px-4 py-4">
            <div>
              <p className="text-sm font-medium text-slate-900 dark:text-white">
                Outbound caller ID
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <label className="block">
                <span className="sr-only">RingCentral caller ID number</span>
                <select
                  className="h-10 w-full rounded-[12px] border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-[#1f7db3] dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  value={selectedRingOutNumber}
                  onChange={(event) => setSelectedRingOutNumber(event.target.value)}
                  disabled={!ringCentralStatus.connected}
                >
                  <option value="">Use RingCentral default caller ID</option>
                  {options.map((number) => (
                    <option key={number.phoneNumber} value={number.phoneNumber}>
                      {number.label ?? formatRingCentralPhoneNumber(number.phoneNumber)}
                    </option>
                  ))}
                </select>
              </label>

              <Button
                variant="secondary"
                onClick={handleSaveRingOutNumber}
                disabled={!canSaveRingOutNumber}
              >
                Save caller ID
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
                  {options.length} caller ID number{options.length === 1 ? "" : "s"} available
                </div>
              </div>
            ) : null}
          </div>
        </Card>
      </div>
    </div>
  );
}
