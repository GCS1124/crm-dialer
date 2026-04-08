import { useEffect, useState } from "react";

import type { CallDisposition, LeadPriority, SaveDispositionInput } from "../../types";
import { Button } from "../shared/Button";
import { Card } from "../shared/Card";

const dispositions: CallDisposition[] = [
  "No Answer",
  "Busy",
  "Voicemail",
  "Wrong Number",
  "Not Interested",
  "Interested",
  "Call Back Later",
  "Follow-Up Required",
  "Appointment Booked",
  "Sale Closed",
];

const priorities: LeadPriority[] = ["Low", "Medium", "High", "Urgent"];
const noteTemplates = [
  "Interested and asked for the next step.",
  "Reached voicemail. Retry during business hours.",
  "Asked for a callback later this week.",
  "Not the decision maker. Need the right contact.",
];

export function PostCallPanel({
  open,
  leadName,
  onSave,
}: {
  open: boolean;
  leadName: string;
  onSave: (input: SaveDispositionInput) => Promise<void>;
}) {
  const [disposition, setDisposition] = useState<CallDisposition>("No Answer");
  const [notes, setNotes] = useState("");
  const [callbackAt, setCallbackAt] = useState("");
  const [followUpPriority, setFollowUpPriority] = useState<LeadPriority>("Medium");
  const [outcomeSummary, setOutcomeSummary] = useState("");
  const [saving, setSaving] = useState(false);
  const needsCallbackTime =
    disposition === "Call Back Later" ||
    disposition === "Follow-Up Required" ||
    disposition === "Appointment Booked";

  useEffect(() => {
    if (!open) {
      setDisposition("No Answer");
      setNotes("");
      setCallbackAt("");
      setFollowUpPriority("Medium");
      setOutcomeSummary("");
    }
  }, [open, leadName]);

  if (!open) {
    return null;
  }

  return (
    <Card className="space-y-3 border border-cyan-300/60 p-4 dark:border-cyan-500/30">
      <div>
        <p className="text-[11px] uppercase tracking-[0.18em] text-cyan-600 dark:text-cyan-300">
          Wrap-Up
        </p>
        <h3 className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
          Save outcome for {leadName}
        </h3>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1.5 text-[11px]">
          <span className="font-medium text-slate-700 dark:text-slate-200">Disposition</span>
          <select
            value={disposition}
            onChange={(event) => setDisposition(event.target.value as CallDisposition)}
            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950"
          >
            {dispositions.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1.5 text-[11px]">
          <span className="font-medium text-slate-700 dark:text-slate-200">
            Follow-up priority
          </span>
          <select
            value={followUpPriority}
            onChange={(event) => setFollowUpPriority(event.target.value as LeadPriority)}
            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950"
          >
            {priorities.map((priority) => (
              <option key={priority} value={priority}>
                {priority}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1.5 text-[11px] md:col-span-2">
          <span className="font-medium text-slate-700 dark:text-slate-200">Outcome summary</span>
          <input
            value={outcomeSummary}
            onChange={(event) => setOutcomeSummary(event.target.value)}
            placeholder="One-line summary for the next person viewing this lead"
            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950"
          />
        </label>

        <label className="space-y-1.5 text-[11px] md:col-span-2">
          <span className="font-medium text-slate-700 dark:text-slate-200">Call notes</span>
          <div className="flex flex-wrap gap-2">
            {noteTemplates.map((template) => (
              <button
                key={template}
                type="button"
                onClick={() => setNotes((current) => (current ? `${current}\n${template}` : template))}
                className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
              >
                {template}
              </button>
            ))}
          </div>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
            placeholder="Capture objections, buying signals, timing, and next step detail"
            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950"
          />
        </label>

        {needsCallbackTime ? (
          <label className="space-y-1.5 text-[11px] md:col-span-2">
            <span className="font-medium text-slate-700 dark:text-slate-200">
              {disposition === "Appointment Booked" ? "Appointment date and time" : "Callback date and time"}
            </span>
            <input
              type="datetime-local"
              value={callbackAt}
              onChange={(event) => setCallbackAt(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950"
            />
          </label>
        ) : null}
      </div>

      <div className="flex justify-end">
        <Button
          size="md"
          onClick={async () => {
            setSaving(true);
            try {
              await onSave({
                disposition,
                notes,
                callbackAt: callbackAt ? new Date(callbackAt).toISOString() : "",
                followUpPriority,
                outcomeSummary,
              });
            } finally {
              setSaving(false);
            }
          }}
          disabled={!outcomeSummary.trim() || (needsCallbackTime && !callbackAt) || saving}
        >
          {saving ? "Saving..." : "Save disposition & load next lead"}
        </Button>
      </div>
    </Card>
  );
}
