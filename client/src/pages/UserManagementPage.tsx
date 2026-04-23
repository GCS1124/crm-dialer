import { useState } from "react";

import { Badge } from "../components/shared/Badge";
import { Button } from "../components/shared/Button";
import { Card } from "../components/shared/Card";
import { MetricCard } from "../components/shared/MetricCard";
import { PageHeader } from "../components/shared/PageHeader";
import { useAppState } from "../hooks/useAppState";
import { getRoleLabel } from "../lib/utils";
import type { UserRole } from "../types";

const roleOptions: UserRole[] = ["admin", "team_leader", "agent"];

export function UserManagementPage() {
  const { users, leads, analytics, inviteUser, setUserStatus } = useAppState();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>("agent");
  const [team, setTeam] = useState("North America SDR");
  const [timezone, setTimezone] = useState("America/New_York");
  const [title, setTitle] = useState("Outbound Agent");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="User Management"
        title="Provision roles and monitor workload"
        description="Create users, assign roles, and monitor workload."
      />

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Admins" value={users.filter((user) => user.role === "admin").length} />
        <MetricCard label="Team leaders" value={users.filter((user) => user.role === "team_leader").length} />
        <MetricCard label="Agents" value={users.filter((user) => user.role === "agent").length} />
      </div>

      {message ? (
        <Card className="border border-cyan-300/60 bg-cyan-50/80 text-sm text-cyan-700 dark:border-cyan-500/30 dark:bg-cyan-950/20 dark:text-cyan-300">
          {message}
        </Card>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="space-y-4 p-5">
          <div>
            <p className="crm-section-label">
              Create User
            </p>
            <h3 className="mt-2 text-[18px] font-semibold text-slate-900 dark:text-white">
              Add new access
            </h3>
          </div>
          <div className="grid gap-4">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Full name"
              className="crm-input"
            />
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Email"
              className="crm-input"
            />
            <div className="grid gap-4 md:grid-cols-2">
              <select
                value={role}
                onChange={(event) => setRole(event.target.value as UserRole)}
                className="crm-input"
              >
                {roleOptions.map((item) => (
                  <option key={item} value={item}>
                    {getRoleLabel(item)}
                  </option>
                ))}
              </select>
              <input
                value={team}
                onChange={(event) => setTeam(event.target.value)}
                placeholder="Team"
                className="crm-input"
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <input
                value={timezone}
                onChange={(event) => setTimezone(event.target.value)}
                placeholder="Timezone"
                className="crm-input"
              />
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Job title"
                className="crm-input"
              />
            </div>
            <Button
              disabled={isSubmitting}
              onClick={async () => {
                if (!name.trim() || !email.trim()) {
                  return;
                }

                setIsSubmitting(true);
                try {
                  const result = await inviteUser({
                    name: name.trim(),
                    email: email.trim(),
                    role,
                    team: team.trim(),
                    timezone: timezone.trim(),
                    title: title.trim(),
                  });

                  setMessage(
                    `Created ${result.user.name}. Temporary password: ${result.temporaryPassword}`,
                  );
                  setName("");
                  setEmail("");
                  setRole("agent");
                  setTeam("North America SDR");
                  setTimezone("America/New_York");
                  setTitle("Outbound Agent");
                } catch (error) {
                  setMessage(
                    error instanceof Error ? error.message : "Unable to create that user.",
                  );
                } finally {
                  setIsSubmitting(false);
                }
              }}
            >
              {isSubmitting ? "Creating..." : "Create user"}
            </Button>
          </div>
        </Card>

        <Card className="p-5">
          <p className="crm-section-label">
            Workload Snapshot
          </p>
          <h3 className="mt-2 text-[18px] font-semibold text-slate-900 dark:text-white">
            User roster and role control
          </h3>
          <div className="mt-5 overflow-x-auto">
            <table className="crm-table">
              <thead>
                <tr>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Assigned leads</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr
                    key={user.id}
                    className="border-t border-slate-200/80 dark:border-slate-800"
                  >
                    <td className="px-4 py-4">
                      <p className="font-semibold text-slate-900 dark:text-white">{user.name}</p>
                      <p className="text-slate-500 dark:text-slate-400">{user.email}</p>
                    </td>
                    <td className="px-4 py-4 text-slate-700 dark:text-slate-300">
                      {getRoleLabel(user.role)}
                    </td>
                    <td className="px-4 py-4 text-slate-700 dark:text-slate-300">
                      {leads.filter((lead) => lead.assignedAgentId === user.id).length}
                    </td>
                    <td className="px-4 py-4">
                      <select
                        value={user.status}
                        onChange={(event) =>
                          void setUserStatus(
                            user.id,
                            event.target.value as "online" | "away" | "offline",
                          )
                        }
                        className="crm-input py-2"
                      >
                        <option value="online">online</option>
                        <option value="away">away</option>
                        <option value="offline">offline</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <p className="crm-section-label">
          Top performing agents
        </p>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {analytics.topAgents.slice(0, 5).map((agent) => (
            <div key={agent.id} className="crm-subtle-card p-4">
              <p className="font-semibold text-slate-900 dark:text-white">{agent.name}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge className="bg-cyan-100 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300">
                  {agent.calls} calls
                </Badge>
                <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                  {agent.conversions} conversions
                </Badge>
              </div>
              <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                Callback completion {agent.callbackCompletionRate}%
              </p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
