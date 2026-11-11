# Repository agent guidance

This is the personal development portfolio manager, replacing the public read-only fleet dashboard.

## Boundaries

- GitHub issues and native issue dependencies are authoritative for implementation and blocking edges. Never infer dependencies from backlinks or maintain a separate dependency registry.
- Each repository's Decision Atlas Markdown owns product decisions. Preserve append-only, stable numbered IDs: answering a question adds a numbered Decision referencing it. Do not renumber, replace or delete old entries.
- Data under untracked data/ is derived and may contain private repository information. Never commit, serve statically, or publish it.
- Only the static frontend may be published to GitHub Pages. The API and its derived private data remain private behind account-checked GitHub OAuth over HTTPS. OAuth access tokens stay server-side; the Pages client receives a short-lived, opaque app session after a one-time PKCE-bound exchange. Local token mode still binds to loopback.
- Do not trigger extra CI to populate analytics, invent verification evidence, or claim a coding agent is currently working solely because a PR is open.
- Preserve one Node 22+ application with compact DOM interfaces and focused tests. Do not add redundant infrastructure or prioritize ready issues.

## Validation

Run npm test and npm run validate. Integration testing with a real GitHub token must never log credentials or commit cached private data. Parser and collector changes need fixture-based tests.

Main does not pin conventions.json, conventions.lock.json or .conventions/. If they are installed later, use the repository-pinned versions rather than manually inventing managed convention files.
