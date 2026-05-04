import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppShell } from "@/layouts/app-shell";
import { ProtectedRoute } from "@/components/layouts/protected-route";
import { LoginPage } from "@/pages/login";
import { DashboardPage } from "@/pages/dashboard";
import { ImportsPage } from "@/pages/imports";
import { CallerListsPage } from "@/pages/caller-lists";
import { DialerPage } from "@/pages/dialer";
import { CompletedPage } from "@/pages/completed";
import { ReportsPage } from "@/pages/reports";
import { SettingsPage } from "@/pages/settings";

export const router = createBrowserRouter([
  {
    path: "/login",
    element: <LoginPage />,
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppShell />,
        children: [
          {
            path: "/",
            element: <Navigate to="/dashboard" replace />,
          },
          { path: "/dashboard", element: <DashboardPage /> },
          { path: "/imports", element: <ImportsPage /> },
          { path: "/caller-lists", element: <CallerListsPage /> },
          { path: "/dialer", element: <DialerPage /> },
          { path: "/completed", element: <CompletedPage /> },
          { path: "/reports", element: <ReportsPage /> },
          { path: "/settings", element: <SettingsPage /> },
        ],
      },
    ],
  },
]);
