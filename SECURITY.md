# Security policy

This experimental runner is test infrastructure, not a sandbox, protocol endpoint, or security certification service. Report exploitable defects privately through [GitHub Security Advisories](https://github.com/causalweb/conformance/security/advisories/new). Do not include real tenant evidence, credentials, private topology, or active exploit details in public issues or reports.

## Adapter execution boundary

The operator supplies an adapter command. The runner invokes that program directly, never through a shell, but it runs with the operator's local privileges. Do not run an unreviewed adapter or assume the runner confines filesystem, network, process, or credential access.

Each JSON Lines invocation has a five-second timeout and a one-megabyte output limit. The transport profile permits only an explicit `http://127.0.0.1:PORT` readiness origin and terminates the child when its cases finish. These controls limit accidental test-process behavior; they do not make a malicious adapter safe or provide a general denial-of-service defense.

Fixture inputs and results are public test data. Do not pass production evidence, private keys, or live-service credentials to an adapter command. A passing report attests only to the selected profile and exact specification revision; it does not authenticate the adapter, establish production trust, or replace review of the implementation under test.

## Dependency snapshot

`npm audit --audit-level=high --json` on 2026-10-18 reported zero known registry vulnerabilities at every severity. The [machine-readable result](security/npm-audit-2026-10-18.json) records 49 resolved dependency entries (one production, 49 development, and eight optional; categories overlap). The reviewed `package-lock.json` SHA-256 is `549885e47a5cbbba98ba7f3596a7ac24c107b4ba7d2d2938fc8cd32a81547ae4`.

This is a time-limited automated advisory check, not a source-code audit, license certification, or assurance against malicious packages. CI repeats the advisory check; unavailable advisory data is not a clean result. Repeat the audit and a full license/provenance review against the exact lockfile before any release.
