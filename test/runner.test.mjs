import assert from "node:assert/strict";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { profile, run } from "../runner.mjs";

const here = fileURLToPath(import.meta.url);
const root = resolve(here, "..", "..");
const fixture = resolve(root, "test", "fixture-adapter.mjs");
const spec = resolve(root, "test", "fixtures", "spec");
const adapter = [process.execPath, fixture];

describe("evidence-verification runner", () => {
  it("executes every configured vector case through a JSON Lines adapter", () => {
    const report = run({ spec, command: adapter, revision: "test" });
    assert.equal(report.profile, profile);
    assert.equal(report.passed, 4);
    assert.deepEqual(
      report.results.map((result) => result.id),
      ["EVD-001", "EVD-002", "SEC-001", "SEC-002"],
    );
  });

  it("rejects a mismatched implementation outcome", () => {
    assert.throws(
      () => run({ spec, command: [...adapter, "--wrong"], revision: "test" }),
      /EVD-002/,
    );
  });
});
