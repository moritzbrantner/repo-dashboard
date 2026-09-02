import test from "node:test";
import assert from "node:assert/strict";

import {
  RECONCILIATION_METRIC_IDS,
  sanitizeMetricsDocument,
  summarizeFleet,
  summarizeReconciliationEfficiency,
} from "../lib/model.mjs";

function metric(id, value) {
  return {
    id,
    label: id,
    value,
    unit: "operations",
    preferredDirection: "neutral",
    source: "reconciliation",
  };
}

test("accepts reconciliation metrics through the existing metrics contract", () => {
  const metrics = sanitizeMetricsDocument({
    schemaVersion: 1,
    metrics: [metric(RECONCILIATION_METRIC_IDS.unchanged, 9)],
  });
  assert.equal(metrics.length, 1);
  assert.equal(metrics[0].source, "reconciliation");
});

test("aggregates changed and verified no-op work across repositories", () => {
  const repositories = [
    {
      metrics: [
        metric(RECONCILIATION_METRIC_IDS.attempted, 10),
        metric(RECONCILIATION_METRIC_IDS.changed, 3),
        metric(RECONCILIATION_METRIC_IDS.unchanged, 7),
      ],
    },
    {
      metrics: [
        metric(RECONCILIATION_METRIC_IDS.attempted, 5),
        metric(RECONCILIATION_METRIC_IDS.changed, 1),
        metric(RECONCILIATION_METRIC_IDS.unchanged, 4),
        metric(RECONCILIATION_METRIC_IDS.conflict, 1),
      ],
    },
    { metrics: [] },
  ];

  assert.deepEqual(summarizeReconciliationEfficiency(repositories), {
    observedRepositories: 2,
    attempted: 15,
    changed: 4,
    unchanged: 11,
    conflict: 1,
    workAvoidedRatio: 11 / 15,
  });
});

test("fleet summary exposes reconciliation efficiency without requiring every repository to report it", () => {
  const summary = summarizeFleet([
    {
      pipeline: { state: "passing" },
      activity: "recent",
      capabilities: { benchmarks: false },
      foundation: { ratio: 1 },
      metrics: [
        metric(RECONCILIATION_METRIC_IDS.attempted, 4),
        metric(RECONCILIATION_METRIC_IDS.unchanged, 3),
        metric(RECONCILIATION_METRIC_IDS.changed, 1),
      ],
    },
  ]);

  assert.equal(summary.reconciliation.attempted, 4);
  assert.equal(summary.reconciliation.unchanged, 3);
  assert.equal(summary.reconciliation.workAvoidedRatio, 0.75);
});
