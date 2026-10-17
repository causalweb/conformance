# Contributing

Normative changes belong in [`causalweb/spec`](https://github.com/causalweb/spec). A conformance contribution must identify the exact specification requirement and vector revision it exercises.

Do not weaken a test because one implementation fails it. Add a profile only when its adapter input, expected output, finite limits, and failure behavior can be independently implemented. Keep adapters outside this runner so no implementation language becomes authoritative.

Run before proposing a change:

```sh
npm ci --ignore-scripts
npm run check
npm test
```
