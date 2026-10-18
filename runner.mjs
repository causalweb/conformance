import { execFileSync, spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createConnection } from "node:net";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

const here = fileURLToPath(import.meta.url);
const root = resolve(here, "..");
const PROFILE = "evidence-verification-v1";
const PREFIX_PROFILE = "prefix-evaluation-v1";
const CONTEXT_REDUCTION_PROFILE = "context-reduction-v1";
const HTTP_PROFILE = "http-client-confirmation-v1";
const REDIRECT_PROFILE = "http-redirect-agent-v1";
const OBSERVER_PROFILE = "http-observer-v1";
const TRANSPORT_PROFILE = "http-transport-server-v1";
const ADAPTER_TIMEOUT_MS = 5000;
const MAX_ADAPTER_OUTPUT_BYTES = 1024 * 1024;

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
  if (!["accept", "satisfied", "reject-request"].includes(value))
    throw new Error(`unsupported expected position outcome ${value}`);
  return value;
}

function profileFile(name) {
  if (
    ![
      PROFILE,
      PREFIX_PROFILE,
      CONTEXT_REDUCTION_PROFILE,
      HTTP_PROFILE,
      REDIRECT_PROFILE,
      OBSERVER_PROFILE,
      TRANSPORT_PROFILE,
    ].includes(name)
  )
    throw new Error(`unsupported profile ${name}`);
  return resolve(root, "profiles", `${name}.json`);
}

function invoke(command, input) {
  const [program, ...arguments_] = command;
  if (!program) throw new Error("an adapter command is required after --");
  const result = spawnSync(program, arguments_, {
    encoding: "utf8",
    input: `${JSON.stringify(input)}\n`,
    maxBuffer: MAX_ADAPTER_OUTPUT_BYTES,
    timeout: ADAPTER_TIMEOUT_MS,
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

function runContextReduction({ spec, command, revision }) {
  const profile = readJson(profileFile(CONTEXT_REDUCTION_PROFILE));
  if (profile.format !== "causal-web-conformance-context-reduction-v1")
    throw new Error("unsupported local context-reduction profile format");
  const vectorName = string(profile.vector, "context-reduction profile vector");
  const caseIds = profile.case_ids;
  if (!Array.isArray(caseIds) || !caseIds.length || new Set(caseIds).size !== caseIds.length)
    throw new Error("context-reduction profile case_ids must be a nonempty unique list");
  if (!caseIds.every((id) => typeof id === "string"))
    throw new Error("context-reduction profile case_ids must be strings");
  const vector = readJson(resolve(spec, "test-vectors", vectorName));
  if (vector.format !== "causal-web-prefix-evaluation-v1" || !Array.isArray(vector.cases))
    throw new Error(`${vectorName} is not a prefix evaluation vector`);
  const cases = new Map(
    vector.cases.map((testCase) => {
      const caseObject = object(testCase, `${vectorName} case`);
      return [string(caseObject.id, `${vectorName} case id`), caseObject];
    }),
  );
  const results = [];
  for (const id of caseIds) {
    const testCase = cases.get(id);
    if (testCase?.kind !== "context-reduction")
      throw new Error(`${id} is not a context-reduction vector case`);
    if (!Array.isArray(testCase.evidence) || !Array.isArray(testCase.allowed_retained_positions))
      throw new Error(`${id} has invalid context-reduction expectations`);
    const response = invoke(command, {
      version: 1,
      profile: CONTEXT_REDUCTION_PROFILE,
      vector_file: vectorName,
      vector,
      case: testCase,
    });
    if (response.id !== id || !Array.isArray(response.retained_indices))
      throw new Error(`${id}: adapter returned an invalid context-reduction response`);
    const indices = response.retained_indices;
    if (
      !indices.every(
        (index, position) =>
          Number.isInteger(index) &&
          index >= 0 &&
          index < testCase.evidence.length &&
          (position === 0 || indices[position - 1] < index),
      )
    )
      throw new Error(`${id}: retained_indices must be ordered, unique input indices`);
    const retainedPositions = indices.map((index) => testCase.evidence[index].position);
    if (
      !testCase.allowed_retained_positions.some((allowed) =>
        isDeepStrictEqual(allowed, retainedPositions),
      )
    )
      throw new Error(
        `${id}: retained positions ${JSON.stringify(retainedPositions)} are not allowed`,
      );
    results.push({ id, retained_indices: indices, retained_positions: retainedPositions });
  }
  return {
    format: "causal-web-conformance-report-v1",
    profile: CONTEXT_REDUCTION_PROFILE,
    spec_revision: revision,
    passed: results.length,
    results,
  };
}

function expectedHttp(value, id) {
  const entry = object(value, `${id} expected`);
  if (typeof entry.client_accepts_constrained_success !== "boolean")
    throw new Error(`${id} lacks constrained-success expectation`);
  const expected = { client_accepts_constrained_success: entry.client_accepts_constrained_success };
  if (entry.client_accepts_causal_confirmation !== undefined) {
    if (typeof entry.client_accepts_causal_confirmation !== "boolean")
      throw new Error(`${id} has invalid confirmation expectation`);
    expected.client_accepts_causal_confirmation = entry.client_accepts_causal_confirmation;
  }
  return expected;
}

function runHttp({ spec, command, revision }) {
  const profile = readJson(profileFile(HTTP_PROFILE));
  if (profile.format !== "causal-web-conformance-http-client-confirmation-v1")
    throw new Error("unsupported local HTTP profile format");
  const vectorName = string(profile.vector, "HTTP profile vector");
  const excluded = new Set(object(profile, "HTTP profile").excluded_case_ids ?? []);
  if (![...excluded].every((id) => typeof id === "string"))
    throw new Error("HTTP excluded_case_ids must be strings");
  const vector = readJson(resolve(spec, "test-vectors", vectorName));
  if (vector.format !== "causal-web-http-outcomes-v1" || !Array.isArray(vector.cases))
    throw new Error(`${vectorName} is not an HTTP outcome vector`);
  const vectorIds = new Set(
    vector.cases.map((testCase) =>
      string(object(testCase, `${vectorName} case`).id, `${vectorName} case id`),
    ),
  );
  if ([...excluded].some((id) => !vectorIds.has(id)))
    throw new Error("HTTP excluded_case_ids contains an unknown vector case");
  const results = [];
  for (const testCase of vector.cases) {
    const caseObject = object(testCase, `${vectorName} case`);
    const id = string(caseObject.id, `${vectorName} case id`);
    if (excluded.has(id)) continue;
    const want = expectedHttp(caseObject, id);
    const response = invoke(command, {
      version: 1,
      profile: HTTP_PROFILE,
      vector_file: vectorName,
      vector,
      case: caseObject,
    });
    if (response.id !== id || !isDeepStrictEqual(response.result, want))
      throw new Error(
        `${id}: expected ${JSON.stringify(want)}, adapter returned ${JSON.stringify(response)}`,
      );
    results.push({ id, result: want });
  }
  return {
    format: "causal-web-conformance-report-v1",
    profile: HTTP_PROFILE,
    spec_revision: revision,
    passed: results.length,
    results,
  };
}

function expectedObserver(value, id) {
  const expected = object(value, `${id} expected`);
  if (!Number.isInteger(expected.status) || expected.status < 100 || expected.status > 599)
    throw new Error(`${id} has an invalid status expectation`);
  if (
    expected.causal_result !== null &&
    !["satisfied", "unsatisfied"].includes(expected.causal_result)
  )
    throw new Error(`${id} has an invalid causal-result expectation`);
  if (typeof expected.cache_control !== "string" || !expected.cache_control)
    throw new Error(`${id} lacks a cache-control expectation`);
  if (!Number.isInteger(expected.read_calls) || expected.read_calls < 0)
    throw new Error(`${id} has an invalid read-call expectation`);
  return expected;
}

function runObserver({ spec, command, revision }) {
  const profile = readJson(profileFile(OBSERVER_PROFILE));
  if (profile.format !== "causal-web-conformance-http-observer-v1")
    throw new Error("unsupported local observer profile format");
  const vectorName = string(profile.vector, "observer profile vector");
  const vector = readJson(resolve(spec, "test-vectors", vectorName));
  if (vector.format !== "causal-web-http-observer-v1" || !Array.isArray(vector.cases))
    throw new Error(`${vectorName} is not an HTTP observer vector`);
  const results = [];
  for (const testCase of vector.cases) {
    const caseObject = object(testCase, `${vectorName} case`);
    const id = string(caseObject.id, `${vectorName} case id`);
    const want = expectedObserver(caseObject.expected, id);
    const response = invoke(command, {
      version: 1,
      profile: OBSERVER_PROFILE,
      vector_file: vectorName,
      vector,
      case: caseObject,
    });
    if (response.id !== id || !isDeepStrictEqual(response.result, want))
      throw new Error(
        `${id}: expected ${JSON.stringify(want)}, adapter returned ${JSON.stringify(response)}`,
      );
    results.push({ id, result: want });
  }
  return {
    format: "causal-web-conformance-report-v1",
    profile: OBSERVER_PROFILE,
    spec_revision: revision,
    passed: results.length,
    results,
  };
}

function wait(ms) {
  return new Promise((resolveTimeout) => setTimeout(resolveTimeout, ms));
}

function responseHeaders(lines) {
  const headers = new Map();
  for (const line of lines) {
    const separator = line.indexOf(":");
    if (separator <= 0) throw new Error("transport adapter returned an invalid HTTP header");
    const name = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    const values = headers.get(name) ?? [];
    values.push(value);
    headers.set(name, values);
  }
  return headers;
}

function rawRequest(origin, lines) {
  return new Promise((resolveRequest, rejectRequest) => {
    const socket = createConnection({ host: origin.hostname, port: Number(origin.port) });
    const chunks = [];
    let received = 0;
    let timeout;
    const fail = (error) => {
      clearTimeout(timeout);
      socket.destroy();
      rejectRequest(error);
    };
    timeout = setTimeout(
      () => fail(new Error("transport adapter request timed out")),
      ADAPTER_TIMEOUT_MS,
    );
    socket.on("error", fail);
    socket.on("connect", () => socket.end(`${lines.join("\r\n")}\r\n\r\n`, "ascii"));
    socket.on("data", (chunk) => {
      received += chunk.length;
      if (received > MAX_ADAPTER_OUTPUT_BYTES) {
        fail(new Error("transport adapter response exceeds output limit"));
        return;
      }
      chunks.push(chunk);
    });
    socket.on("end", () => {
      clearTimeout(timeout);
      try {
        const bytes = Buffer.concat(chunks);
        const end = bytes.indexOf("\r\n\r\n");
        if (end < 0) throw new Error("transport adapter response lacks a header terminator");
        const head = bytes.subarray(0, end).toString("ascii").split("\r\n");
        const match = /^HTTP\/1\.1 ([0-9]{3})(?: |$)/.exec(head[0] ?? "");
        if (!match) throw new Error("transport adapter response lacks an HTTP/1.1 status");
        resolveRequest({
          status: Number(match[1]),
          headers: responseHeaders(head.slice(1)),
          body: bytes.subarray(end + 4).toString("utf8"),
        });
      } catch (error) {
        rejectRequest(error);
      }
    });
  });
}

function header(response, name) {
  const values = response.headers.get(name.toLowerCase());
  return values?.join(", ") ?? null;
}

async function launchTransport(
  command,
  readyFormat = "causal-web-conformance-transport-server-v1",
) {
  const [program, ...arguments_] = command;
  if (!program) throw new Error("a transport adapter command is required after --");
  const child = spawn(program, arguments_, {
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let stderr = "";
  let stderrBytes = 0;
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderrBytes += Buffer.byteLength(chunk);
    if (stderrBytes > MAX_ADAPTER_OUTPUT_BYTES) {
      child.kill();
      return;
    }
    stderr += chunk;
  });
  const ready = await new Promise((resolveReady, rejectReady) => {
    let output = "";
    let outputBytes = 0;
    const failReady = (error) => {
      clearTimeout(timeout);
      child.stdout.off("data", onOutput);
      child.kill();
      rejectReady(error);
    };
    const timeout = setTimeout(() => {
      failReady(new Error("transport adapter did not announce readiness"));
    }, ADAPTER_TIMEOUT_MS);
    child.stdout.setEncoding("utf8");
    const onOutput = (chunk) => {
      outputBytes += Buffer.byteLength(chunk);
      if (outputBytes > MAX_ADAPTER_OUTPUT_BYTES) {
        failReady(new Error("transport adapter readiness exceeds output limit"));
        return;
      }
      output += chunk;
      const newline = output.indexOf("\n");
      if (newline < 0) return;
      clearTimeout(timeout);
      child.stdout.off("data", onOutput);
      try {
        const value = object(
          JSON.parse(output.slice(0, newline)),
          "transport adapter ready message",
        );
        if (value.format !== readyFormat)
          throw new Error("transport adapter used an unsupported ready format");
        const origin = new URL(string(value.origin, "transport adapter origin"));
        if (origin.protocol !== "http:" || origin.hostname !== "127.0.0.1" || !origin.port)
          throw new Error("transport adapter must bind an explicit 127.0.0.1 HTTP port");
        resolveReady({ child, origin });
      } catch (error) {
        child.kill();
        rejectReady(error);
      }
    };
    child.stdout.on("data", onOutput);
    child.once("error", (error) => {
      failReady(error);
    });
    child.once("exit", (code) => {
      failReady(new Error(`transport adapter exited ${code}: ${stderr}`));
    });
  });
  return ready;
}

async function stopTransport(child) {
  if (child.exitCode !== null) return;
  child.kill();
  await Promise.race([new Promise((resolveExit) => child.once("exit", resolveExit)), wait(1000)]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

function expectedTransport(value, id) {
  const expected = object(value, `${id} expected`);
  if (!Number.isInteger(expected.status) || expected.status < 100 || expected.status > 599)
    throw new Error(`${id} has an invalid status expectation`);
  if (
    expected.causal_result !== null &&
    !["satisfied", "unsatisfied"].includes(expected.causal_result)
  )
    throw new Error(`${id} has an invalid causal-result expectation`);
  if (!Number.isInteger(expected.read_calls) || expected.read_calls < 0)
    throw new Error(`${id} has an invalid read-call expectation`);
  return expected;
}

async function runTransport({ spec, command, revision }) {
  const profile = readJson(profileFile(TRANSPORT_PROFILE));
  if (profile.format !== "causal-web-conformance-http-transport-server-v1")
    throw new Error("unsupported local transport profile format");
  const vectorName = string(profile.vector, "transport profile vector");
  const vector = readJson(resolve(spec, "test-vectors", vectorName));
  if (vector.format !== "causal-web-http-transport-server-v1" || !Array.isArray(vector.cases))
    throw new Error(`${vectorName} is not an HTTP transport-server vector`);
  const { child, origin } = await launchTransport(command);
  try {
    const results = [];
    for (const testCase of vector.cases) {
      const caseObject = object(testCase, `${vectorName} case`);
      const id = string(caseObject.id, `${vectorName} case id`);
      const request = object(caseObject.request, `${id} request`);
      const want = expectedTransport(caseObject.expected, id);
      let requirements = [];
      if (request.fixture_requirements === true) {
        const fixture = await rawRequest(origin, [
          `GET /fixture/${id} HTTP/1.1`,
          "Host: 127.0.0.1",
          "Connection: close",
        ]);
        if (fixture.status !== 200)
          throw new Error(`${id}: fixture endpoint returned ${fixture.status}`);
        const body = object(JSON.parse(fixture.body), `${id} fixture response`);
        if (
          !Array.isArray(body.requirements) ||
          !body.requirements.every((value) => typeof value === "string")
        )
          throw new Error(`${id}: fixture endpoint returned invalid requirements`);
        requirements = body.requirements;
      }
      const connection =
        request.connection_nominates_causal === true ? "causal-require, close" : "close";
      const lines = [
        `${string(request.method, `${id} method`)} ${string(request.path, `${id} path`)} HTTP/1.1`,
        "Host: 127.0.0.1",
        `Connection: ${connection}`,
        ...(typeof request.raw_causal_require === "string"
          ? [`Causal-Require: ${request.raw_causal_require}`]
          : requirements.map((token) => `Causal-Require: "${token}"`)),
      ];
      const response = await rawRequest(origin, lines);
      const got = {
        status: response.status,
        causal_result: header(response, "causal-result"),
        read_calls: Number(header(response, "x-causalweb-conformance-read-calls")),
        ...(Object.hasOwn(want, "cache_control")
          ? { cache_control: header(response, "cache-control") }
          : {}),
        ...(Object.hasOwn(want, "vary_contains_causal_require")
          ? {
              vary_contains_causal_require:
                header(response, "vary")
                  ?.split(",")
                  .some((value) => value.trim().toLowerCase() === "causal-require") === true,
            }
          : {}),
        ...(Object.hasOwn(want, "causal_context")
          ? { causal_context: header(response, "causal-context") }
          : {}),
        ...(Object.hasOwn(want, "body") ? { body: response.body } : {}),
        ...(Object.hasOwn(want, "outcomes")
          ? { outcomes: object(JSON.parse(response.body), `${id} problem response`).outcomes }
          : {}),
      };
      if (!isDeepStrictEqual(got, want))
        throw new Error(
          `${id}: expected ${JSON.stringify(want)}, adapter returned ${JSON.stringify(got)}`,
        );
      results.push({ id, result: want });
    }
    return {
      format: "causal-web-conformance-report-v1",
      profile: TRANSPORT_PROFILE,
      spec_revision: revision,
      passed: results.length,
      results,
    };
  } finally {
    await stopTransport(child);
  }
}

async function runRedirect({ spec, command, revision }) {
  const settings = readJson(profileFile(REDIRECT_PROFILE));
  if (settings.format !== "causal-web-conformance-http-redirect-agent-v1")
    throw new Error("unsupported local redirect profile format");
  const vectorName = string(settings.vector, "redirect profile vector");
  const vector = readJson(resolve(spec, "test-vectors", vectorName));
  if (vector.format !== "causal-web-http-outcomes-v1" || !Array.isArray(vector.cases))
    throw new Error(`${vectorName} is not an HTTP outcome vector`);
  const testCase = vector.cases.find((entry) => entry.id === "HTTP-006");
  if (testCase?.response?.status !== 302 || testCase.response.cross_origin !== true)
    throw new Error("HTTP-006 must describe a cross-origin redirect");
  if (
    testCase.forward_requirements_automatically !== false ||
    testCase.client_accepts_constrained_success !== false
  )
    throw new Error("HTTP-006 has unsupported redirect expectations");

  const { child, origin } = await launchTransport(
    [process.execPath, resolve(root, "redirect-fixture.mjs")],
    "causal-web-conformance-redirect-fixture-v1",
  );
  try {
    const requirement = "opaque-test-token-HTTP-006";
    const response = invoke(command, {
      version: 1,
      profile: REDIRECT_PROFILE,
      case: testCase,
      url: new URL("redirect", origin).toString(),
      requirement,
    });
    if (
      !isDeepStrictEqual(response, {
        id: testCase.id,
        result: { client_accepts_constrained_success: false },
      })
    )
      throw new Error(`HTTP-006: adapter returned ${JSON.stringify(response)}`);
    const report = await rawRequest(origin, [
      "GET /report HTTP/1.1",
      "Host: 127.0.0.1",
      "Connection: close",
    ]);
    if (report.status !== 200) throw new Error("redirect fixture report unavailable");
    const observations = object(JSON.parse(report.body), "redirect fixture report");
    if (
      !Array.isArray(observations.source) ||
      observations.source.length !== 1 ||
      typeof observations.source[0] !== "string" ||
      !observations.source[0].includes(requirement) ||
      !Array.isArray(observations.target) ||
      observations.target.some((value) => value !== null)
    )
      throw new Error("HTTP-006: requirements missing at source or forwarded to redirect target");
    return {
      format: "causal-web-conformance-report-v1",
      profile: REDIRECT_PROFILE,
      spec_revision: revision,
      passed: 1,
      results: [
        {
          id: testCase.id,
          result: {
            forward_requirements_automatically: false,
            client_accepts_constrained_success: false,
          },
        },
      ],
    };
  } finally {
    await stopTransport(child);
  }
}

export function run({ spec, command, revision, profile = PROFILE }) {
  if (profile === PROFILE) return runEvidence({ spec, command, revision });
  if (profile === PREFIX_PROFILE) return runPrefix({ spec, command, revision });
  if (profile === CONTEXT_REDUCTION_PROFILE)
    return runContextReduction({ spec, command, revision });
  if (profile === HTTP_PROFILE) return runHttp({ spec, command, revision });
  if (profile === REDIRECT_PROFILE) return runRedirect({ spec, command, revision });
  if (profile === OBSERVER_PROFILE) return runObserver({ spec, command, revision });
  if (profile === TRANSPORT_PROFILE) return runTransport({ spec, command, revision });
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
    console.log(JSON.stringify(await run({ spec, command, revision, profile })));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

export const profile = PROFILE;
export const prefixProfile = PREFIX_PROFILE;
export const contextReductionProfile = CONTEXT_REDUCTION_PROFILE;
export const httpProfile = HTTP_PROFILE;
export const redirectProfile = REDIRECT_PROFILE;
export const observerProfile = OBSERVER_PROFILE;
export const transportProfile = TRANSPORT_PROFILE;
export const localRoot = root;
export const vectorName = (path) => basename(path);
