import { useEffect } from "react";
import { Navigate, useNavigate } from "react-router-dom";

import { Card } from "../components/shared/Card";
import { PasswordResetPanel } from "../components/auth/PasswordResetPanel";
import { useAppState } from "../hooks/useAppState";

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const { currentUser } = useAppState();

  useEffect(() => {
    if (currentUser && !currentUser.mustResetPassword) {
      navigate("/dashboard", { replace: true });
    }
  }, [currentUser, navigate]);

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  if (!currentUser.mustResetPassword) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-[720px] items-center px-4 py-8">
      <Card className="w-full rounded-[28px] p-8 shadow-[0_28px_80px_rgba(15,23,42,0.1)]">
        <div className="space-y-2">
          <p className="crm-section-label text-sky-700 dark:text-cyan-300">Security</p>
          <h2 className="text-[32px] font-semibold tracking-tight text-slate-950 dark:text-white">
            Password reset required
          </h2>
          <p className="text-[13px] text-slate-500 dark:text-slate-400">
            Set a new password to unlock the workspace and finish first-time sign-in.
          </p>
        </div>

        <div className="mt-6">
          <PasswordResetPanel
            mode="forced"
            onSuccess={() => navigate("/dashboard", { replace: true })}
          />
        </div>
      </Card>
    </div>
  );
}
