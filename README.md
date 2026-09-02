# repo-dashboard

A static operational dashboard for the `moritzbrantner` repository fleet. It answers five questions without becoming another source of truth:

1. **Is the repository healthy?** Latest default-branch pipeline state and failed jobs.
2. **Is its public contract verified?** Report-derived counts for discovered, verified, unverified, and incompletely analyzed external surfaces.
3. **Does it dogfood the shared engineering landscape?** Conservative evidence for agent guidance, environment contracts, conventions, Renovate, validation, reusable workflows, and coding-tooling.
4. **What quality/performance capabilities exist?** Pages, line/function coverage, benchmarks, runtime-profiler, Moonlight, plus optionally published metrics.
5. **Is work moving?** Last push, open issue/PR count, archived state, and stale/recent activity classification.

The dashboard is intentionally read-only. It observes repositories; it does not edit them. Private repositories are excluded by default so a public Pages deployment cannot leak their names or metadata.

## Architecture

- `scripts/collect.mjs` reads GitHub and writes a normalized snapshot to `site/data/repositories.json`.
- `lib/github.mjs` contains conservative evidence collection and API handling.
- `lib/model.mjs` owns scoring, activity classification, summaries, and snapshot validation.
- `site/` is a dependency-free static UI suitable for GitHub Pages.
- `.repo-dashboard/metrics.json` is an optional per-repository contract for benchmark/performance values that cannot be inferred safely.
- `coding-tooling` owns public-contract discovery, evidence semantics, and enforcement; the dashboard only aggregates its emitted summary.

No front-end framework or runtime dependency is required. The dashboard should remain easier to keep alive than the repositories it monitors.

## Local use

Node 22+ is sufficient.

```bash
npm test
npm run validate
GITHUB_TOKEN="$(gh auth token)" npm run collect
npm run serve
```

Open `http://localhost:4173`.

Without `GITHUB_TOKEN`, public GitHub API collection can hit the unauthenticated rate limit for a large fleet. For complete collection, use a token with read-only access to the repositories being monitored.

## GitHub Pages

The Pages workflow refreshes the snapshot every six hours and on manual dispatch, then deploys `site/`.

For reliable fleet-wide collection, add a repository secret named `REPO_DASHBOARD_TOKEN`. A fine-grained token only needs read access to repository metadata, contents, and Actions for the repositories you want represented. If the secret is absent, the workflow falls back to its repository-scoped GitHub token and the collector records inaccessible evidence as unavailable rather than inventing results.

## Public-contract verification

A repository adopts the standardized public-contract pipeline through `reusable-workflows`. The detailed source of truth is the canonical report:

```text
.artifacts/coding-tooling/public-contract.json
```

The uploaded Actions artifact name also carries a compact summary generated from that same JSON report:

```text
coding-tooling-public-contract-v1-d47-vfy45-u2-i0-f0-<run>-<attempt>
```

The dashboard reads only this validated summary envelope for fleet statistics; it does not download ZIP contents or reconstruct public-contract semantics. In the example above, 47 surfaces were discovered, 45 verified, 2 unverified, 0 had incomplete discovery, and 0 verifier mappings failed.

States remain explicit:

- `measured`: a valid current report-derived summary artifact exists;
- `unavailable`: a public-contract workflow exists but no readable non-expired summary is available;
- `not-configured`: no public-contract workflow is detected;
- `unknown`: repository collection itself failed.

Incomplete discovery is never counted as verified merely because no finding was emitted. Ordinary line/function coverage remains a separate secondary capability.

## Dogfood model

Foundation adoption is scored over seven conservative signals:

- `AGENTS.md`
- repository environment contract/bootstrap
- coding-agent conventions
- Renovate
- validation workflow
- reusable-workflows
- coding-tooling

Pages, coverage, benchmarks, runtime-profiler, Moonlight, and public-contract verification are displayed separately and **do not** alter the foundation score.

## Optional performance evidence contract

A repository may publish `.repo-dashboard/metrics.json`:

```json
{
  "schemaVersion": 1,
  "updatedAt": "2026-09-02T20:00:00Z",
  "metrics": [
    {
      "id": "endpoint-latency-p95",
      "label": "Endpoint p95",
      "value": 12.4,
      "unit": "ms",
      "preferredDirection": "lower",
      "source": "benchmark"
    }
  ]
}
```

Only this small whitelist is ingested. Raw profiler output, logs, machine-local paths, and arbitrary artifact contents stay out of the dashboard snapshot.

## Next extensions

The model intentionally leaves room for public-contract history and deltas, GitHub Pages/Lighthouse health, release freshness, dependency drift, and deeper benchmark provenance. Public-contract `protect-new` should be surfaced once `coding-tooling` can produce authoritative base-versus-head comparison evidence; the dashboard must not invent that comparison itself.
