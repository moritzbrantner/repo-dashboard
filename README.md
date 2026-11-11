# Development Portfolio (repo-dashboard)

A portfolio interface for GitHub progress, Decision Atlas steering, and native issue dependencies. The static shell can be hosted on GitHub Pages; all private data and write operations remain on the authenticated backend.

Product decisions are recorded in [the owning Decision Atlas](docs/decisions/atlas.md). AI steering will reuse existing coding-agent workflows; it is not yet integrated into the application.

## Views

1. Repository overview: a searchable, sortable table showing completed issues, 7/30/90-day trends, merged PRs, recorded decisions and open questions. Historical activity is absolute, never measured against an invented completion target.
2. Decision Atlas: browse the owning repository's hierarchical Markdown, inspect existing answers, answer questions with descriptive decisions, and submit append-only updates as GitHub PRs. A cross-repository decision inbox collects unanswered questions and supports one-at-a-time review.
3. Execution papyrus: horizontally scrolling, dependency-first DAG. Active GitHub issue evidence is centered, completed predecessors and future successors flank it, and independent work is collapsible. All edges use native GitHub issue dependencies, including cross-repository links. The UI can edit GitHub dependencies, but positioning is never a priority field.
4. Dependency backlog: an on-demand, read-only portfolio scan of open issues in non-archived, non-fork repositories. Each 40-issue batch checks native GitHub `blocked_by` dependencies (including other repositories) and explicitly referenced unresolved Atlas questions. Issues are shown as ready, blocked or unknown; failed or incomplete dependency reads never imply readiness. Scanning is bounded and does not establish execution priority or edit issues.

The dashboard reports no verification evidence where a repository has not published an authoritative acceptance signal. Live worker integrations and AI-generated new steering questions are deferred, not silently simulated.

## Local use

Node.js 22 or later, no runtime dependencies.

    GITHUB_TOKEN="$(gh auth token)" npm run serve

Open http://127.0.0.1:4173. The token must authenticate as the configured owner. Read operations need permission for repository metadata, Issues, Pull Requests and Contents. Native dependency editing needs Issues write permission; Decision Atlas PRs need Contents and Pull Requests write permission.

A derived private cache is written to untracked data/portfolio.json with restrictive file permissions; remove it to rebuild from GitHub. First-time issue history collection may take time. Subsequent syncs use updated timestamps with overlap for idempotence.

## GitHub Pages frontend + private HTTPS backend

The Pages site is a **public static shell**. Only `site/` and the browser-safe projection module `lib/portfolio.mjs` are built into `dist/`. Neither the GitHub OAuth secret nor `data/portfolio.json` is included. An authenticated backend is mandatory for the Pages site to function.

1. Point a DNS name (for example `dashboard-api.example.com`) to a machine with inbound TCP 80/443. This can be a private VPS or your own machine with a publicly reachable HTTPS endpoint. Configure a [GitHub OAuth App](https://github.com/settings/developers) with callback `https://dashboard-api.example.com/auth/callback`.
2. Copy `.env.example` to `.env`, set `API_DOMAIN`, the exact `FRONTEND_URL`, and the OAuth client ID/secret. Keep `.env` untracked. Run `docker compose up -d --build`. Caddy obtains HTTPS certificates and proxies only the Node backend; the persistent `portfolio_data` volume holds private history. The OAuth connection must have access to the repositories you expect to see.
3. In the `repo-dashboard` GitHub repository, set **Settings → Pages → Build and deployment → Source: GitHub Actions**. Set Actions repository variable `REPO_DASHBOARD_API_BASE_URL` to `https://dashboard-api.example.com`. Run the **Publish dashboard frontend** workflow (or push to main after configuring it).
4. The workflow publishes `dist/` to the Pages address, normally `https://moritzbrantner.github.io/repo-dashboard/`. Use that **exact** URL for `FRONTEND_URL`, including its path and trailing slash. For stronger origin isolation, use a dedicated GitHub Pages custom domain and configure `FRONTEND_URL` to that domain instead.

Login opens GitHub OAuth on the backend's HTTPS domain. After the backend verifies the authorized GitHub account, it redirects to Pages with a 60-second, one-use ticket. The browser proves possession of its original PKCE verifier to exchange the ticket for a 12-hour opaque application session stored in the tab's `sessionStorage`. GitHub access tokens and private caches never enter the Pages artifact or browser. Cross-origin API calls allow only `FRONTEND_URL`'s origin, and writes require an authenticated bearer session and exact Origin match. Sessions are held in backend memory and expire on restart.

The backend also supports the original single-origin OAuth deployment and loopback-only `GITHUB_TOKEN` development mode. Do not set `GITHUB_TOKEN` on an internet-facing deployment. The public site cannot run coding agents locally in the browser; future agent-launch features require an explicitly configured trusted local runner.

## Evidence and current limits

- Completed issue counts exclude closed reasons not_planned and duplicate. Legacy closed issues with unspecified reasons may count as completed; the distinction is explained in the UI.
- The first issue import is capped at 3,000 records per repository to bound API consumption. Capped totals are marked partial.
- Recent merged PR count is derived from GitHub search. CI success alone is never interpreted as feature verification.
- Atlas discovery recognizes numbered atlas.md and decision-atlas.md paths and preserves stable IDs. Answer updates use branch + PR + optimistic blob-SHA checks. GitHub auto-merge is requested only when allowed by the repository, and pending decisions remain pending until merged.
- GitHub's native dependency endpoints are queried for the currently relevant work. If access is denied, missing relationships are reported as unavailable rather than invented.
- Local derived snapshots record daily repository progress; missing historic blocker evidence is not reconstructed from guesses.
- Free browsing and one-at-a-time review of recorded questions work without AI. AI-assisted question discovery will require an agent integration in a later slice.
- No alternative dependency database, issue prioritization service, artificial deadlines, or additional validation pipelines.
- The backlog scan is intentionally not exhaustive until all batches are requested. Its counts distinguish checked issues from the total open backlog. Refreshed GitHub history can change issue membership between batches; restart the scan after syncing.

Run npm test and npm run validate before merging.
