# Development Portfolio (repo-dashboard)

A private, self-hostable interface for GitHub portfolio progress, Decision Atlas steering, and native issue dependencies. Replaces the old public operational dashboard.

## Views

1. Repository overview: a searchable, sortable table showing completed issues, 7/30/90-day trends, merged PRs, recorded decisions and open questions. Historical activity is absolute, never measured against an invented completion target.
2. Decision Atlas: browse the owning repository's hierarchical Markdown, inspect existing answers, answer questions with descriptive decisions, and submit append-only updates as GitHub PRs. A cross-repository decision inbox collects unanswered questions and supports one-at-a-time review.
3. Execution papyrus: horizontally scrolling, dependency-first DAG. Active GitHub issue evidence is centered, completed predecessors and future successors flank it, and independent work is collapsible. All edges use native GitHub issue dependencies, including cross-repository links. The UI can edit GitHub dependencies, but positioning is never a priority field.

The dashboard reports no verification evidence where a repository has not published an authoritative acceptance signal. Live worker integrations and AI-generated new steering questions are deferred, not silently simulated.

## Local use

Node.js 22 or later, no runtime dependencies.

    GITHUB_TOKEN="$(gh auth token)" npm run serve

Open http://127.0.0.1:4173. The token must authenticate as the configured owner. Read operations need permission for repository metadata, Issues, Pull Requests and Contents. Native dependency editing needs Issues write permission; Decision Atlas PRs need Contents and Pull Requests write permission.

A derived private cache is written to untracked data/portfolio.json with restrictive file permissions; remove it to rebuild from GitHub. First-time issue history collection may take time. Subsequent syncs use updated timestamps with overlap for idempotence.

## Hosted deployment

For GitHub OAuth, configure HOST, PORT, PUBLIC_URL (HTTPS URL), GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET. Configure the OAuth App callback as PUBLIC_URL/auth/callback. GitHub sign-in is restricted to the configured repository owner. Serve through an HTTPS reverse proxy and do not set GITHUB_TOKEN on a public interface. Session credentials remain in process memory and require re-login on restart. Mount data/ as private persistent storage for historical snapshots.

The old GitHub Pages collector and deployment workflow has been removed. Do not deploy private portfolio data to public GitHub Pages.

## Evidence and current limits

- Completed issue counts exclude closed reasons not_planned and duplicate. Legacy closed issues with unspecified reasons may count as completed; the distinction is explained in the UI.
- The first issue import is capped at 3,000 records per repository to bound API consumption. Capped totals are marked partial.
- Recent merged PR count is derived from GitHub search. CI success alone is never interpreted as feature verification.
- Atlas discovery recognizes numbered atlas.md and decision-atlas.md paths and preserves stable IDs. Answer updates use branch + PR + optimistic blob-SHA checks. GitHub auto-merge is requested only when allowed by the repository, and pending decisions remain pending until merged.
- GitHub's native dependency endpoints are queried for the currently relevant work. If access is denied, missing relationships are reported as unavailable rather than invented.
- Local derived snapshots record daily repository progress; missing historic blocker evidence is not reconstructed from guesses.
- Free browsing and one-at-a-time review of recorded questions work without AI. AI-assisted question discovery will require an agent integration in a later slice.
- No alternative dependency database, issue prioritization service, artificial deadlines, or additional validation pipelines.

Run npm test and npm run validate before merging.
