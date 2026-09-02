import test from "node:test";
import assert from "node:assert/strict";
import { classifyActivity, pipelineState, sanitizeMetricsDocument, scoreFoundation, summarizeFleet } from "../lib/model.mjs";

test("foundation score only counts universal dogfood signals", () => {
  const result = scoreFoundation({ agents: true, environment: true, conventions: true, renovate: true, validation: false, reusableWorkflows: false, codingTooling: true, benchmarks: true });
  assert.deepEqual(result, { adopted: 5, total: 7, ratio: 5 / 7 });
});

test("activity separates recent, active, stale and unknown", () => {
  const now = new Date("2026-09-02T12:00:00Z");
  assert.equal(classifyActivity("2026-09-01T12:00:00Z", 90, now), "recent");
  assert.equal(classifyActivity("2026-08-01T12:00:00Z", 90, now), "active");
  assert.equal(classifyActivity("2026-01-01T12:00:00Z", 90, now), "stale");
  assert.equal(classifyActivity(null, 90, now), "unknown");
});

test("pipeline state does not turn neutral runs into passing", () => {
  assert.equal(pipelineState(null), "not-configured");
  assert.equal(pipelineState({ status: "in_progress", conclusion: null }), "running");
  assert.equal(pipelineState({ status: "completed", conclusion: "success" }), "passing");
  assert.equal(pipelineState({ status: "completed", conclusion: "failure" }), "failing");
  assert.equal(pipelineState({ status: "completed", conclusion: "cancelled" }), "attention");
});

test("metrics contract is whitelist-only", () => {
  const metrics = sanitizeMetricsDocument({ schemaVersion: 1, metrics: [
    { id: "p95", label: "p95", value: 12.3, unit: "ms", preferredDirection: "lower", source: "benchmark", rawLog: "secret" },
    { id: "bad", label: "bad", value: "12", unit: "ms", preferredDirection: "lower", source: "benchmark" },
  ] });
  assert.deepEqual(metrics, [{ id: "p95", label: "p95", value: 12.3, unit: "ms", preferredDirection: "lower", source: "benchmark" }]);
});

test("fleet summary aggregates health and public contracts without treating unknown as failure", () => {
  const summary = summarizeFleet([
    {
      pipeline: { state: "passing" },
      activity: "recent",
      capabilities: { benchmarks: true },
      foundation: { ratio: 1 },
      publicContract: { state: "measured", discovered: 10, verified: 8, unverified: 2, incomplete: 1 },
    },
    {
      pipeline: { state: "failing" },
      activity: "stale",
      capabilities: { benchmarks: false },
      foundation: { ratio: 3 / 7 },
      publicContract: { state: "measured", discovered: 5, verified: 5, unverified: 0, incomplete: 0 },
    },
    {
      pipeline: { state: "unknown" },
      activity: "active",
      capabilities: { benchmarks: false },
      foundation: { ratio: 0 },
      publicContract: { state: "not-configured" },
    },
  ]);
  assert.equal(summary.total, 3);
  assert.equal(summary.passing, 1);
  assert.equal(summary.failing, 1);
  assert.equal(summary.stale, 1);
  assert.equal(summary.benchmarked, 1);
  assert.equal(summary.passingRatio, 1 / 3);
  assert.deepEqual(summary.publicContract, {
    measuredRepositories: 2,
    discovered: 15,
    verified: 13,
    unverified: 2,
    incomplete: 1,
    verifiedRatio: 13 / 15,
  });
});
