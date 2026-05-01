import { ArrowLeft, ChevronDown, PhoneCall, PhoneOff, Pause, Mic, Settings2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { AlertBanner } from "../components/shared/AlertBanner";
import { Badge } from "../components/shared/Badge";
import { Button } from "../components/shared/Button";
import { Card } from "../components/shared/Card";
import { useAppState } from "../hooks/useAppState";
import { cn, formatDuration, formatPhone } from "../lib/utils";
import { sanitizeDialPadInput } from "../lib/softphoneDialing";

const dialPadKeys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"] as const;

const manualDialCountries = [
  { id: "US", label: "United States", callingCode: "1", nationalNumberLength: 10 },
  { id: "IN", label: "India", callingCode: "91", nationalNumberLength: 10 },
] as const;

type ManualDialCountryId = (typeof manualDialCountries)[number]["id"] | "custom";

export function ManualDialerPage() {
  const navigate = useNavigate();
  const {
    currentUser,
    voiceConfig,
    activeSipProfile,
    activeCall,
    callError,
    startCall,
    endCall,
    toggleMute,
    holdCall,
    resumeCall,
  } = useAppState();

  const [dialPadValue, setDialPadValue] = useState("");
  const [dialPadMessage, setDialPadMessage] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [countryId, setCountryId] = useState<ManualDialCountryId | "">("");
  const [customCallingCode, setCustomCallingCode] = useState("");

  const dialTarget = useMemo(() => sanitizeDialPadInput(dialPadValue), [dialPadValue]);
  const dialDigits = useMemo(() => dialTarget.replace(/[^\d]/g, ""), [dialTarget]);
  const callInProgress = Boolean(activeCall);
  const manualCallActive = activeCall?.status === "manual";

  useEffect(() => {
    const stored = localStorage.getItem("crm-dialer-manual-dial-country");
    if (stored && (stored === "US" || stored === "IN" || stored === "custom")) {
      setCountryId(stored);
    } else if (currentUser?.timezone?.includes("Kolkata")) {
      setCountryId("IN");
    } else if (voiceConfig.callerId) {
      const callerDigits = voiceConfig.callerId.replace(/[^\d]/g, "");
      if (callerDigits.startsWith("1")) {
        setCountryId("US");
      } else if (callerDigits.startsWith("91")) {
        setCountryId("IN");
      }
    }

    const storedCallingCode = localStorage.getItem("crm-dialer-manual-dial-custom-code");
    if (storedCallingCode) {
      setCustomCallingCode(storedCallingCode.replace(/[^\d]/g, ""));
    }
  }, [currentUser?.timezone, voiceConfig.callerId]);

  useEffect(() => {
    if (!countryId) {
      return;
    }
    localStorage.setItem("crm-dialer-manual-dial-country", countryId);
  }, [countryId]);

  useEffect(() => {
    localStorage.setItem("crm-dialer-manual-dial-custom-code", customCallingCode);
  }, [customCallingCode]);

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

  const isSoftphoneConfigured = voiceConfig.available;
  const configLabel = voiceConfig.profileLabel || activeSipProfile?.label || "Not configured";
  const configIdentity =
    voiceConfig.username && voiceConfig.sipDomain ? `${voiceConfig.username}@${voiceConfig.sipDomain}` : null;
  const callStatusLabel = activeCall?.status ?? "idle";

  const handleDialPadInputChange = (value: string) => {
    setDialPadMessage("");
    setDialPadValue(sanitizeDialPadInput(value));
  };

  const handleDialPadAppend = (value: string) => {
    handleDialPadInputChange(`${dialPadValue}${value}`);
  };

  const handleDialPadBackspace = () => {
    handleDialPadInputChange(dialPadValue.slice(0, -1));
  };

  const handleDialPadCall = async () => {
    if (!dialTarget || callInProgress) {
      return;
    }
    const callNumber = dialTarget;
    if (!callNumber) {
      setDialPadMessage("Enter a valid phone number.");
      return;
    }

    setDialPadMessage("");
    try {
      await startCall({
        phone: callNumber,
        leadId: null,
        displayName: callNumber,
      });
    } catch (error) {
      setDialPadMessage(error instanceof Error ? error.message : "Unable to start that call.");
    }
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
              Softphone settings
            </Button>
          </div>
        </div>

        {callError ? (
          <div className="border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950">
            <AlertBanner
              title={manualCallActive ? "Manual calling mode" : "Softphone notice"}
              description={callError}
              tone={manualCallActive || !isSoftphoneConfigured ? "warning" : "error"}
            />
          </div>
        ) : null}

        {!isSoftphoneConfigured ? (
          <div className="border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950">
            <AlertBanner
              title="Browser calling is not configured"
              description="Activate a SIP profile (or configure voice environment variables) to place calls from the CRM softphone."
              tone="info"
              action={
                <Button variant="secondary" size="sm" onClick={() => navigate("/settings")}>
                  Open settings
                </Button>
              }
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
                    Enter a phone number and press Call.
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

              <div className="grid gap-2 sm:grid-cols-[180px_minmax(0,1fr)]">
                <label className="space-y-1">
                  <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                    Country
                  </span>
                  <div className="relative">
                    <select
                      value={countryId}
                      onChange={(event) => {
                        setDialPadMessage("");
                        setCountryId(event.target.value as ManualDialCountryId | "");
                      }}
                      className="crm-input appearance-none py-2 pl-9 pr-9 text-[12px]"
                      disabled={callInProgress}
                    >
                      <option value="">Select</option>
                      {manualDialCountries.map((country) => (
                        <option key={country.id} value={country.id}>
                          {country.label} (+{country.callingCode})
                        </option>
                      ))}
                      <option value="custom">Custom...</option>
                    </select>
                    <ChevronDown
                      size={14}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                  </div>
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
              </div>

              {countryId === "custom" ? (
                <label className="space-y-1">
                  <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                    Custom calling code
                  </span>
                  <input
                    value={customCallingCode}
                    onChange={(event) => {
                      setDialPadMessage("");
                      setCustomCallingCode(event.target.value.replace(/[^\d]/g, ""));
                    }}
                    placeholder="e.g. 1, 44, 91"
                    inputMode="numeric"
                    className="crm-input py-2 text-[12px]"
                    disabled={callInProgress}
                  />
                </label>
              ) : null}

              {dialTarget && dialDigits.length > 6 ? (
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Dialing as: {dialTarget}
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
                disabled={!dialTarget || callInProgress}
              >
                <PhoneCall size={14} />
                {callInProgress ? "Call in progress" : "Call number"}
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
                  <Button size="sm" variant="secondary" onClick={toggleMute} disabled={manualCallActive}>
                    <Mic size={14} />
                    {activeCall.muted ? "Unmute" : "Mute"}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={activeCall.status === "on_hold" ? resumeCall : holdCall}
                    disabled={manualCallActive}
                  >
                    <Pause size={14} />
                    {activeCall.status === "on_hold" ? "Resume" : "Hold"}
                  </Button>
                </div>
              </Card>
            ) : null}
          </div>

          <div className="space-y-4">
            <Card className="space-y-3 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[13px] font-semibold text-slate-900 dark:text-white">Dialer config</p>
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    Softphone status for this workspace session.
                  </p>
                </div>
                <Badge
                  className={cn(
                    isSoftphoneConfigured
                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                      : "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
                  )}
                >
                  {isSoftphoneConfigured ? "Configured" : "Needs setup"}
                </Badge>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="crm-subtle-card px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                    Provider
                  </p>
                  <p className="mt-1 text-[13px] font-medium text-slate-900 dark:text-white">
                    {voiceConfig.provider}
                  </p>
                </div>
                <div className="crm-subtle-card px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                    Source
                  </p>
                  <p className="mt-1 text-[13px] font-medium text-slate-900 dark:text-white">
                    {voiceConfig.source}
                  </p>
                </div>
                <div className="crm-subtle-card px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                    Profile
                  </p>
                  <p className="mt-1 text-[13px] font-medium text-slate-900 dark:text-white">
                    {configLabel}
                  </p>
                </div>
                <div className="crm-subtle-card px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                    Caller ID
                  </p>
                  <p className="mt-1 text-[13px] font-medium text-slate-900 dark:text-white">
                    {voiceConfig.callerId || activeSipProfile?.callerId || "--"}
                  </p>
                </div>
              </div>

              {configIdentity ? (
                <div className="crm-subtle-card px-4 py-3 text-[12px] text-slate-600 dark:text-slate-300">
                  Identity: {configIdentity}
                </div>
              ) : null}
            </Card>
          </div>
        </div>
      </section>
    </div>
  );
}
