# Causal Web conformance

This repository contains a language-neutral, experimental runner for Causal Web conformance profiles. The normative protocol and vector definitions remain in [`causalweb/spec`](https://github.com/causalweb/spec). This repository does not redefine protocol semantics, publish an SDK, or certify an implementation merely because it emits a passing report.

## Initial profile

`evidence-verification-v1` sends every case from the pinned specification's `jws-evidence.json` and `evidence-validation.json` files to an implementation-provided JSON Lines adapter. For each input line, the adapter returns exactly one object:

```json
{"id":"EVD-001","outcome":"accept"}
```

Permitted outcomes are `accept`, `expired`, `reject-request`, and `unsupported`. The runner compares the returned outcome to the authoritative vector expectation and emits a machine-readable report only if every case agrees.

The runner invokes the adapter directly, never through a shell. The adapter is local trusted test code; do not run an unreviewed command. Each invocation has a five-second timeout and a one-megabyte output limit.

## Run

Check out the exact `causalweb/spec` revision in [SPEC_REVISION](SPEC_REVISION), then supply an adapter command after `--`:

```sh
node runner.mjs --spec ../spec -- implementation-adapter [arguments]
```

The CLI rejects a spec checkout that is not at its exact pinned commit. Unit tests use a deliberately minimal fake specification fixture and do not constitute a protocol result.

## Status and limits

This runner currently covers only evidence verification. Prefix evaluation, HTTP binding behavior, source commitment, projection lineage, lifecycle failures, interoperability deployments, performance, and security posture require separate profiles and evidence. A passing result is necessary for the declared profile only; it is neither complete conformance nor production certification.

Code and tooling are available under Apache-2.0 or MIT. Documentation prose is CC-BY-4.0. See [LICENSE.md](LICENSE.md).
