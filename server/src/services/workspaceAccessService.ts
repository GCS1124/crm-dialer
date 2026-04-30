import type { ApiSipProfile, ApiUser } from "../types/index.js";

interface SipWorkspaceExposureInput {
  profiles: ApiSipProfile[];
  activeProfile: ApiSipProfile | null;
  selectionRequired: boolean;
}

export function canManageWorkspaceAdmin(currentUser: Pick<ApiUser, "role"> | null | undefined) {
  return currentUser?.role === "admin";
}

export function buildSipWorkspaceExposure(
  currentUser: Pick<ApiUser, "role">,
  input: SipWorkspaceExposureInput,
): SipWorkspaceExposureInput {
  if (canManageWorkspaceAdmin(currentUser)) {
    return input;
  }

  return {
    profiles: [],
    activeProfile: null,
    selectionRequired: false,
  };
}
