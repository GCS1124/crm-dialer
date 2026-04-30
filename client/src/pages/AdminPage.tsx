import { useMemo, useState } from "react";

import { SipProfileForm } from "../components/softphone/SipProfileForm";
import { Badge } from "../components/shared/Badge";
import { Button } from "../components/shared/Button";
import { Card } from "../components/shared/Card";
import { MetricCard } from "../components/shared/MetricCard";
import { PageHeader } from "../components/shared/PageHeader";
import { useAppState } from "../hooks/useAppState";
import { getRoleLabel } from "../lib/utils";
import type { CreateSipProfileInput, UpdateSipProfileInput, UserRole } from "../types";

const roleOptions: UserRole[] = ["admin", "team_leader", "agent"];

type BannerState =
  | {
      tone: "info" | "error";
      text: string;
    }
  | null;

export function AdminPage() {
  const {
    analytics,
    assignSipProfileToUser,
    createSipProfile,
    currentUser,
    deleteSipProfile,
    deleteUser,
    inviteUser,
    leads,
    setUserStatus,
    sipProfiles,
    updateSipProfile,
    users,
  } = useAppState();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>("agent");
  const [team, setTeam] = useState("North America SDR");
  const [timezone, setTimezone] = useState("America/New_York");
  const [title, setTitle] = useState("Outbound Agent");
  const [banner, setBanner] = useState<BannerState>(null);
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [busyProfileId, setBusyProfileId] = useState<string | null>(null);

  const editingProfile = sipProfiles.find((profile) => profile.id === editingProfileId) ?? null;
  const profileAssignments = useMemo(() => {
    return sipProfiles.reduce<Record<string, number>>((accumulator, profile) => {
      accumulator[profile.id] = users.filter((user) => user.activeSipProfileId === profile.id).length;
      return accumulator;
    }, {});
  }, [sipProfiles, users]);

  const handleCreateUser = async () => {
    if (!name.trim() || !email.trim()) {
      setBanner({
        tone: "error",
        text: "Name and email are required.",
      });
      return;
    }

    setIsCreatingUser(true);
    setBanner(null);

    try {
      const result = await inviteUser({
        name: name.trim(),
        email: email.trim(),
        role,
        team: team.trim(),
        timezone: timezone.trim(),
        title: title.trim(),
      });

      setBanner({
        tone: "info",
        text: `Created ${result.user.name}. Temporary password: ${result.temporaryPassword}`,
      });
      setName("");
      setEmail("");
      setRole("agent");
      setTeam("North America SDR");
      setTimezone("America/New_York");
      setTitle("Outbound Agent");
    } catch (error) {
      setBanner({
        tone: "error",
        text: error instanceof Error ? error.message : "Unable to create that user.",
      });
    } finally {
      setIsCreatingUser(false);
    }
  };

  const handleSaveSipProfile = async (input: CreateSipProfileInput) => {
    setBanner(null);

    if (editingProfile) {
      const updateInput: UpdateSipProfileInput = {
        ...input,
        sipPassword: input.sipPassword.trim() || undefined,
      };
      await updateSipProfile(editingProfile.id, updateInput);
      setEditingProfileId(null);
      setBanner({
        tone: "info",
        text: `Updated SIP profile ${input.label}.`,
      });
      return;
    }

    await createSipProfile(input);
    setBanner({
      tone: "info",
      text: `Created SIP profile ${input.label}.`,
    });
  };

  const handleDeleteSipProfile = async (profileId: string, label: string) => {
    if (!window.confirm(`Delete SIP profile "${label}"?`)) {
      return;
    }

    setBusyProfileId(profileId);
    setBanner(null);
    try {
      await deleteSipProfile(profileId);
      if (editingProfileId === profileId) {
        setEditingProfileId(null);
      }
      setBanner({
        tone: "info",
        text: `Deleted SIP profile ${label}.`,
      });
    } catch (error) {
      setBanner({
        tone: "error",
        text: error instanceof Error ? error.message : "Unable to delete that SIP profile.",
      });
    } finally {
      setBusyProfileId(null);
    }
  };

  const handleAssignSipProfile = async (userId: string, profileId: string | null) => {
    setBusyUserId(userId);
    setBanner(null);
    try {
      await assignSipProfileToUser(userId, profileId);
    } catch (error) {
      setBanner({
        tone: "error",
        text: error instanceof Error ? error.message : "Unable to assign that SIP profile.",
      });
    } finally {
      setBusyUserId(null);
    }
  };

  const handleDeleteUser = async (userId: string, nameToDelete: string) => {
    if (!window.confirm(`Remove ${nameToDelete} from the workspace?`)) {
      return;
    }

    setBusyUserId(userId);
    setBanner(null);
    try {
      await deleteUser(userId);
      setBanner({
        tone: "info",
        text: `Removed ${nameToDelete} from the workspace.`,
      });
    } catch (error) {
      setBanner({
        tone: "error",
        text: error instanceof Error ? error.message : "Unable to remove that user.",
      });
    } finally {
      setBusyUserId(null);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Admin"
        title="Admin control center"
        description="Provision users, manage SIP records, and assign browser calling credentials."
      />

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Admins" value={users.filter((user) => user.role === "admin").length} />
        <MetricCard
          label="Team leaders"
          value={users.filter((user) => user.role === "team_leader").length}
        />
        <MetricCard label="Agents" value={users.filter((user) => user.role === "agent").length} />
        <MetricCard label="SIP profiles" value={sipProfiles.length} />
      </div>

      {banner ? (
        <Card
          className={
            banner.tone === "error"
              ? "border border-rose-200 bg-rose-50 text-sm text-rose-700"
              : "border border-cyan-300/60 bg-cyan-50/80 text-sm text-cyan-700"
          }
        >
          {banner.text}
        </Card>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[0.82fr_1.18fr]">
        <Card className="space-y-4 p-5">
          <div>
            <p className="crm-section-label">Create user</p>
            <h3 className="mt-2 text-[18px] font-semibold text-slate-900 dark:text-white">
              Add workspace access
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
            <Button disabled={isCreatingUser} onClick={() => void handleCreateUser()}>
              {isCreatingUser ? "Creating..." : "Create user"}
            </Button>
          </div>
        </Card>

        <Card className="space-y-4 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="crm-section-label">SIP records</p>
              <h3 className="mt-2 text-[18px] font-semibold text-slate-900 dark:text-white">
                Manage browser calling credentials
              </h3>
            </div>
            <div className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-medium text-slate-600 dark:bg-slate-900 dark:text-slate-300">
              {sipProfiles.length} profiles
            </div>
          </div>

          <div className="space-y-3">
            {sipProfiles.length ? (
              sipProfiles.map((profile) => (
                <div
                  key={profile.id}
                  className="crm-subtle-card flex items-start justify-between gap-4 px-4 py-4"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        {profile.label}
                      </p>
                      <Badge className="bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300">
                        {profile.isShared ? "Shared" : "Private"}
                      </Badge>
                      <Badge className="bg-cyan-100 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300">
                        {profileAssignments[profile.id] ?? 0} assigned
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {profile.sipUsername}@{profile.sipDomain} · Caller ID {profile.callerId}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Password {profile.passwordPreview ?? "configured"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setEditingProfileId(profile.id)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={busyProfileId === profile.id}
                      onClick={() => void handleDeleteSipProfile(profile.id, profile.label)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <div className="crm-subtle-card px-4 py-4 text-sm text-slate-600 dark:text-slate-300">
                No SIP profiles are stored yet.
              </div>
            )}
          </div>

          <div className="border-t border-slate-200/80 pt-4 dark:border-slate-800">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                  {editingProfile ? `Edit ${editingProfile.label}` : "Create SIP profile"}
                </h4>
                <p className="mt-1 text-xs text-slate-500">
                  Profiles are only visible to admins. Users receive assignments but cannot inspect the credentials.
                </p>
              </div>
            </div>

            <SipProfileForm
              key={editingProfile?.id ?? "new-profile"}
              onSubmit={(input) => handleSaveSipProfile(input)}
              submitLabel={editingProfile ? "Save changes" : "Create SIP profile"}
              allowShared
              initialShared={editingProfile?.isShared ?? true}
              initialValues={
                editingProfile
                  ? {
                      label: editingProfile.label,
                      providerUrl: editingProfile.providerUrl,
                      sipDomain: editingProfile.sipDomain,
                      sipUsername: editingProfile.sipUsername,
                      callerId: editingProfile.callerId,
                      isShared: editingProfile.isShared,
                      sipPassword: "",
                    }
                  : undefined
              }
              passwordOptional={Boolean(editingProfile)}
              onCancel={editingProfile ? () => setEditingProfileId(null) : undefined}
            />
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="crm-section-label">Workspace roster</p>
            <h3 className="mt-2 text-[18px] font-semibold text-slate-900 dark:text-white">
              Assign SIP access and maintain users
            </h3>
          </div>
          <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
            Top agents: {analytics.topAgents.slice(0, 3).map((agent) => agent.name).join(", ") || "N/A"}
          </Badge>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="crm-table">
            <thead>
              <tr>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Assigned leads</th>
                <th className="px-4 py-3">SIP profile</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-t border-slate-200/80 dark:border-slate-800">
                  <td className="px-4 py-4">
                    <p className="font-semibold text-slate-900 dark:text-white">
                      {user.name}
                      {currentUser?.id === user.id ? " (You)" : ""}
                    </p>
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
                      value={user.activeSipProfileId ?? ""}
                      onChange={(event) =>
                        void handleAssignSipProfile(user.id, event.target.value || null)
                      }
                      disabled={busyUserId === user.id}
                      className="crm-input py-2"
                    >
                      <option value="">No SIP assigned</option>
                      {sipProfiles.map((profile) => (
                        <option key={profile.id} value={profile.id}>
                          {profile.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-4">
                    <select
                      value={user.status}
                      onChange={(event) =>
                        void setUserStatus(user.id, event.target.value as "online" | "away" | "offline")
                      }
                      className="crm-input py-2"
                    >
                      <option value="online">online</option>
                      <option value="away">away</option>
                      <option value="offline">offline</option>
                    </select>
                  </td>
                  <td className="px-4 py-4">
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={busyUserId === user.id || currentUser?.id === user.id}
                      onClick={() => void handleDeleteUser(user.id, user.name)}
                    >
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
