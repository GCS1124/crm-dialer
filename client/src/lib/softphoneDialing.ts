export function sanitizeDialPadInput(value: string) {
  return value.replace(/[^\d+*#]/g, "");
}

export function normalizeDialTarget(phone: string, sipDomain: string, dialPrefix = "") {
  const normalizedPhone = phone.replace(/[^\d+]/g, "");
  const normalizedPrefix = dialPrefix.replace(/[^\d+]/g, "");

  const phoneHasPlus = normalizedPhone.startsWith("+");
  const prefixHasPlus = normalizedPrefix.startsWith("+");

  const phoneDigits = phoneHasPlus ? normalizedPhone.slice(1) : normalizedPhone;
  const prefixDigits = prefixHasPlus ? normalizedPrefix.slice(1) : normalizedPrefix;

  const isLikelyPhoneNumber = phoneHasPlus || phoneDigits.length >= 8;
  let digits = phoneDigits;

  if (isLikelyPhoneNumber && prefixDigits) {
    const shouldPrefix =
      prefixDigits.length === 1
        ? phoneHasPlus || !(digits.length === 11 && digits.startsWith(prefixDigits))
        : !digits.startsWith(prefixDigits);

    if (shouldPrefix) {
      digits = `${prefixDigits}${digits}`;
    }
  }

  const includePlus = isLikelyPhoneNumber && prefixHasPlus;
  const userPart = includePlus ? `+${digits}` : digits;
  const baseTarget = `sip:${userPart}@${sipDomain}`;
  return digits.length >= 8 ? `${baseTarget};user=phone` : baseTarget;
}
