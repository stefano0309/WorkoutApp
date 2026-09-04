# Refactor stack note

PR #25 removes Firebase runtime CDN dependencies.
PR #26 replaces Firebase auth bootstrap polling with event-driven initialization.

The session editor refactor is intentionally based on PR #26 and only changes the React contract naming/behavior; no migration of the production `www` shell is included in this PR.
