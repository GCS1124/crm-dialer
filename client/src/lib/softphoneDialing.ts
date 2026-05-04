export function sanitizeDialPadInput(value: string) {
  return value.replace(/[^\d+*#]/g, "");
}

export function inferDialCountryId(input: {
  callerId?: string | null;
  timezone?: string | null;
}) {
  return "US";
}

export function formatDialNumberForCountry(
  phone: string,
  options: {
    callingCode?: string | null;
    nationalNumberLength?: number | null;
  },
) {
  const dialTarget = sanitizeDialPadInput(phone.trim());
  const dialDigits = dialTarget.replace(/[^\d]/g, "");
  const callingCode = options.callingCode?.replace(/[^\d]/g, "") ?? "";

  if (!dialTarget) {
    return "";
  }

  if (dialTarget.startsWith("+") || dialDigits.length <= 6 || !callingCode) {
    return dialTarget;
  }

  if (dialDigits.startsWith(callingCode)) {
    return `+${dialDigits}`;
  }

  const expectedLength = options.nationalNumberLength ?? null;
  if (expectedLength && dialDigits.length !== expectedLength) {
    return dialDigits;
  }

  return `+${callingCode}${dialDigits}`;
}

export function formatManualDialNumberForCountry(
  phone: string,
  options: {
    callingCode?: string | null;
    nationalNumberLength?: number | null;
  },
) {
  return formatDialNumberForCountry(phone, options);
}

export function formatDialNumberForSession(
  phone: string,
  options: {
    callerId?: string | null;
    timezone?: string | null;
  },
) {
  void options;
  return formatDialNumberForCountry(phone, {
    callingCode: "1",
    nationalNumberLength: 10,
  });
}

export function normalizeDialTarget(phone: string, sipDomain: string, dialPrefix = "") {
  const normalizedPhone = phone.replace(/[^\d+]/g, "");
  const normalizedPrefix = dialPrefix.replace(/[^\d+]/g, "");

  const phoneHasPlus = normalizedPhone.startsWith("+");

  const phoneDigits = phoneHasPlus ? normalizedPhone.slice(1) : normalizedPhone;
  const prefixDigits = normalizedPrefix.startsWith("+") ? normalizedPrefix.slice(1) : normalizedPrefix;

  const isLikelyPhoneNumber = phoneHasPlus || phoneDigits.length >= 8;
  let digits = phoneDigits;

  if (isLikelyPhoneNumber && prefixDigits && !phoneHasPlus) {
    const shouldPrefix =
      prefixDigits.length === 1
        ? !(digits.length === 11 && digits.startsWith(prefixDigits))
        : !digits.startsWith(prefixDigits);

    if (shouldPrefix) {
      digits = `${prefixDigits}${digits}`;
    }
  }

  const baseTarget = `sip:${digits}@${sipDomain}`;
  return isLikelyPhoneNumber ? `${baseTarget};user=phone` : baseTarget;
}
