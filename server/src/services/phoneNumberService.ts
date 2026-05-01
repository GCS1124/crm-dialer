function stripExtension(value: string) {
  return value.replace(/\s*(?:ext\.?|extension|x)\s*\d+$/i, "").trim();
}

function dedupePreserveOrder(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    if (seen.has(value)) {
      return false;
    }
    seen.add(value);
    return true;
  });
}

export function normalizeDialableNumber(rawValue: string): string | null {
  const trimmed = stripExtension(rawValue.trim());
  if (!trimmed) {
    return null;
  }

  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) {
    return null;
  }

  return hasPlus ? `+${digits}` : digits;
}

export function extractDialableNumbers(rawValue: string): string[] {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return [];
  }

  const segments = trimmed
    .split(/[,\n;|/]+/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  const candidates = segments.length > 1 ? segments : [trimmed];
  return dedupePreserveOrder(
    candidates.flatMap((candidate) => {
      const normalized = normalizeDialableNumber(candidate);
      return normalized ? [normalized] : [];
    }),
  );
}

export function buildLeadDialNumbers(input: {
  phone: string;
  altPhone: string;
  phoneNumbers?: string[] | null;
}) {
  const sourceNumbers =
    input.phoneNumbers?.length && input.phoneNumbers.length > 0
      ? input.phoneNumbers
      : [input.phone, input.altPhone];

  return dedupePreserveOrder(
    sourceNumbers.flatMap((value) => extractDialableNumbers(value)),
  );
}
