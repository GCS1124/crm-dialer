import { useState, type FormEvent } from "react";

import type { CreateSipProfileInput } from "../../types";
import { Button } from "../shared/Button";

interface SipProfileFormProps {
  onSubmit: (input: CreateSipProfileInput) => Promise<void>;
  submitLabel: string;
  allowShared: boolean;
  initialShared?: boolean;
  className?: string;
}

const emptyForm: CreateSipProfileInput = {
  label: "",
  providerUrl: "",
  sipDomain: "",
  sipUsername: "",
  sipPassword: "",
  callerId: "",
  isShared: false,
};

export function SipProfileForm({
  onSubmit,
  submitLabel,
  allowShared,
  initialShared = false,
  className = "",
}: SipProfileFormProps) {
  const [form, setForm] = useState<CreateSipProfileInput>({
    ...emptyForm,
    isShared: initialShared && allowShared,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateField = <K extends keyof CreateSipProfileInput>(
    field: K,
    value: CreateSipProfileInput[K],
  ) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await onSubmit(form);
      setForm({
        ...emptyForm,
        isShared: initialShared && allowShared,
      });
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Unable to save the SIP profile.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className={`space-y-3 ${className}`.trim()} onSubmit={handleSubmit}>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1.5">
          <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
            Profile label
          </span>
          <input
            className="crm-input"
            value={form.label}
            onChange={(event) => updateField("label", event.target.value)}
            placeholder="Unified Voice Shared"
            required
          />
        </label>

        <label className="space-y-1.5">
          <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
            WebSocket URL
          </span>
          <input
            className="crm-input"
            value={form.providerUrl}
            onChange={(event) => updateField("providerUrl", event.target.value)}
            placeholder="wss://umsg.uvcpbx.in:7443/"
            required
          />
        </label>

        <label className="space-y-1.5">
          <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
            SIP domain
          </span>
          <input
            className="crm-input"
            value={form.sipDomain}
            onChange={(event) => updateField("sipDomain", event.target.value)}
            placeholder="umsg.uvcpbx.in"
            required
          />
        </label>

        <label className="space-y-1.5">
          <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
            SIP username
          </span>
          <input
            className="crm-input"
            value={form.sipUsername}
            onChange={(event) => updateField("sipUsername", event.target.value)}
            placeholder="908089"
            required
          />
        </label>

        <label className="space-y-1.5">
          <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
            SIP password
          </span>
          <input
            className="crm-input"
            type="password"
            value={form.sipPassword}
            onChange={(event) => updateField("sipPassword", event.target.value)}
            placeholder="Password"
            required
          />
        </label>

        <label className="space-y-1.5">
          <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
            Caller ID
          </span>
          <input
            className="crm-input"
            value={form.callerId}
            onChange={(event) => updateField("callerId", event.target.value)}
            placeholder="17252182800"
            required
          />
        </label>
      </div>

      {allowShared ? (
        <label className="crm-subtle-card flex items-center justify-between gap-4 px-4 py-3 text-sm text-slate-700">
          <div>
            <p className="font-medium text-slate-900">Shared profile</p>
            <p className="mt-0.5 text-[12px] text-slate-500">
              Shared profiles are visible to other agents in the workspace.
            </p>
          </div>
          <input
            type="checkbox"
            checked={form.isShared}
            onChange={(event) => updateField("isShared", event.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
        </label>
      ) : null}

      {error ? (
        <div className="rounded-[14px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="flex items-center justify-end">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving..." : submitLabel}
        </Button>
      </div>
    </form>
  );
}
