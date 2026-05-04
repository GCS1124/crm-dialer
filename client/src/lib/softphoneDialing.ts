export function sanitizeDialPadInput(value: string) {
  return value.replace(/[^\d+*#]/g, "");
}

export function inferDialCountryId(input: {
  callerId?: string | null;
  timezone?: string | null;
}) {
  if (/(kolkata|calcutta)/i.test(input.timezone ?? "")) {
    return "IN";
  }

  const callerDigits = input.callerId?.replace(/[^\d]/g, "") ?? "";

  if (callerDigits.length === 11 && callerDigits.startsWith("1")) {
    return "US";
  }

  if (callerDigits.length === 12 && callerDigits.startsWith("91")) {
    return "IN";
  }

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
  const dialTarget = sanitizeDialPadInput(phone.trim());
  const dialDigits = dialTarget.replace(/[^\d]/g, "");
  const callingCode = options.callingCode?.replace(/[^\d]/g, "") ?? "";

  if (!dialTarget) {
    return "";
  }

  if (dialTarget.startsWith("+")) {
    return dialTarget;
  }

  if (dialDigits.length <= 6) {
    return dialDigits;
  }

  if (!callingCode) {
    return dialDigits;
  }

  const expectedLength = options.nationalNumberLength ?? null;

  if (
    callingCode === "91" &&
    expectedLength === 10 &&
    dialDigits.length === expectedLength &&
    /^[6-9]\d{9}$/.test(dialDigits)
  ) {
    return `0${dialDigits}`;
  }

  if (
    callingCode === "91" &&
    expectedLength === 10 &&
    dialDigits.length === callingCode.length + expectedLength &&
    dialDigits.startsWith(callingCode) &&
    /^[6-9]\d{9}$/.test(dialDigits.slice(callingCode.length))
  ) {
    return `0${dialDigits.slice(callingCode.length)}`;
  }

  if (dialDigits.startsWith(callingCode)) {
    return dialDigits;
  }

  if (expectedLength && dialDigits.length !== expectedLength) {
    return dialDigits;
  }

  return `${callingCode}${dialDigits}`;
}

export function formatDialNumberForSession(
  phone: string,
  options: {
    callerId?: string | null;
    timezone?: string | null;
  },
) {
  const countryId = inferDialCountryId(options);
  const country =
    countryId === "IN"
      ? { callingCode: "91", nationalNumberLength: 10 }
      : { callingCode: "1", nationalNumberLength: 10 };

  return formatDialNumberForCountry(phone, country);
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

  if (
    isLikelyPhoneNumber &&
    prefixDigits === "0" &&
    digits.startsWith("91") &&
    digits.length === 12 &&
    /^[6-9]\d{9}$/.test(digits.slice(2))
  ) {
    digits = digits.slice(2);
  }

  if (isLikelyPhoneNumber && prefixDigits) {
    const shouldPrefix =
      prefixDigits.length === 1
        ? phoneHasPlus || !(digits.length === 11 && digits.startsWith(prefixDigits))
        : !digits.startsWith(prefixDigits);

    if (shouldPrefix) {
      digits = `${prefixDigits}${digits}`;
    }
  }

  const includePlus = isLikelyPhoneNumber && (prefixHasPlus || (phoneHasPlus && !prefixDigits));
  const userPart = includePlus ? `+${digits}` : digits;
  const baseTarget = `sip:${userPart}@${sipDomain}`;
  return digits.length >= 8 ? `${baseTarget};user=phone` : baseTarget;
}
