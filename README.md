# Causal Web conformance

This repository contains a language-neutral, experimental runner for Causal Web conformance profiles. The normative protocol and vector definitions remain in [`causalweb/spec`](https://github.com/causalweb/spec). This repository does not redefine protocol semantics, publish an SDK, or certify an implementation merely because it emits a passing report.

## Profiles

`evidence-verification-v1` sends every case from the pinned specification's `jws-evidence.json` and `evidence-validation.json` files to an implementation-provided JSON Lines adapter. For each input line, the adapter returns exactly one object:

```json
{"id":"EVD-001","outcome":"accept"}
```

Permitted outcomes are `accept`, `expired`, `reject-request`, and `unsupported`. The runner compares the returned outcome to the authoritative vector expectation and emits a machine-readable report only if every case agrees.

`uri-identities-draft-v1` is a separate proposal-only profile. It runs four signed cases from the exact proposal revision recorded in its manifest, including a case-specific trusted issuer that differs only in scheme case from the signed issuer. It uses the evidence-verification adapter contract, but its report is explicitly a draft result; it does not change `SPEC_REVISION`, the pinned evidence profile, or any release claim.

`prefix-evaluation-v1` sends the selected cases from `prefix-evaluation.json`. It covers prefix parsing, exact 64-bit comparison, selected-state frontiers, independent domains, exclusions, unknown lineage, terminal failure, composite frontiers, expiry, and unsupported profiles. Its adapter returns ordered per-requirement outcomes and aggregate success:

```json
{"id":"PFX-004","outcomes":[{"outcome":"satisfied","disposition":"applied"},{"outcome":"unsatisfied"}],"aggregate_success":false}
```

It intentionally excludes `PFX-012`, `PFX-013`, and `PFX-020`: those are context-reduction cases, and this profile tests a verifier/snapshot evaluator rather than a Core Carrier reducer. The exclusion is explicit in the profile manifest; it is not a passing result for those requirements.

`context-reduction-v1` invokes the three excluded Prefix Profile carrier-reduction cases. An adapter returns strictly ordered indices into the original evidence list; the runner maps those indices back to input positions and accepts only a vector-authorized retained sequence. It therefore rejects synthesized positions, reordered input, duplicate indices, an omitted independent domain, and dropping a longer-lived item in favor of an evidence item that expires before the carrier's declared horizon.

`http-client-confirmation-v1` sends 11 selected cases from `http-outcomes.json`. It exercises requirement-field rejection/limits and the client-side rule that a constrained success requires an allowed 2xx response with exactly one `Causal-Result: satisfied`; a confirmed 404 remains an application non-success. It explicitly excludes `HTTP-006`, cross-origin redirect forwarding, because that behavior belongs to an HTTP agent profile rather than a response/parser implementation.

`http-redirect-agent-v1` runs `HTTP-006` against two runner-controlled loopback origins. The adapter receives a URL and opaque requirement, then makes one constrained request with its real HTTP client. The runner checks that the first origin received the requirement, the redirect target did not, and the adapter did not accept the 302 as confirmed. This covers one cross-origin HTTP redirect, not same-origin redirects, TLS, proxies, or browser behavior.

`http-observer-v1` sends all 15 cases from `http-observer.json`. It exercises a public observer API with ephemeral evidence and a synthetic fixed-cut snapshot: success and covered absence, indexed duplicate failure, the six dependency outcomes, expiry after the read, invalid/oversized/`HEAD`/inapplicable requests, authorization at both checkpoints, connection nomination, and marker-free conversion of an invalid success representation. It is neither a network-server nor storage-adapter profile. It does not test transport parsing, cancellation, TLS, CORS, proxy behavior, routing, or durable snapshot truth.

`http-transport-server-v1` launches a test-only loopback adapter, obtains ephemeral signed requirements from its fixture endpoint, and sends raw HTTP/1.1 exchanges. It covers repeated `Causal-Require` field lines, response serialization, `HEAD`, `Connection` nomination, ordinary-route fallthrough, malformed requirements, and marker-free local errors. Its `X-CausalWeb-Conformance-Read-Calls` response field is test instrumentation. It does not test a generic production server, TLS, HTTP/2 or HTTP/3, proxies, CORS, cancellation, authorization integration, or durable state.

The runner invokes the adapter directly, never through a shell. The adapter is local trusted test code; do not run an unreviewed command. Each invocation has a five-second timeout and a one-megabyte output limit.

See [SECURITY.md](SECURITY.md) for the adapter execution boundary, loopback constraints, vulnerability reporting, and dependency-review limits.

## Run

Check out the exact `causalweb/spec` revision in [SPEC_REVISION](SPEC_REVISION), then supply an adapter command after `--`:

```sh
node runner.mjs --spec ../spec -- implementation-adapter [arguments]
```

Select a non-default profile explicitly:

```sh
node runner.mjs --spec ../spec --profile prefix-evaluation-v1 -- implementation-adapter [arguments]
node runner.mjs --spec ../spec --profile context-reduction-v1 -- implementation-adapter [arguments]
node runner.mjs --spec ../spec --profile http-client-confirmation-v1 -- implementation-adapter [arguments]
node runner.mjs --spec ../spec --profile http-redirect-agent-v1 -- client-adapter [arguments]
node runner.mjs --spec ../spec --profile http-observer-v1 -- implementation-adapter [arguments]
node runner.mjs --spec ../spec --profile http-transport-server-v1 -- transport-adapter [arguments]
node runner.mjs --spec ../spec-proposal --profile uri-identities-draft-v1 -- implementation-adapter [arguments]
```

The CLI rejects a spec checkout that is not at the exact revision for the selected profile. The draft URI profile requires its proposal commit; all other profiles require `SPEC_REVISION`. Unit tests use a deliberately minimal fake specification fixture and do not constitute a protocol result.

Use the [implementation report template](REPORT_TEMPLATE.md) when publishing a result. It records the runner/spec revisions, commands, trust and storage assumptions, explicit exclusions, and limits that a raw pass count cannot establish.

## Status and limits

The pinned runner profiles currently cover 32 evidence-verification cases, 17 selected prefix-evaluation cases, three context-reduction cases, 11 selected HTTP client-confirmation cases, one cross-origin redirect-agent case, 15 fixed-cut HTTP observer cases, and 7 raw loopback transport-server cases. The separate proposal-only URI profile covers four additional signed cases against its exact draft revision. Broader redirect behavior, generic production-server behavior, source commitment, projection lineage durability, lifecycle failures, interoperability deployments, performance, and security posture require separate evidence. A passing result is necessary for the declared profile only; it is neither complete conformance nor production certification.

Code and tooling are available under Apache-2.0 or MIT. Documentation prose is CC-BY-4.0. See [LICENSE.md](LICENSE.md).
