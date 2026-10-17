import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(import.meta.url);
const root = resolve(here, "..");
const PROFILE = "evidence-verification-v1";

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

function expected(value) {
  if (!["accept", "expired", "reject-request", "unsupported"].includes(value))
    throw new Error(`unsupported expected outcome ${value}`);
  return value;
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

export function run({ spec, command, revision }) {
  const profile = readJson(resolve(root, "profiles", "evidence-verification-v1.json"));
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
      const want = expected(caseObject.expected);
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

function arguments_() {
  const values = process.argv.slice(2);
  const separator = values.indexOf("--");
  if (separator < 0)
    throw new Error("usage: node runner.mjs --spec PATH -- ADAPTER [ARGUMENT ...]");
  const options = values.slice(0, separator);
  if (options.length !== 2 || options[0] !== "--spec")
    throw new Error("usage: node runner.mjs --spec PATH -- ADAPTER [ARGUMENT ...]");
  return { spec: resolve(options[1]), command: values.slice(separator + 1) };
}

if (resolve(process.argv[1] ?? "") === here) {
  try {
    const { spec, command } = arguments_();
    const revision = readFileSync(resolve(root, "SPEC_REVISION"), "utf8").trim();
    if (!/^[0-9a-f]{40}$/.test(revision)) throw new Error("invalid local SPEC_REVISION");
    const actual = execFileSync("git", ["-C", spec, "rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim();
    if (actual !== revision)
      throw new Error("spec checkout is not the pinned revision; use an exact detached checkout");
    console.log(JSON.stringify(run({ spec, command, revision })));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

export const profile = PROFILE;
export const localRoot = root;
export const vectorName = (path) => basename(path);
