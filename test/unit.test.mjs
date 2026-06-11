import { test } from "node:test";
import assert from "node:assert/strict";
import { redactSecrets } from "../dist/lib/http.js";
import { buildA1 } from "../dist/providers/sheets.js";
import { loadConfig, enabledProviders } from "../dist/config.js";

test("redacts Stripe secret and restricted keys", () => {
  const input = "boom: sk_live_a1B2c3D4 and rk_test_Zz9 leaked";
  const out = redactSecrets(input);
  assert.ok(!out.includes("sk_live_"));
  assert.ok(!out.includes("rk_test_"));
  assert.ok(out.includes("[redacted]"));
});

test("redacts bearer tokens and HubSpot pats", () => {
  const out = redactSecrets("Authorization: Bearer pat-na1-abc-123 failed");
  assert.ok(!out.includes("pat-na1"));
});

test("redacts private key blocks", () => {
  const key = "-----BEGIN PRIVATE KEY-----\nMIIabc\n-----END PRIVATE KEY-----";
  const out = redactSecrets(`error dumping ${key} done`);
  assert.ok(!out.includes("MIIabc"));
});

test("buildA1 leaves bare ranges alone and quotes tabs", () => {
  assert.equal(buildA1("A1:D20"), "A1:D20");
  assert.equal(buildA1("A1:D20", "Q2 Pipeline"), "'Q2 Pipeline'!A1:D20");
  assert.equal(buildA1("A1", "Bob's Tab"), "'Bob''s Tab'!A1");
});

test("config: providers off without env, writes parse strictly", () => {
  const none = loadConfig({});
  assert.deepEqual(enabledProviders(none), []);
  assert.equal(none.allowWrites, false);
  const yes = loadConfig({ CONNECTOR_ALLOW_WRITES: "TRUE", STRIPE_API_KEY: "sk_test_x" });
  assert.equal(yes.allowWrites, true);
  assert.deepEqual(enabledProviders(yes), ["stripe"]);
  const no = loadConfig({ CONNECTOR_ALLOW_WRITES: "1" });
  assert.equal(no.allowWrites, false);
});

test("config: inline google service account parses and unescapes key", () => {
  const cfg = loadConfig({
    GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({
      client_email: "svc@project.iam.gserviceaccount.com",
      private_key: "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----",
    }),
  });
  assert.ok(cfg.googleServiceAccount);
  assert.ok(cfg.googleServiceAccount.private_key.includes("\n"));
  assert.deepEqual(enabledProviders(cfg), ["google-sheets"]);
});
