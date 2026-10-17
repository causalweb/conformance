---
"@causalweb/conformance": patch
---

Bound transport-adapter readiness output and each raw HTTP response to one mebibyte, matching the existing JSON Lines adapter output limit. Oversized test output now fails the profile instead of accumulating without bound.
