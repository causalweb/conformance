# Causal Web conformance

This repository contains a language-neutral, experimental runner for Causal Web conformance profiles. The normative protocol and vector definitions remain in [`causalweb/spec`](https://github.com/causalweb/spec). This repository does not redefine protocol semantics, publish an SDK, or certify an implementation merely because it emits a passing report.

## Profiles

`evidence-verification-v1` sends every case from the pinned specification's `jws-evidence.json` and `evidence-validation.json` files to an implementation-provided JSON Lines adapter. For each input line, the adapter returns exactly one object:

```json
{"id":"EVD-001","outcome":"accept"}
```

Permitted outcomes are `accept`, `expired`, `reject-request`, and `unsupported`. The runner compares the returned outcome to the authoritative vector expectation and emits a machine-readable report only if every case agrees.

`prefix-evaluation-v1` sends the selected cases from `prefix-evaluation.json`. It covers prefix parsing, exact 64-bit comparison, selected-state frontiers, independent domains, exclusions, unknown lineage, terminal failure, composite frontiers, expiry, and unsupported profiles. Its adapter returns ordered per-requirement outcomes and aggregate success:

```json
{"id":"PFX-004","outcomes":[{"outcome":"satisfied","disposition":"applied"},{"outcome":"unsatisfied"}],"aggregate_success":false}
```

It intentionally excludes `PFX-012`, `PFX-013`, and `PFX-020`: those are context-reduction cases, and this profile tests a verifier/snapshot evaluator rather than a Core Carrier reducer. The exclusion is explicit in the profile manifest; it is not a passing result for those requirements.

`http-client-confirmation-v1` sends 11 selected cases from `http-outcomes.json`. It exercises requirement-field rejection/limits and the client-side rule that a constrained success requires an allowed 2xx response with exactly one `Causal-Result: satisfied`; a confirmed 404 remains an application non-success. It explicitly excludes `HTTP-006`, cross-origin redirect forwarding, because that behavior belongs to an HTTP agent profile rather than a response/parser implementation.

`http-observer-v1` sends all 15 cases from `http-observer.json`. It exercises a public observer API with ephemeral evidence and a synthetic fixed-cut snapshot: success and covered absence, indexed duplicate failure, the six dependency outcomes, expiry after the read, invalid/oversized/`HEAD`/inapplicable requests, authorization at both checkpoints, connection nomination, and marker-free conversion of an invalid success representation. It is neither a network-server nor storage-adapter profile. It does not test transport parsing, cancellation, TLS, CORS, proxy behavior, routing, or durable snapshot truth.

`http-transport-server-v1` launches a test-only loopback adapter, obtains ephemeral signed requirements from its fixture endpoint, and sends raw HTTP/1.1 exchanges. It covers repeated `Causal-Require` field lines, response serialization, `HEAD`, `Connection` nomination, ordinary-route fallthrough, malformed requirements, and marker-free local errors. Its `X-CausalWeb-Conformance-Read-Calls` response field is test instrumentation. It does not test a generic production server, TLS, HTTP/2 or HTTP/3, proxies, CORS, cancellation, authorization integration, or durable state.

The runner invokes the adapter directly, never through a shell. The adapter is local trusted test code; do not run an unreviewed command. Each invocation has a five-second timeout and a one-megabyte output limit.

## Run

Check out the exact `causalweb/spec` revision in [SPEC_REVISION](SPEC_REVISION), then supply an adapter command after `--`:

```sh
node runner.mjs --spec ../spec -- implementation-adapter [arguments]
```

Select a non-default profile explicitly:

```sh
node runner.mjs --spec ../spec --profile prefix-evaluation-v1 -- implementation-adapter [arguments]
node runner.mjs --spec ../spec --profile http-client-confirmation-v1 -- implementation-adapter [arguments]
node runner.mjs --spec ../spec --profile http-observer-v1 -- implementation-adapter [arguments]
node runner.mjs --spec ../spec --profile http-transport-server-v1 -- transport-adapter [arguments]
```

The CLI rejects a spec checkout that is not at its exact pinned commit. Unit tests use a deliberately minimal fake specification fixture and do not constitute a protocol result.

Use the [implementation report template](REPORT_TEMPLATE.md) when publishing a result. It records the runner/spec revisions, commands, trust and storage assumptions, explicit exclusions, and limits that a raw pass count cannot establish.

## Status and limits

The runner currently covers 32 evidence-verification cases, 17 selected prefix-evaluation cases, 11 selected HTTP client-confirmation cases, 15 fixed-cut HTTP observer cases, and 7 raw loopback transport-server cases. Context reduction, redirect forwarding, generic production-server behavior, source commitment, projection lineage durability, lifecycle failures, interoperability deployments, performance, and security posture require separate profiles and evidence. A passing result is necessary for the declared profile only; it is neither complete conformance nor production certification.

Code and tooling are available under Apache-2.0 or MIT. Documentation prose is CC-BY-4.0. See [LICENSE.md](LICENSE.md).
