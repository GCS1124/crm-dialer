import assert from "node:assert/strict";
import test from "node:test";

import { isMissingSupabaseTableError } from "./supabaseErrors.ts";

test("recognizes missing Supabase table errors", () => {
  const error = {
    status: 404,
    message: 'relation "sip_profiles" does not exist',
  };

  assert.equal(isMissingSupabaseTableError(error), true);
});
