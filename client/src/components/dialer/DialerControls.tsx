import { Mic, Pause, PhoneCall, PhoneOff, Radio, TimerReset } from "lucide-react";
import { useEffect, useState } from "react";

import type { ActiveCall, Lead } from "../../types";
import { formatDuration, formatPhone } from "../../lib/utils";
import { Badge } from "../shared/Badge";
import { Button } from "../shared/Button";
import { Card } from "../shared/Card";

interface DialerControlsProps {
  lead: Lead;
  activeCall: ActiveCall | null;
  twilioReady: boolean;
  autoDialEnabled: boolean;
  autoDialDelaySeconds: number;
  autoDialCountdown: number | null;
  onCall: () => Promise<void>;
  onEnd: () => void;
  onMute: () => void;
  onHold: () => void;
  onResume: () => void;
  onToggleAutoDial: (enabled: boolean) => void;
  onAutoDialDelayChange: (delay: number) => void;
}

export function DialerControls({
  lead,
  activeCall,
  twilioReady,
  autoDialEnabled,
  autoDialDelaySeconds,
  autoDialCountdown,
  onCall,
  onEnd,
  onMute,
  onHold,
  onResume,
  onToggleAutoDial,
  onAutoDialDelayChange,
}: DialerControlsProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!activeCall) {
      setElapsed(0);
      return;
    }

    const interval = window.setInterval(() => {
      setElapsed(Math.max(1, Math.floor((Date.now() - activeCall.startedAt) / 1000)));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [activeCall]);

  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-surface-700 dark:text-cyan-300">
          Dialer Controls
        </p>
        <div className="mt-2 flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{lead.fullName}</h3>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              {formatPhone(lead.phone)} / {lead.company || "No company"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge className="bg-emerald-50 px-2 py-1 text-[10px] text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
              <Radio size={12} />
              {activeCall?.status ?? "idle"}
            </Badge>
            <Badge className="bg-surface-50 px-2 py-1 text-[10px] text-surface-700 dark:bg-slate-800 dark:text-slate-200">
              Timer {formatDuration(elapsed)}
            </Badge>
            <Badge className="bg-slate-100 px-2 py-1 text-[10px] text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              {twilioReady ? "Browser calling" : "Manual mode"}
            </Badge>
          </div>
        </div>
      </div>

      <div className="grid gap-2 px-4 py-3 sm:grid-cols-2 xl:grid-cols-4">
        <Button size="md" onClick={() => void onCall()} disabled={Boolean(activeCall)}>
          <PhoneCall size={16} />
          Call now
        </Button>
        <Button size="md" variant="danger" onClick={onEnd} disabled={!activeCall}>
          <PhoneOff size={16} />
          End call
        </Button>
        <Button size="md" variant="secondary" onClick={onMute} disabled={!activeCall}>
          <Mic size={16} />
          {activeCall?.muted ? "Unmute" : "Mute"}
        </Button>
        <Button
          size="md"
          variant="secondary"
          onClick={activeCall?.status === "on_hold" ? onResume : onHold}
          disabled={!activeCall}
        >
          <Pause size={16} />
          {activeCall?.status === "on_hold" ? "Resume" : "Hold"}
        </Button>
      </div>

      <div className="grid gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900 lg:grid-cols-[auto_150px_1fr]">
        <Button
          variant={autoDialEnabled ? "primary" : "secondary"}
          onClick={() => onToggleAutoDial(!autoDialEnabled)}
          disabled={Boolean(activeCall)}
        >
          <TimerReset size={16} />
          {autoDialEnabled ? "Auto dial armed" : "Enable auto dial"}
        </Button>
        <select
          value={autoDialDelaySeconds}
          onChange={(event) => onAutoDialDelayChange(Number(event.target.value))}
          className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-[11px] outline-none focus:border-surface-600 dark:border-slate-700 dark:bg-slate-950"
          disabled={!autoDialEnabled || Boolean(activeCall)}
        >
          <option value={2}>2 sec delay</option>
          <option value={3}>3 sec delay</option>
          <option value={5}>5 sec delay</option>
          <option value={8}>8 sec delay</option>
        </select>
        <div className="rounded-[18px] border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
          {activeCall
            ? "Auto dial is paused while the current call is active."
            : autoDialEnabled && autoDialCountdown !== null
              ? `Next queued record starts calling in ${autoDialCountdown}s.`
              : autoDialEnabled
                ? "Auto dial is waiting for the next available queue record."
                : "Enable auto dial to move through the queue automatically after each saved wrap-up."}
        </div>
      </div>
    </Card>
  );
}
