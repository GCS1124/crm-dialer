import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLeadDialNumbers,
  extractDialableNumbers,
  normalizeDialableNumber,
  normalizeLeadImportPhoneFields,
} from "../src/services/phoneNumberService.js";

test("normalizes a single phone number without changing the dial target", () => {
  assert.equal(normalizeDialableNumber(" +1 (415) 555-0101 "), "+14155550101");
  assert.deepEqual(extractDialableNumbers(" +1 (415) 555-0101 "), ["+14155550101"]);
});

test("splits multiple numbers instead of concatenating them", () => {
  assert.deepEqual(
    extractDialableNumbers("+1 (415) 555-0101, +1 (212) 555-0102"),
    ["+14155550101", "+12125550102"],
  );
});

test("rejects merged 20-digit strings", () => {
  assert.deepEqual(extractDialableNumbers("12345678901234567890"), []);
});

test("builds dialable numbers from raw lead fields without merging separate entries", () => {
  const numbers = buildLeadDialNumbers({
    phone: "415-555-0101 / 415-555-0102",
    altPhone: "(312) 555-0103",
  });

  assert.deepEqual(numbers, ["4155550101", "4155550102", "3125550103"]);
});

test("splits imported lead phones into primary and alternate fields", () => {
  const fields = normalizeLeadImportPhoneFields({
    phone: "+1 (415) 555-0101, +1 (212) 555-0102",
    altPhone: "",
  });

  assert.deepEqual(fields, {
    phone: "+14155550101",
    altPhone: "+12125550102",
    phoneNumbers: ["+14155550101", "+12125550102"],
  });
});
