import assert from "node:assert/strict";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  contextReductionProfile,
  httpProfile,
  observerProfile,
  prefixProfile,
  profile,
  run,
  transportProfile,
} from "../runner.mjs";

const here = fileURLToPath(import.meta.url);
const root = resolve(here, "..", "..");
const fixture = resolve(root, "test", "fixture-adapter.mjs");
const spec = resolve(root, "test", "fixtures", "spec");
const adapter = [process.execPath, fixture];
const transportAdapter = [process.execPath, resolve(root, "test", "transport-fixture-server.mjs")];

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

describe("prefix-evaluation runner", () => {
  it("executes selected lineage cases and excludes carrier-reduction cases", () => {
    const report = run({ spec, command: adapter, revision: "test", profile: prefixProfile });
    assert.equal(report.profile, prefixProfile);
    assert.equal(report.passed, 3);
    assert.deepEqual(
      report.results.map((result) => result.id),
      ["PFX-001", "PFX-009", "PFX-010"],
    );
  });

  it("rejects a mismatched prefix implementation outcome", () => {
    assert.throws(
      () =>
        run({ spec, command: [...adapter, "--wrong"], revision: "test", profile: prefixProfile }),
      /PFX-001/,
    );
  });
});

describe("context-reduction runner", () => {
  it("executes selected carrier-reduction cases through a JSON Lines adapter", () => {
    const report = run({
      spec,
      command: adapter,
      revision: "test",
      profile: contextReductionProfile,
    });
    assert.equal(report.profile, contextReductionProfile);
    assert.equal(report.passed, 3);
    assert.deepEqual(
      report.results.map((result) => result.id),
      ["PFX-012", "PFX-013", "PFX-020"],
    );
  });

  it("rejects an unsafe context-reduction result", () => {
    assert.throws(
      () =>
        run({
          spec,
          command: [...adapter, "--wrong"],
          revision: "test",
          profile: contextReductionProfile,
        }),
      /PFX-012/,
    );
  });
});

describe("HTTP client-confirmation runner", () => {
  it("executes response/parser cases and excludes redirect forwarding", () => {
    const report = run({ spec, command: adapter, revision: "test", profile: httpProfile });
    assert.equal(report.profile, httpProfile);
    assert.equal(report.passed, 2);
    assert.deepEqual(
      report.results.map((result) => result.id),
      ["HTTP-001", "HTTP-009"],
    );
  });

  it("rejects a mismatched HTTP client result", () => {
    assert.throws(
      () => run({ spec, command: [...adapter, "--wrong"], revision: "test", profile: httpProfile }),
      /HTTP-001/,
    );
  });
});

describe("HTTP observer runner", () => {
  it("executes fixed-cut observer cases through a JSON Lines adapter", () => {
    const report = run({ spec, command: adapter, revision: "test", profile: observerProfile });
    assert.equal(report.profile, observerProfile);
    assert.equal(report.passed, 2);
    assert.deepEqual(
      report.results.map((result) => result.id),
      ["OBS-001", "OBS-002"],
    );
  });

  it("rejects a mismatched observer result", () => {
    assert.throws(
      () =>
        run({
          spec,
          command: [...adapter, "--wrong"],
          revision: "test",
          profile: observerProfile,
        }),
      /OBS-001/,
    );
  });
});

describe("HTTP transport-server runner", () => {
  it("sends raw loopback field lines to a test-only server adapter", async () => {
    const report = await run({
      spec,
      command: transportAdapter,
      revision: "test",
      profile: transportProfile,
    });
    assert.equal(report.profile, transportProfile);
    assert.equal(report.passed, 2);
    assert.deepEqual(
      report.results.map((result) => result.id),
      ["TRN-001", "TRN-003"],
    );
  });

  it("rejects a mismatched transport response", async () => {
    await assert.rejects(
      run({
        spec,
        command: [...transportAdapter, "--wrong"],
        revision: "test",
        profile: transportProfile,
      }),
      /TRN-001/,
    );
  });

  it("bounds transport readiness and response bytes", async () => {
    await assert.rejects(
      run({
        spec,
        command: [...transportAdapter, "--oversized-ready"],
        revision: "test",
        profile: transportProfile,
      }),
      /readiness exceeds output limit/,
    );
    await assert.rejects(
      run({
        spec,
        command: [...transportAdapter, "--large-response"],
        revision: "test",
        profile: transportProfile,
      }),
      /response exceeds output limit/,
    );
  });
});
