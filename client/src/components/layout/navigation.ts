import {
  BarChart3,
  BellRing,
  LayoutDashboard,
  ListChecks,
  PhoneCall,
  Settings,
  ShieldCheck,
  Users2,
  type LucideIcon,
} from "lucide-react";

import type { UserRole } from "../../types";

export interface NavigationItem {
  label: string;
  href: string;
  icon: LucideIcon;
  roles: UserRole[];
}

export const navigationItems: NavigationItem[] = [
  { label: "Activity", href: "/dashboard", icon: LayoutDashboard, roles: ["admin", "team_leader", "agent"] },
  { label: "Calls", href: "/calls", icon: ListChecks, roles: ["admin", "team_leader", "agent"] },
  { label: "Dialer", href: "/dialer", icon: PhoneCall, roles: ["admin", "team_leader", "agent"] },
  { label: "FollowUp", href: "/callbacks", icon: BellRing, roles: ["admin", "team_leader", "agent"] },
  { label: "Contacts", href: "/leads", icon: ShieldCheck, roles: ["admin", "team_leader"] },
  { label: "Reports", href: "/reports", icon: BarChart3, roles: ["admin", "team_leader"] },
  { label: "Users", href: "/users", icon: Users2, roles: ["admin"] },
  { label: "Settings", href: "/settings", icon: Settings, roles: ["admin", "team_leader", "agent"] },
];

export function getNavigationItemsForRole(role: UserRole) {
  return navigationItems.filter((item) => item.roles.includes(role));
}
