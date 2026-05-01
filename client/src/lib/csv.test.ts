import assert from "node:assert/strict";
import test from "node:test";

import { parseLeadCsv } from "./csv";

test("skips the default template notes row without counting it as invalid", () => {
  const parsed = parseLeadCsv(`Full Name,Phone,Alt Phone,Email,Company,Job Title,Location,Source,Interest,Status
Alice Example,+1 (555) 111-2222,,,alice@example.com,Example Co,Director,Delhi,Referral,Outbound,new
Notes:,Phone supports E.164 (+91...) or digits; spaces/dashes are okay.,Last Contacted/Callback Time accept ISO or Excel dates.,Status must be one of the allowed values,Priority must be Low/Medium/High/Urgent,,,,,
`);

  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.invalidRows, 0);
  assert.equal(parsed.rows[0]?.fullName, "Alice Example");
  assert.equal(parsed.rows[0]?.phone, "+1 (555) 111-2222");
});

test("still counts a genuinely incomplete row as invalid", () => {
  const parsed = parseLeadCsv(`Full Name,Phone,Email
Valid Lead,555-111-2222,valid@example.com
Broken Lead,,broken@example.com
`);

  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.invalidRows, 1);
});
