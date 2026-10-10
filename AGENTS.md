# Repository agent guidance

`repo-dashboard` is the operational view over the repository fleet. Prefer deterministic, read-only collection and transparent derivation over hidden scoring or mutable cross-repository automation.

## Boundaries

- The collector may read repository metadata, trees, workflow runs, jobs, artifacts, and explicitly published dashboard metrics.
- It must not mutate monitored repositories.
- A missing signal is `unknown` or `not detected`; do not infer failure from absence when the GitHub API denied access.
- Foundation dogfood is observational. Keep capability signals such as Pages, coverage, benchmarks, runtime-profiler, and Moonlight separate because they are not universally applicable.
- Never put tokens, private paths, raw logs, or benchmark artifacts into the generated snapshot.
- Prefer machine-readable evidence. Repositories may publish `.repo-dashboard/metrics.json` using the documented v1 contract.

## Local loop

```bash
npm test
npm run validate
GITHUB_TOKEN="$(gh auth token)" npm run collect
npm run serve
```

When collection behavior changes, add fixture-based tests before broadening detection heuristics. Keep heuristics conservative: false negatives are preferable to claiming a repository dogfoods a tool when the evidence is ambiguous.

## Shared coding tooling

- The installed `conventions.json` selection and `.conventions/index.md` provide applicable shared policy without duplicating it here. Keep collector authority and missing-data semantics above intact.
- Use `coding-tooling inspect --target <existing-path> --json` for focused task context, and `coding-tooling run --tier fast --strict --json` for mechanical tests. The final source-owned gate remains `npm run validate`, which covers more than the semantic test capability.
