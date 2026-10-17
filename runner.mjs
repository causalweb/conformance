import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

const here = fileURLToPath(import.meta.url);
const root = resolve(here, "..");
const PROFILE = "evidence-verification-v1";
const PREFIX_PROFILE = "prefix-evaluation-v1";

function readJson(path) {
  const value = JSON.parse(readFileSync(path, "utf8"));
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${path} must contain a JSON object`);
  return value;
}

function object(value, name) {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${name} must be an object`);
  return value;
}

function string(value, name) {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${name} must be a string`);
  return value;
}

function expectedEvidence(value) {
  if (!["accept", "expired", "reject-request", "unsupported"].includes(value))
    throw new Error(`unsupported expected outcome ${value}`);
  return value;
}

function expectedPosition(value) {
  if (!["satisfied", "reject-request"].includes(value))
    throw new Error(`unsupported expected position outcome ${value}`);
  return value;
}

function profileFile(name) {
  if (![PROFILE, PREFIX_PROFILE].includes(name)) throw new Error(`unsupported profile ${name}`);
  return resolve(root, "profiles", `${name}.json`);
}

function invoke(command, input) {
  const [program, ...arguments_] = command;
  if (!program) throw new Error("an adapter command is required after --");
  const result = spawnSync(program, arguments_, {
    encoding: "utf8",
    input: `${JSON.stringify(input)}\n`,
    maxBuffer: 1024 * 1024,
    timeout: 5000,
    windowsHide: true,
  });
  if (result.error) throw new Error(`adapter did not start: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`adapter exited ${result.status}: ${result.stderr}`);
  const lines = result.stdout.split(/\r?\n/).filter(Boolean);
  if (lines.length !== 1) throw new Error("adapter must emit exactly one JSON line per request");
  return object(JSON.parse(lines[0]), "adapter response");
}

function runEvidence({ spec, command, revision }) {
  const profile = readJson(profileFile(PROFILE));
  if (profile.format !== "causal-web-conformance-evidence-verification-v1")
    throw new Error("unsupported local profile format");
  const configured = object(profile.vectors, "profile vectors");
  const results = [];
  for (const [name, execution] of Object.entries(configured)) {
    const vector = readJson(resolve(spec, "test-vectors", name));
    if (!Array.isArray(vector.cases)) throw new Error(`${name} lacks cases`);
    const settings = object(execution, `profile ${name}`);
    for (const testCase of vector.cases) {
      const caseObject = object(testCase, `${name} case`);
      const id = string(caseObject.id, `${name} case id`);
      const want = expectedEvidence(caseObject.expected);
      const response = invoke(command, {
        version: 1,
        profile: PROFILE,
        vector_file: name,
        vector,
        case: caseObject,
        trust: {
          issuer: string(vector.expected_issuer, `${name} expected_issuer`),
          subject: string(vector.expected_subject, `${name} expected_subject`),
          audience: string(vector.expected_audience, `${name} expected_audience`),
          public_jwk: object(vector.public_jwk, `${name} public_jwk`),
          domains: settings.domains,
          maximum_lifetime_seconds: settings.maximum_lifetime_seconds,
          clock_skew_seconds: settings.clock_skew_seconds,
          now: vector.validation_time,
        },
      });
      if (response.id !== id || response.outcome !== want)
        throw new Error(`${id}: expected ${want}, adapter returned ${JSON.stringify(response)}`);
      results.push({ id, outcome: want });
    }
  }
  return {
    format: "causal-web-conformance-report-v1",
    profile: PROFILE,
    spec_revision: revision,
    passed: results.length,
    results,
  };
}

function prefixExpected(value, id) {
  const entry = object(value, `${id} expected`);
  const outcome = string(entry.outcome, `${id} expected outcome`);
  if (
    !["satisfied", "unsatisfied", "unknown", "unsupported", "expired", "failed"].includes(outcome)
  )
    throw new Error(`${id} has an unsupported expected outcome`);
  const expected = { outcome };
  if (entry.disposition !== undefined) {
    const disposition = string(entry.disposition, `${id} expected disposition`);
    if (!["applied", "irrelevant"].includes(disposition))
      throw new Error(`${id} has an unsupported expected disposition`);
    expected.disposition = disposition;
  }
  return expected;
}

function runPrefix({ spec, command, revision }) {
  const profile = readJson(profileFile(PREFIX_PROFILE));
  if (profile.format !== "causal-web-conformance-prefix-evaluation-v1")
    throw new Error("unsupported local prefix profile format");
  const vectorName = string(profile.vector, "prefix profile vector");
  const excluded = new Set(object(profile, "prefix profile").excluded_case_ids ?? []);
  if (![...excluded].every((id) => typeof id === "string"))
    throw new Error("prefix excluded_case_ids must be strings");
  const vector = readJson(resolve(spec, "test-vectors", vectorName));
  if (vector.format !== "causal-web-prefix-evaluation-v1" || !Array.isArray(vector.cases))
    throw new Error(`${vectorName} is not a prefix evaluation vector`);
  const vectorIds = new Set(
    vector.cases.map((testCase) =>
      string(object(testCase, `${vectorName} case`).id, `${vectorName} case id`),
    ),
  );
  if ([...excluded].some((id) => !vectorIds.has(id)))
    throw new Error("prefix excluded_case_ids contains an unknown vector case");
  const results = [];
  for (const testCase of vector.cases) {
    const caseObject = object(testCase, `${vectorName} case`);
    const id = string(caseObject.id, `${vectorName} case id`);
    if (excluded.has(id)) continue;
    const response = invoke(command, {
      version: 1,
      profile: PREFIX_PROFILE,
      vector_file: vectorName,
      vector,
      case: caseObject,
    });
    if (response.id !== id) throw new Error(`${id}: adapter returned a mismatched id`);
    if (
      caseObject.kind === "position-validation" ||
      caseObject.kind === "position-validation-and-comparison"
    ) {
      const want = expectedPosition(caseObject.expected);
      if (response.outcome !== want)
        throw new Error(`${id}: expected ${want}, adapter returned ${JSON.stringify(response)}`);
      results.push({ id, outcome: want });
      continue;
    }
    const wants = caseObject.expected.map((value) => prefixExpected(value, id));
    const got = response.outcomes;
    if (!Array.isArray(got) || !isDeepStrictEqual(got, wants))
      throw new Error(
        `${id}: expected ${JSON.stringify(wants)}, adapter returned ${JSON.stringify(response)}`,
      );
    const aggregate = wants.every(({ outcome }) => outcome === "satisfied");
    if (response.aggregate_success !== aggregate || caseObject.aggregate_success !== aggregate)
      throw new Error(`${id}: aggregate success is inconsistent`);
    results.push({ id, outcomes: wants, aggregate_success: aggregate });
  }
  return {
    format: "causal-web-conformance-report-v1",
    profile: PREFIX_PROFILE,
    spec_revision: revision,
    passed: results.length,
    results,
  };
}

export function run({ spec, command, revision, profile = PROFILE }) {
  if (profile === PROFILE) return runEvidence({ spec, command, revision });
  if (profile === PREFIX_PROFILE) return runPrefix({ spec, command, revision });
  throw new Error(`unsupported profile ${profile}`);
}

function arguments_() {
  const values = process.argv.slice(2);
  const separator = values.indexOf("--");
  if (separator < 0)
    throw new Error("usage: node runner.mjs --spec PATH -- ADAPTER [ARGUMENT ...]");
  const options = values.slice(0, separator);
  if (options.length !== 2 && options.length !== 4)
    throw new Error("usage: node runner.mjs --spec PATH -- ADAPTER [ARGUMENT ...]");
  const specIndex = options.indexOf("--spec");
  const profileIndex = options.indexOf("--profile");
  if (
    specIndex < 0 ||
    specIndex + 1 >= options.length ||
    (profileIndex >= 0 && profileIndex + 1 >= options.length)
  )
    throw new Error(
      "usage: node runner.mjs --spec PATH [--profile PROFILE] -- ADAPTER [ARGUMENT ...]",
    );
  if (options.length === 4 && profileIndex < 0)
    throw new Error(
      "usage: node runner.mjs --spec PATH [--profile PROFILE] -- ADAPTER [ARGUMENT ...]",
    );
  return {
    spec: resolve(options[specIndex + 1]),
    profile: profileIndex < 0 ? PROFILE : options[profileIndex + 1],
    command: values.slice(separator + 1),
  };
}

if (resolve(process.argv[1] ?? "") === here) {
  try {
    const { spec, command, profile } = arguments_();
    const revision = readFileSync(resolve(root, "SPEC_REVISION"), "utf8").trim();
    if (!/^[0-9a-f]{40}$/.test(revision)) throw new Error("invalid local SPEC_REVISION");
    const actual = execFileSync("git", ["-C", spec, "rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim();
    if (actual !== revision)
      throw new Error("spec checkout is not the pinned revision; use an exact detached checkout");
    console.log(JSON.stringify(run({ spec, command, revision, profile })));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

export const profile = PROFILE;
export const prefixProfile = PREFIX_PROFILE;
export const localRoot = root;
export const vectorName = (path) => basename(path);
