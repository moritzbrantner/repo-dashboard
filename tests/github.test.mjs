import test from "node:test";
import assert from "node:assert/strict";
import { deriveContentSignals, derivePathSignals, parsePublicContractArtifactName } from "../lib/github.mjs";

test("path detection is conservative and capability-aware", () => {
  const signals = derivePathSignals([
    "AGENTS.md",
    ".repository-environment.toml",
    ".conventions/modules/environment/README.md",
    "renovate.json",
    ".github/workflows/validate.yml",
    ".github/workflows/pages.yml",
    ".github/workflows/public-contract.yml",
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
  assert.equal(signals.publicContractWorkflowPath, ".github/workflows/public-contract.yml");
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

test("public contract artifact names expose only the report summary envelope", () => {
  assert.deepEqual(
    parsePublicContractArtifactName("coding-tooling-public-contract-v1-d47-vfy45-u2-i0-f0-123456-1"),
    {
      schemaVersion: 1,
      discovered: 47,
      verified: 45,
      unverified: 2,
      incomplete: 0,
      failedEvidence: 0,
      runId: 123456,
      attempt: 1,
      verifiedRatio: 45 / 47,
      strictReady: false,
    },
  );
  assert.equal(parsePublicContractArtifactName("coding-tooling-public-contract-v1-d47-vfy46-u2-i0-f0-123456-1"), null);
  assert.equal(parsePublicContractArtifactName("some-other-artifact"), null);
});
