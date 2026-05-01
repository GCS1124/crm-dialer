import * as localRepository from "./localRepository.js";
import * as supabaseRepository from "./appRepository.js";
import { getDataBackend } from "./runtimeMode.js";
import type {
  ApiLeadImportRecord,
  ApiLeadPriority,
  ApiLeadStatus,
  ApiSipProfile,
  ApiUser,
  QueueFilter,
  QueueProgressRecord,
  QueueSort,
  CreateCallLogInput,
  CreateSipProfileInput,
  CreateUserInput,
  SaveDispositionInput,
  SaveFailedCallAttemptInput,
  SignupInput,
  StoredSipProfile,
  UpdateSipProfileInput,
} from "../types/index.js";

async function getRepository() {
  return (await getDataBackend()) === "local" ? localRepository : supabaseRepository;
}

export async function getUserByEmail(email: string) {
  return (await getRepository()).getUserByEmail(email);
}

export async function getUserByAuthUserId(authUserId: string) {
  return (await getRepository()).getUserByAuthUserId(authUserId);
}

export async function getUserById(userId: string) {
  return (await getRepository()).getUserById(userId);
}

export async function syncAuthUserLink(email: string, authUserId: string) {
  return (await getRepository()).syncAuthUserLink(email, authUserId);
}

export async function getWorkspace(currentUser: ApiUser) {
  return (await getRepository()).getWorkspace(currentUser);
}

export async function listUsers() {
  return (await getRepository()).listUsers();
}

export async function listLeads(currentUser: ApiUser) {
  return (await getRepository()).listLeads(currentUser);
}

export async function getQueueProgress(currentUser: ApiUser, queueKey?: string): Promise<QueueProgressRecord[]> {
  return (await getRepository()).getQueueProgress(currentUser, queueKey);
}

export async function saveQueueProgress(
  input: {
    queueScope: string;
    queueSort: QueueSort;
    queueFilter: QueueFilter;
    currentLeadId: string | null;
    currentPhoneIndex: number;
  },
  currentUser: ApiUser,
) {
  return (await getRepository()).saveQueueProgress(input, currentUser);
}

export async function resetQueueProgress(
  currentUser: ApiUser,
  queueScope: string,
  queueSort: QueueSort,
  queueFilter: QueueFilter,
) {
  return (await getRepository()).resetQueueProgress(currentUser, queueScope, queueSort, queueFilter);
}

export async function listCallLogs(currentUser: ApiUser) {
  return (await getRepository()).listCallLogs(currentUser);
}

export async function createManualCallLog(input: CreateCallLogInput, currentUser: ApiUser) {
  return (await getRepository()).createManualCallLog(input, currentUser);
}

export async function updateManualCallLog(
  callId: string,
  input: CreateCallLogInput,
  currentUser: ApiUser,
) {
  return (await getRepository()).updateManualCallLog(callId, input, currentUser);
}

export async function deleteManualCallLog(callId: string, currentUser: ApiUser) {
  return (await getRepository()).deleteManualCallLog(callId, currentUser);
}

export async function importLeads(
  records: ApiLeadImportRecord[],
  currentUser: ApiUser,
  assignToUserId?: string,
) {
  return (await getRepository()).importLeads(records, currentUser, assignToUserId);
}

export async function assignLeadToUser(
  leadId: string,
  userId: string,
  currentUser: ApiUser,
) {
  return (await getRepository()).assignLeadToUser(leadId, userId, currentUser);
}

export async function updateLeadStatuses(
  leadIds: string[],
  status: ApiLeadStatus,
  currentUser: ApiUser,
) {
  return (await getRepository()).updateLeadStatuses(leadIds, status, currentUser);
}

export async function deleteLeadRecords(leadIds: string[], currentUser: ApiUser) {
  return (await getRepository()).deleteLeadRecords(leadIds, currentUser);
}

export async function markLeadInvalid(leadId: string, currentUser: ApiUser) {
  return (await getRepository()).markLeadInvalid(leadId, currentUser);
}

export async function saveDisposition(input: SaveDispositionInput, currentUser: ApiUser) {
  return (await getRepository()).saveDisposition(input, currentUser);
}

export async function saveFailedCallAttempt(
  input: SaveFailedCallAttemptInput,
  currentUser: ApiUser,
) {
  return (await getRepository()).saveFailedCallAttempt(input, currentUser);
}

export async function rescheduleLeadCallback(
  leadId: string,
  callbackAt: string,
  priority: ApiLeadPriority,
  currentUser: ApiUser,
) {
  return (await getRepository()).rescheduleLeadCallback(leadId, callbackAt, priority, currentUser);
}

export async function completeLeadCallback(leadId: string, currentUser: ApiUser) {
  return (await getRepository()).completeLeadCallback(leadId, currentUser);
}

export async function reopenLead(leadId: string, currentUser: ApiUser) {
  return (await getRepository()).reopenLead(leadId, currentUser);
}

export async function createWorkspaceUser(input: CreateUserInput, currentUser: ApiUser) {
  return (await getRepository()).createWorkspaceUser(input, currentUser);
}

export async function createPublicSignup(input: SignupInput) {
  return (await getRepository()).createPublicSignup(input);
}

export async function updateWorkspaceUserStatus(
  userId: string,
  status: "online" | "away" | "offline",
  currentUser: ApiUser,
) {
  return (await getRepository()).updateWorkspaceUserStatus(userId, status, currentUser);
}

export async function deleteWorkspaceUser(userId: string, currentUser: ApiUser) {
  return (await getRepository()).deleteWorkspaceUser(userId, currentUser);
}

export async function listSipProfiles(currentUser: ApiUser): Promise<ApiSipProfile[]> {
  return (await getRepository()).listSipProfiles(currentUser);
}

export async function getActiveSipProfile(currentUser: ApiUser): Promise<StoredSipProfile | null> {
  return (await getRepository()).getActiveSipProfile(currentUser);
}

export async function createSipProfile(input: CreateSipProfileInput, currentUser: ApiUser) {
  return (await getRepository()).createSipProfile(input, currentUser);
}

export async function setActiveSipProfile(profileId: string, currentUser: ApiUser) {
  return (await getRepository()).setActiveSipProfile(profileId, currentUser);
}

export async function updateSipProfile(
  profileId: string,
  input: UpdateSipProfileInput,
  currentUser: ApiUser,
) {
  return (await getRepository()).updateSipProfile(profileId, input, currentUser);
}

export async function deleteSipProfile(profileId: string, currentUser: ApiUser) {
  return (await getRepository()).deleteSipProfile(profileId, currentUser);
}

export async function assignSipProfileToUser(
  userId: string,
  profileId: string | null,
  currentUser: ApiUser,
) {
  return (await getRepository()).assignSipProfileToUser(userId, profileId, currentUser);
}

export async function getVoiceIdentity(user: ApiUser) {
  return (await getRepository()).getVoiceIdentity(user);
}
