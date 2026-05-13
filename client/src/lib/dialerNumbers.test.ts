import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLeadDestinationOptions,
  buildWorkspaceDestinationOptions,
} from "./dialerNumbers";

test("builds lead destination options in order and deduplicates repeated numbers", () => {
  const options = buildLeadDestinationOptions({
    phone: "4407969582",
    altPhone: "4407969582",
    phoneNumbers: ["4407969582", "14155550123"],
  });

  assert.deepEqual(options, [
    {
      value: "4407969582",
      label: "Phone 1 · 440-796-9582",
      phoneIndex: 0,
    },
    {
      value: "14155550123",
      label: "Phone 2 · +1 415 555 0123",
      phoneIndex: 1,
    },
  ]);
});

test("builds workspace destination options from unique lead numbers", () => {
  const options = buildWorkspaceDestinationOptions([
    {
      fullName: "Lukas Martin",
      phone: "4407969582",
      altPhone: "3105551111",
      phoneNumbers: ["4407969582", "3105551111"],
    },
    {
      fullName: "Sarah Christofek",
      phone: "3105551111",
      altPhone: "",
      phoneNumbers: [],
    },
  ]);

  assert.deepEqual(options, [
    {
      value: "4407969582",
      label: "Lukas Martin · 440-796-9582",
    },
    {
      value: "3105551111",
      label: "Lukas Martin · 310-555-1111",
    },
  ]);
});
