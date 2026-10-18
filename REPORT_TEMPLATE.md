# Causal Web conformance implementation report template

Copy this file into an implementation repository or publish it with a release. Replace every bracketed value. A report is evidence for the listed profiles only; it is not permission to claim universal Causal Web conformance, production readiness, or external review.

## Identity

- Implementation name and version: `[name and version]`
- Source revision: `[immutable commit or release digest]`
- Specification revision: `[40-character causalweb/spec commit]`
- Conformance runner revision: `[40-character causalweb/conformance commit]`
- Report date: `[UTC date]`
- Maintainer contact: `[public project contact]`

## Claimed profiles

List each profile, its result, and every explicit exclusion.

| Profile | Result | Cases | Explicit exclusions |
| --- | --- | --- | --- |
| `evidence-verification-v1` | `[pass/fail/not run]` | `[count or report artifact]` | `[none or reason]` |
| `prefix-evaluation-v1` | `[pass/fail/not run]` | `[count or report artifact]` | `PFX-012, PFX-013, PFX-020` are outside this evaluator-only profile |
| `context-reduction-v1` | `[pass/fail/not run]` | `[count or report artifact]` | Carrier reduction only; it does not establish evaluator, transport, or deployment conformance |
| `http-client-confirmation-v1` | `[pass/fail/not run]` | `[count or report artifact]` | `HTTP-006` redirect forwarding is outside this response/parser profile |
| `http-redirect-agent-v1` | `[pass/fail/not run]` | `[count or report artifact]` | One cross-origin loopback HTTP redirect only; no TLS, proxy, browser, or same-origin claim |
| `http-observer-v1` | `[pass/fail/not run]` | `[count or report artifact]` | Fixed-cut in-process observer behavior only; no network server, routing, transport, or storage-adapter claim |
| `http-transport-server-v1` | `[pass/fail/not run]` | `[count or report artifact]` | Raw loopback transport profile only; no TLS, proxy, HTTP/2+, durable-state, or deployment claim |

Do not list a profile as passing if the runner exited unsuccessfully, the specification checkout differed from the runner pin, an adapter transformed vector input outside the profile contract, or a required case was skipped.

## Reproduction

Record the exact commands, operating system, runtime/compiler version, and the complete machine-readable runner reports. Commands MUST use an exact detached checkout of the specification revision recorded above.

```sh
# Replace each placeholder. Preserve the complete JSON reports as build artifacts.
node runner.mjs --spec ../spec -- [adapter command]
node runner.mjs --spec ../spec --profile prefix-evaluation-v1 -- [adapter command]
node runner.mjs --spec ../spec --profile context-reduction-v1 -- [adapter command]
node runner.mjs --spec ../spec --profile http-client-confirmation-v1 -- [adapter command]
node runner.mjs --spec ../spec --profile http-redirect-agent-v1 -- [client-adapter command]
node runner.mjs --spec ../spec --profile http-observer-v1 -- [adapter command]
node runner.mjs --spec ../spec --profile http-transport-server-v1 -- [transport-adapter command]
```

- OS and architecture: `[value]`
- Runtime/compiler and cryptographic-library versions: `[value]`
- Adapter command revision: `[value]`
- Resource limits used by the implementation: `[values]`
- Full report artifact URL or immutable digest: `[value]`

## Evidence and trust assumptions

- Supported evidence formats and algorithms: `[value]`
- Trusted issuer/key/domain/audience configuration source: `[value]`
- Clock and skew policy: `[value]`
- Authentication and subject-binding assumption: `[value]`
- Authorization recheck point before response commitment: `[value or not implemented]`
- Revocation and key-rotation behavior: `[value]`

## Storage and fault model

Answer every item. State `not implemented` rather than inferring a guarantee from a signature or test fixture.

- Source commitment point: `[value]`
- Source fact/outbox recovery method: `[value]`
- Projection state/lineage atomicity method: `[value]`
- Crash tests before and after projection persistence: `[artifact or not run]`
- Duplicate/out-of-order delivery behavior: `[value]`
- Unknown, unsupported, expired, failed, and unsatisfied outcome behavior: `[value]`
- Concurrency, replication, and durability assumptions: `[value]`

## Unsupported behavior and deviations

List unsupported profiles, transport bindings, platform limits, known deviations, open specification ambiguities, security findings, and operational risks. A missing item is not evidence of support.

## Attestation

`[Maintainer or release authority]` attests that this report reflects the commands and revision above. This attestation does not represent independent review, an audit, user adoption, or a standards-body endorsement.
