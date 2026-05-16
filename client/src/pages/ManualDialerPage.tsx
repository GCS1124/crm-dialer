import { ArrowLeft, PhoneCall, PhoneOff, Settings2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { AlertBanner } from "../components/shared/AlertBanner";
import { Badge } from "../components/shared/Badge";
import { Button } from "../components/shared/Button";
import { Card } from "../components/shared/Card";
import { PostCallPanel } from "../components/dialer/PostCallPanel";
import { useAppState } from "../hooks/useAppState";
import { buildWorkspaceDestinationOptions, findLeadForDialNumber } from "../lib/dialerNumbers";
import { cn, formatDuration, formatPhone } from "../lib/utils";
import {
  formatManualDialNumberForCountry,
  sanitizeDialPadInput,
} from "../lib/softphoneDialing";

const dialPadKeys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"] as const;

export function ManualDialerPage() {
  const navigate = useNavigate();
  const {
    currentUser,
    leads,
    activeCall,
    ringCentralStatus,
    wrapUpLeadId,
    callError,
    startCall,
    endCall,
    saveDisposition,
  } = useAppState();

  const [dialPadValue, setDialPadValue] = useState("");
  const [dialPadMessage, setDialPadMessage] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [quickDestination, setQuickDestination] = useState("custom");

  const dialTarget = useMemo(() => sanitizeDialPadInput(dialPadValue), [dialPadValue]);
  const dialDigits = useMemo(() => dialTarget.replace(/[^\d]/g, ""), [dialTarget]);
  const callInProgress = Boolean(activeCall);
  const workspaceDestinationOptions = useMemo(
    () => buildWorkspaceDestinationOptions(leads),
    [leads],
  );

  const manualDialNumber = useMemo(() => {
    return formatManualDialNumberForCountry(dialTarget, {
      callingCode: "1",
      nationalNumberLength: 10,
    });
  }, [dialTarget]);
  const matchedLead = useMemo(
    () => findLeadForDialNumber(leads, manualDialNumber),
    [leads, manualDialNumber],
  );
  const isManualDialNumberValid = Boolean(manualDialNumber);

  useEffect(() => {
    if (!activeCall) {
      setElapsed(0);
      return;
    }

    setElapsed(Math.max(1, Math.floor((Date.now() - activeCall.startedAt) / 1000)));
    const interval = window.setInterval(() => {
      setElapsed(Math.max(1, Math.floor((Date.now() - activeCall.startedAt) / 1000)));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [activeCall]);

  if (!currentUser) {
    return null;
  }

  const callStatusLabel = activeCall?.status ?? "idle";

  const handleDialPadInputChange = (value: string) => {
    setDialPadMessage("");
    setDialPadValue(sanitizeDialPadInput(value));
    setQuickDestination("custom");
  };

  const handleDialPadAppend = (value: string) => {
    setDialPadMessage("");
    setQuickDestination("custom");
    setDialPadValue((current) => sanitizeDialPadInput(`${current}${value}`));
  };

  const handleDialPadBackspace = () => {
    setDialPadMessage("");
    setQuickDestination("custom");
    setDialPadValue((current) => sanitizeDialPadInput(current.slice(0, -1)));
  };

  const handleDialPadCall = async () => {
    if (!dialTarget || callInProgress) {
      return;
    }
    const callNumber = manualDialNumber;
    if (!callNumber) {
      setDialPadMessage("Enter a valid 10-digit US phone number.");
      return;
    }

    setDialPadMessage("");

    if (!ringCentralStatus.connected) {
      setDialPadMessage("Connect RingCentral in Settings before placing calls.");
      return;
    }

    try {
      await startCall({
        phone: callNumber,
        leadId: matchedLead?.lead.id ?? null,
        displayName: matchedLead?.lead.fullName ?? callNumber,
        phoneIndex: matchedLead?.phoneIndex,
        allowDuringWrapUp: true,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to start that call.";
      setDialPadMessage(message);
    }
  };

  const handleQuickDestinationChange = (value: string) => {
    setQuickDestination(value);
    if (value === "custom") {
      return;
    }

    setDialPadMessage("");
    setDialPadValue(value);
  };

  return (
    <div className="space-y-4 text-sm">
      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-[#eef4fb] shadow-[0_20px_60px_rgba(15,23,42,0.08)] dark:border-slate-800 dark:bg-slate-950">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
              Manual Dialer
            </p>
            <p className="mt-1 text-[13px] font-medium text-slate-900 dark:text-white">
              Dial any number without selecting a lead
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => navigate("/dialer")}>
              <ArrowLeft size={14} />
              Back
            </Button>
            <Button variant="secondary" size="sm" onClick={() => navigate("/settings")}>
              <Settings2 size={14} />
              Settings
            </Button>
          </div>
        </div>

        {callError ? (
          <div className="border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950">
            <AlertBanner
              title="Dialer notice"
              description={callError}
              tone="error"
            />
          </div>
        ) : null}

        <div className="grid gap-4 p-4 xl:grid-cols-[360px_minmax(0,1fr)]">
          <div className="space-y-4">
            <Card className="space-y-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[13px] font-semibold text-slate-900 dark:text-white">Number</p>
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    Pick a known destination or enter a custom number.
                  </p>
                </div>
                <Badge
                  className={cn(
                    "border border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200",
                    callInProgress ? "opacity-100" : "opacity-70",
                  )}
                >
                  {callStatusLabel}
                </Badge>
              </div>
              {!ringCentralStatus.connected ? (
                <p className="text-[11px] text-amber-600 dark:text-amber-300">
                  RingCentral is not connected. Connect it in Settings before placing calls.
                </p>
              ) : null}

              <label className="space-y-1">
                <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                  Quick destination
                </span>
                <select
                  value={quickDestination}
                  onChange={(event) => handleQuickDestinationChange(event.target.value)}
                  className="crm-input py-2 text-[12px]"
                >
                  <option value="custom">Custom entry</option>
                  {workspaceDestinationOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                  Phone number
                </span>
                <input
                  value={dialPadValue}
                  onChange={(event) => handleDialPadInputChange(event.target.value)}
                  placeholder="Enter number"
                  inputMode="tel"
                  className="crm-input text-[13px] tracking-[0.18em]"
                />
              </label>

              {manualDialNumber && dialDigits.length > 6 && !dialTarget.startsWith("+") ? (
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Dialing as: {manualDialNumber}
                </p>
              ) : null}

              <div className="grid grid-cols-3 gap-2">
                {dialPadKeys.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleDialPadAppend(key)}
                    className="rounded-[14px] border border-slate-200 bg-white px-3 py-3 text-[14px] font-semibold text-slate-800 transition hover:border-sky-400 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    disabled={callInProgress}
                  >
                    {key}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleDialPadBackspace}
                  disabled={!dialPadValue || callInProgress}
                >
                  Backspace
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => handleDialPadInputChange("")}
                  disabled={!dialPadValue || callInProgress}
                >
                  Clear
                </Button>
              </div>

              <Button
                size="sm"
                className="w-full"
                onClick={() => void handleDialPadCall()}
                disabled={!isManualDialNumberValid || callInProgress}
              >
                <PhoneCall size={14} />
                {callInProgress
                  ? "Call in progress"
                  : "Call number"}
              </Button>

              {dialPadMessage ? (
                <p className="text-[12px] text-rose-600 dark:text-rose-300">{dialPadMessage}</p>
              ) : null}
            </Card>

            {activeCall ? (
              <Card className="space-y-3 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-slate-900 dark:text-white">
                      {activeCall.displayName}
                    </p>
                    <p className="text-[12px] text-slate-500 dark:text-slate-400">
                      {formatPhone(activeCall.dialedNumber)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Timer</p>
                    <p className="text-[16px] font-medium text-slate-900 dark:text-white">
                      {formatDuration(elapsed)}
                    </p>
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <Button size="sm" variant="danger" onClick={endCall}>
                    <PhoneOff size={14} />
                    End call
                  </Button>
                </div>
              </Card>
            ) : null}

            {wrapUpLeadId ? (
              <PostCallPanel
                open={Boolean(wrapUpLeadId)}
                leadName={leads.find((lead) => lead.id === wrapUpLeadId)?.fullName ?? "this lead"}
                onSave={saveDisposition}
              />
            ) : null}
          </div>

          <div className="space-y-4">
            <Card className="space-y-3 p-5">
              <div>
                <p className="text-[13px] font-semibold text-slate-900 dark:text-white">
                  Dialing behavior
                </p>
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  The manual dialer places RingOut calls, so there is no in-app voice session or
                  microphone setup to manage.
                </p>
              </div>
              <div className="crm-subtle-card px-4 py-3 text-[12px] text-slate-600 dark:text-slate-300">
                Use the keypad or type a number, then press the button to place the RingOut call.
              </div>
            </Card>

            <Card className="space-y-3 p-5">
              <div>
                <p className="text-[13px] font-semibold text-slate-900 dark:text-white">
                  RingCentral RingOut
                </p>
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  Call places a RingOut call with the formatted number. The CRM keeps the lead
                  queue, timer, and wrap-up flow.
                </p>
              </div>
              <div className="crm-subtle-card px-4 py-3 text-[12px] text-slate-600 dark:text-slate-300">
                The number is normalized to US format first, then sent to RingCentral with the
                selected RingOut number.
              </div>
            </Card>
          </div>
        </div>
      </section>
    </div>
  );
}
