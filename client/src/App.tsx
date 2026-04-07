import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { AppShell } from "./components/layout/AppShell";
import { useAppState } from "./hooks/useAppState";

const LoginPage = lazy(() =>
  import("./pages/LoginPage").then((module) => ({ default: module.LoginPage })),
);
const SignupPage = lazy(() =>
  import("./pages/SignupPage").then((module) => ({ default: module.SignupPage })),
);
const DashboardPage = lazy(() =>
  import("./pages/DashboardPage").then((module) => ({ default: module.DashboardPage })),
);
const PreviewDialerPage = lazy(() =>
  import("./pages/PreviewDialerPage").then((module) => ({
    default: module.PreviewDialerPage,
  })),
);
const CallbacksPage = lazy(() =>
  import("./pages/CallbacksPage").then((module) => ({ default: module.CallbacksPage })),
);
const LeadManagementPage = lazy(() =>
  import("./pages/LeadManagementPage").then((module) => ({
    default: module.LeadManagementPage,
  })),
);
const ReportsPage = lazy(() =>
  import("./pages/ReportsPage").then((module) => ({ default: module.ReportsPage })),
);
const UserManagementPage = lazy(() =>
  import("./pages/UserManagementPage").then((module) => ({
    default: module.UserManagementPage,
  })),
);
const SettingsPage = lazy(() =>
  import("./pages/SettingsPage").then((module) => ({ default: module.SettingsPage })),
);
const NotFoundPage = lazy(() =>
  import("./pages/NotFoundPage").then((module) => ({ default: module.NotFoundPage })),
);

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="panel-glass rounded-[28px] px-6 py-5 text-sm text-slate-600 shadow-soft dark:text-slate-300">
        Loading workspace...
      </div>
    </div>
  );
}

function LazyPage({ children }: { children: ReactNode }) {
  return <Suspense fallback={<LoadingScreen />}>{children}</Suspense>;
}

function ProtectedRoute() {
  const { currentUser, sessionReady } = useAppState();
  if (!sessionReady) {
    return <LoadingScreen />;
  }
  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  return <AppShell />;
}

function AdminRoute({ children }: { children: ReactNode }) {
  const { currentUser, sessionReady } = useAppState();
  if (!sessionReady) {
    return <LoadingScreen />;
  }
  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  if (currentUser.role !== "admin") {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

function ManagerRoute({ children }: { children: ReactNode }) {
  const { currentUser, sessionReady } = useAppState();
  if (!sessionReady) {
    return <LoadingScreen />;
  }
  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  if (currentUser.role === "agent") {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

export default function App() {
  const { currentUser, sessionReady } = useAppState();

  if (!sessionReady) {
    return <LoadingScreen />;
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={
          currentUser ? (
            <Navigate to="/dashboard" replace />
          ) : (
            <LazyPage>
              <LoginPage />
            </LazyPage>
          )
        }
      />
      <Route
        path="/signup"
        element={
          currentUser ? (
            <Navigate to="/dashboard" replace />
          ) : (
            <LazyPage>
              <SignupPage />
            </LazyPage>
          )
        }
      />
      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route
          path="/dashboard"
          element={
            <LazyPage>
              <DashboardPage />
            </LazyPage>
          }
        />
        <Route
          path="/dialer"
          element={
            <LazyPage>
              <PreviewDialerPage />
            </LazyPage>
          }
        />
        <Route
          path="/callbacks"
          element={
            <LazyPage>
              <CallbacksPage />
            </LazyPage>
          }
        />
        <Route
          path="/leads"
          element={
            <ManagerRoute>
              <LazyPage>
                <LeadManagementPage />
              </LazyPage>
            </ManagerRoute>
          }
        />
        <Route
          path="/reports"
          element={
            <ManagerRoute>
              <LazyPage>
                <ReportsPage />
              </LazyPage>
            </ManagerRoute>
          }
        />
        <Route
          path="/users"
          element={
            <AdminRoute>
              <LazyPage>
                <UserManagementPage />
              </LazyPage>
            </AdminRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <LazyPage>
              <SettingsPage />
            </LazyPage>
          }
        />
      </Route>
      <Route
        path="*"
        element={
          <LazyPage>
            <NotFoundPage />
          </LazyPage>
        }
      />
    </Routes>
  );
}
