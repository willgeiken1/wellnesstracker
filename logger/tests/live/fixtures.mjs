import { test as base, expect } from "@playwright/test";
import { installAllowlist } from "./allowlist.mjs";
import { liveGate, redactText, secretVariants } from "./gate.mjs";

function secretsIn(env) {
  const gate = liveGate(env);
  return secretVariants([gate.email, gate.password, gate.serviceRole]);
}

export const test = base.extend({
  // Registered first so it tears down last, after the page fixture has attached
  // its failure snapshot. The snapshot can contain the password field.
  _scrubSecrets: [async ({}, use, testInfo) => {
    await use();
    const secrets = secretsIn(process.env);
    const scrub = (value) => redactText(value, secrets);
    for (const err of testInfo.errors || []) {
      if (err.message) err.message = scrub(err.message);
      if (err.stack) err.stack = scrub(err.stack);
    }
    if (Array.isArray(testInfo.attachments)) {
      testInfo.attachments = testInfo.attachments.filter((item) => !/error-context|trace|screenshot|video/i.test(item.name || ""));
    }
  }, { auto: true }],

  context: async ({ context }, use) => {
    const allow = await installAllowlist(context);
    try {
      await use(context);
    } finally {
      allow.assertClean();
    }
  },
});

export { expect };
