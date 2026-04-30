import type { CallDisposition } from "../../types";

export function buildDispositionOutcomeSummary(
  disposition: CallDisposition,
  notes: string,
  leadName: string,
) {
  const trimmedNotes = notes.trim();
  const baseSummary = `${disposition} for ${leadName}.`;

  return trimmedNotes ? `${baseSummary} Notes: ${trimmedNotes}` : baseSummary;
}

export function isPostCallSaveDisabled(input: {
  saving: boolean;
  needsCallbackTime: boolean;
  callbackAt: string;
}) {
  return input.saving || (input.needsCallbackTime && !input.callbackAt);
}
