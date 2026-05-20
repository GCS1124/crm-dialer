import { useState, type FormEvent } from "react";

import { AlertBanner } from "../shared/AlertBanner";
import { Button } from "../shared/Button";
import { useAppState } from "../../hooks/useAppState";

interface PasswordResetPanelProps {
  mode: "forced" | "settings";
  onSuccess?: () => void | Promise<void>;
  compact?: boolean;
}

const panelCopy = {
  forced: {
    title: "Reset your password",
    description:
      "This workspace account was created with a temporary password. Set a new password before continuing.",
    buttonLabel: "Set new password",
    successMessage: "Password updated. You can continue to the workspace now.",
  },
  settings: {
    title: "Password reset",
    description:
      "Update the password for your signed-in account. The new password takes effect immediately.",
    buttonLabel: "Update password",
    successMessage: "Password updated.",
  },
} as const;

export function PasswordResetPanel({ mode, onSuccess, compact = false }: PasswordResetPanelProps) {
  const { currentUser, changePassword } = useAppState();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const copy = panelCopy[mode];
  const showDescription = !compact;
  const showHelperText = !compact;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!currentUser) {
      setError("Missing session.");
      return;
    }

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    const result = await changePassword(newPassword);
    setIsSubmitting(false);

    if (!result.success) {
      setError(result.message ?? "Unable to update your password.");
      return;
    }

    setNewPassword("");
    setConfirmPassword("");
    setSuccess(copy.successMessage);
    if (onSuccess) {
      await onSuccess();
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-[18px] font-semibold text-slate-900 dark:text-white">{copy.title}</h3>
        {showDescription ? (
          <p className="mt-1 text-[12px] text-slate-500 dark:text-slate-400">{copy.description}</p>
        ) : null}
      </div>

      {mode === "forced" ? (
        <AlertBanner
          tone="warning"
          description="First sign-in requires a password change before workspace access is enabled."
        />
      ) : null}

      {error ? <AlertBanner tone="error" description={error} /> : null}
      {success ? <AlertBanner tone="success" description={success} /> : null}

      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block space-y-2 text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-200">New password</span>
          <input
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            placeholder="Enter a new password"
            className="crm-input"
          />
        </label>

        <label className="block space-y-2 text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-200">Confirm password</span>
          <input
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="Re-enter the password"
            className="crm-input"
          />
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : copy.buttonLabel}
          </Button>
          {showHelperText ? (
            <p className="text-[12px] text-slate-500 dark:text-slate-400">Minimum 8 characters.</p>
          ) : null}
        </div>
      </form>
    </div>
  );
}
