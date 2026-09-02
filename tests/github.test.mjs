import test from "node:test";
import assert from "node:assert/strict";
import { deriveContentSignals, derivePathSignals } from "../lib/github.mjs";

test("path detection is conservative and capability-aware", () => {
  const signals = derivePathSignals([
    "AGENTS.md",
    ".repository-environment.toml",
    ".conventions/modules/environment/README.md",
    "renovate.json",
    ".github/workflows/validate.yml",
    ".github/workflows/pages.yml",
    "benches/query.rs",
    ".repo-dashboard/metrics.json",
  ]);
  assert.equal(signals.agents, true);
  assert.equal(signals.environment, true);
  assert.equal(signals.conventions, true);
  assert.equal(signals.renovate, true);
  assert.equal(signals.validation, true);
  assert.equal(signals.pages, true);
  assert.equal(signals.benchmarks, true);
  assert.equal(signals.metricsContract, true);
});

test("a generic test file is not mislabeled as a benchmark", () => {
  const signals = derivePathSignals(["tests/performance_name_parser.test.ts", "src/coverage_map.ts"]);
  assert.equal(signals.benchmarks, false);
  assert.equal(signals.coverage, true);
});

test("content detection recognizes shared tooling by explicit names", () => {
  const signals = deriveContentSignals([
    "uses: moritzbrantner/reusable-workflows/.github/workflows/validate.yml@main",
    "coding-tooling validate --json",
    "runtime-profiler capture && moonlight compare",
  ]);
  assert.equal(signals.reusableWorkflows, true);
  assert.equal(signals.codingTooling, true);
  assert.equal(signals.runtimeProfiler, true);
  assert.equal(signals.moonlight, true);
});
