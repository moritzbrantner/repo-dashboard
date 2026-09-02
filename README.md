# repo-dashboard

A static operational dashboard for the `moritzbrantner` repository fleet. It answers four questions without becoming another source of truth:

1. **Is the repository healthy?** Latest default-branch pipeline state and failed jobs.
2. **Does it dogfood the shared engineering landscape?** Conservative evidence for agent guidance, environment contracts, conventions, Renovate, validation, reusable workflows, and coding-tooling.
3. **What quality/performance capabilities exist?** Pages, coverage, benchmarks, runtime-profiler, Moonlight, plus optionally published metrics.
4. **Is work moving?** Last push, open issue/PR count, archived state, and stale/recent activity classification.

The dashboard is intentionally read-only. It observes repositories; it does not edit them. Private repositories are excluded by default so a public Pages deployment cannot leak their names or metadata.

## Architecture

- `scripts/collect.mjs` reads GitHub and writes a normalized snapshot to `site/data/repositories.json`.
- `lib/github.mjs` contains conservative evidence collection and API handling.
- `lib/model.mjs` owns scoring, activity classification, summaries, and snapshot validation.
- `site/` is a dependency-free static UI suitable for GitHub Pages.
- `.repo-dashboard/metrics.json` is an optional per-repository contract for benchmark/performance values that cannot be inferred safely.

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

## Dogfood model

Foundation adoption is scored over seven conservative signals:

- `AGENTS.md`
- repository environment contract/bootstrap
- coding-agent conventions
- Renovate
- validation workflow
- reusable-workflows
- coding-tooling

Pages, coverage, benchmarks, runtime-profiler, and Moonlight are displayed as capabilities and **do not** lower a repository's foundation score when absent.

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

The v1 model intentionally leaves room for historical snapshots, trend charts, GitHub Pages/Lighthouse health, coverage deltas, release freshness, dependency drift, and deeper benchmark provenance. Those should be added only when the underlying evidence is stable and machine-readable.
