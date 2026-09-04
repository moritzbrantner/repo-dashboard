export const FOUNDATION_SIGNALS = Object.freeze([
  "agents",
  "environment",
  "conventions",
  "renovate",
  "validation",
  "reusableWorkflows",
  "codingTooling",
]);

export const CAPABILITY_SIGNALS = Object.freeze([
  "pages",
  "coverage",
  "benchmarks",
  "runtimeProfiler",
  "moonlight",
]);


const FOUNDATION_REMEDIATION = Object.freeze([
  {
    signal: "environment",
    id: "adopt-environment",
    label: "Adopt the repository environment contract",
    detail: "Make the pinned setup and verification environment explicit before adding more repository-specific automation.",
  },
  {
    signal: "conventions",
    id: "adopt-conventions",
    label: "Adopt managed coding conventions",
    detail: "Materialize the repository-specific conventions manifest, lock, and managed snapshot as one atomic foundation change.",
  },
  {
    signal: "renovate",
    id: "adopt-renovate",
    label: "Adopt shared Renovate policy",
    detail: "Add the shared dependency-maintenance contract without granting dependency updates a separate unattended-merge trust path.",
  },
  {
    signal: "reusableWorkflows",
    id: "adopt-reusable-workflows",
    label: "Adopt reusable validation workflows",
    detail: "Move repeated hosted validation mechanics behind the shared immutable workflow adapters.",
  },
  {
    signal: "codingTooling",
    id: "adopt-coding-tooling",
    label: "Adopt coding-tooling validation",
    detail: "Use the shared deterministic analysis and evidence layer instead of repository-local inference.",
  },
  {
    signal: "agents",
    id: "adopt-agent-guidance",
    label: "Add repository agent guidance",
    detail: "Document only repository-specific decisions that deterministic configuration cannot express.",
  },
]);

function repositoryAction(kind, priority, id, label, detail, href = null) {
  return { kind, priority, id, label, detail, href };
}

export function deriveRepositoryAction(repo = {}) {
  const repositoryUrl = typeof repo.url === "string" ? repo.url : null;
  const pipeline = repo.pipeline ?? {};
  const dogfood = repo.dogfood ?? {};
  const contract = repo.publicContract ?? {};

  if (repo.collection?.treeAvailable === false) {
    return repositoryAction(
      "evidence",
      0,
      "restore-repository-evidence",
      "Restore repository evidence collection",
      "The repository tree could not be read, so downstream health and foundation conclusions are intentionally unavailable.",
      repositoryUrl,
    );
  }

  if (pipeline.state === "failing") {
    const failedJob = pipeline.failureJobs?.[0];
    const failedStep = failedJob?.failedSteps?.[0];
    return repositoryAction(
      "pipeline",
      1,
      "repair-pipeline",
      failedJob?.name ? `Repair ${failedJob.name}` : "Repair default-branch validation",
      failedStep
        ? `The latest default-branch run failed at ${failedStep}.`
        : "The latest default-branch validation failed; inspect the preserved workflow evidence before changing policy or thresholds.",
      pipeline.url ?? repositoryUrl,
    );
  }

  if (pipeline.state === "attention") {
    return repositoryAction(
      "pipeline",
      2,
      "resolve-pipeline-attention",
      "Resolve inconclusive default-branch validation",
      "The latest validation ended cancelled, skipped, neutral, or stale; establish an authoritative completed result before trusting downstream evidence.",
      pipeline.url ?? repositoryUrl,
    );
  }

  if (pipeline.state === "unknown" && dogfood.validation === true) {
    return repositoryAction(
      "evidence",
      3,
      "restore-pipeline-evidence",
      "Restore validation evidence collection",
      "A validation workflow is present, but the latest default-branch run could not be read. Do not infer green state from missing evidence.",
      repositoryUrl,
    );
  }

  if (pipeline.state === "not-configured" || dogfood.validation !== true) {
    return repositoryAction(
      "foundation",
      10,
      "adopt-validation",
      "Adopt authoritative validation",
      "Give the repository a default-branch gate before treating any later automation or evidence as trustworthy.",
      repositoryUrl,
    );
  }

  const missingFoundation = FOUNDATION_REMEDIATION.find(({ signal }) => dogfood[signal] !== true);
  if (missingFoundation) {
    return repositoryAction(
      "foundation",
      11,
      missingFoundation.id,
      missingFoundation.label,
      missingFoundation.detail,
      repositoryUrl,
    );
  }

  if (contract.state === "measured" && (contract.failedEvidence ?? 0) > 0) {
    return repositoryAction(
      "contract",
      20,
      "repair-public-contract-evidence",
      "Repair public-contract evidence",
      "At least one discovered public surface has failed verification evidence; fix the verifier or the contract before raising thresholds.",
      contract.runUrl ?? repositoryUrl,
    );
  }

  if (contract.state === "measured" && (contract.incomplete ?? 0) > 0) {
    return repositoryAction(
      "contract",
      21,
      "complete-public-contract-discovery",
      "Complete public-contract discovery",
      "Discovery is explicitly incomplete, so the dashboard must not treat the currently verified subset as the whole contract.",
      contract.runUrl ?? repositoryUrl,
    );
  }

  if (contract.state === "measured" && (contract.unverified ?? 0) > 0) {
    return repositoryAction(
      "contract",
      22,
      "verify-public-contract",
      "Verify the remaining public contract",
      "Public surfaces are discovered but not yet backed by verification evidence. Add evidence rather than hiding or baselining the gap.",
      contract.runUrl ?? repositoryUrl,
    );
  }

  if (contract.state === "unavailable") {
    return repositoryAction(
      "evidence",
      23,
      "restore-public-contract-evidence",
      "Restore public-contract evidence",
      "The verification workflow exists, but no current readable summary is available. Preserve the distinction between unavailable and passing.",
      contract.runUrl ?? repositoryUrl,
    );
  }

  if (repo.activity === "stale") {
    return repositoryAction(
      "maintenance",
      40,
      "review-stale-repository",
      "Review stale repository ownership",
      "Decide whether the repository should be deliberately maintained, archived, or assigned a concrete next slice instead of leaving it silently stale.",
      repositoryUrl,
    );
  }

  return repositoryAction(
    "none",
    100,
    "none",
    "No immediate action",
    "Current default-branch evidence does not expose a higher-priority deterministic remediation.",
    repositoryUrl,
  );
}

export const RECONCILIATION_METRIC_IDS = Object.freeze({
  attempted: "reconciliation.attempted",
  changed: "reconciliation.changed",
  unchanged: "reconciliation.unchanged",
  conflict: "reconciliation.conflict",
});

export function scoreFoundation(dogfood = {}) {
  const adopted = FOUNDATION_SIGNALS.filter((signal) => dogfood[signal] === true).length;
  return {
    adopted,
    total: FOUNDATION_SIGNALS.length,
    ratio: FOUNDATION_SIGNALS.length === 0 ? 0 : adopted / FOUNDATION_SIGNALS.length,
  };
}

export function classifyActivity(pushedAt, staleAfterDays = 90, now = new Date()) {
  if (!pushedAt) return "unknown";
  const pushed = new Date(pushedAt);
  if (Number.isNaN(pushed.getTime())) return "unknown";
  const ageDays = Math.floor((now.getTime() - pushed.getTime()) / 86_400_000);
  if (ageDays < 0) return "recent";
  if (ageDays <= 14) return "recent";
  if (ageDays <= staleAfterDays) return "active";
  return "stale";
}

export function pipelineState(run) {
  if (!run) return "not-configured";
  if (run.status && run.status !== "completed") return "running";
  if (run.conclusion === "success") return "passing";
  if (["failure", "timed_out", "startup_failure", "action_required"].includes(run.conclusion)) {
    return "failing";
  }
  if (["cancelled", "skipped", "neutral", "stale"].includes(run.conclusion)) return "attention";
  return "unknown";
}

function metricValue(repo, id) {
  const metric = (repo.metrics ?? []).find(
    (candidate) => candidate.source === "reconciliation" && candidate.id === id,
  );
  return metric?.value ?? 0;
}

export function summarizeReconciliationEfficiency(repositories) {
  let observedRepositories = 0;
  let attempted = 0;
  let changed = 0;
  let unchanged = 0;
  let conflict = 0;

  for (const repo of repositories) {
    const reconciliationMetrics = (repo.metrics ?? []).filter(
      (metric) => metric.source === "reconciliation",
    );
    if (reconciliationMetrics.length === 0) continue;
    observedRepositories += 1;
    attempted += metricValue(repo, RECONCILIATION_METRIC_IDS.attempted);
    changed += metricValue(repo, RECONCILIATION_METRIC_IDS.changed);
    unchanged += metricValue(repo, RECONCILIATION_METRIC_IDS.unchanged);
    conflict += metricValue(repo, RECONCILIATION_METRIC_IDS.conflict);
  }

  return {
    observedRepositories,
    attempted,
    changed,
    unchanged,
    conflict,
    workAvoidedRatio: attempted === 0 ? 0 : unchanged / attempted,
  };
}

export function summarizeFleet(repositories) {
  const total = repositories.length;
  const passing = repositories.filter((repo) => repo.pipeline?.state === "passing").length;
  const failing = repositories.filter((repo) => repo.pipeline?.state === "failing").length;
  const stale = repositories.filter((repo) => repo.activity === "stale").length;
  const benchmarked = repositories.filter((repo) => repo.capabilities?.benchmarks === true).length;
  const dogfoodSum = repositories.reduce((sum, repo) => sum + (repo.foundation?.ratio ?? 0), 0);
  const measuredContracts = repositories.filter((repo) => repo.publicContract?.state === "measured");
  const contractDiscovered = measuredContracts.reduce(
    (sum, repo) => sum + (repo.publicContract?.discovered ?? 0),
    0,
  );
  const contractVerified = measuredContracts.reduce(
    (sum, repo) => sum + (repo.publicContract?.verified ?? 0),
    0,
  );
  const contractUnverified = measuredContracts.reduce(
    (sum, repo) => sum + (repo.publicContract?.unverified ?? 0),
    0,
  );
  const contractIncomplete = measuredContracts.reduce(
    (sum, repo) => sum + (repo.publicContract?.incomplete ?? 0),
    0,
  );
  return {
    total,
    passing,
    failing,
    stale,
    benchmarked,
    passingRatio: total === 0 ? 0 : passing / total,
    averageFoundationRatio: total === 0 ? 0 : dogfoodSum / total,
    reconciliation: summarizeReconciliationEfficiency(repositories),
    publicContract: {
      measuredRepositories: measuredContracts.length,
      discovered: contractDiscovered,
      verified: contractVerified,
      unverified: contractUnverified,
      incomplete: contractIncomplete,
      verifiedRatio: contractDiscovered === 0 ? null : contractVerified / contractDiscovered,
    },
  };
}

export function validateMetric(metric) {
  if (!metric || typeof metric !== "object") return false;
  if (typeof metric.id !== "string" || metric.id.length === 0 || metric.id.length > 80) return false;
  if (typeof metric.label !== "string" || metric.label.length === 0 || metric.label.length > 120) return false;
  if (typeof metric.value !== "number" || !Number.isFinite(metric.value)) return false;
  if (typeof metric.unit !== "string" || metric.unit.length === 0 || metric.unit.length > 24) return false;
  if (!["lower", "higher", "neutral"].includes(metric.preferredDirection)) return false;
  if (!["benchmark", "coverage", "performance", "quality", "reconciliation"].includes(metric.source)) return false;
  return true;
}

export function sanitizeMetricsDocument(document) {
  if (!document || document.schemaVersion !== 1 || !Array.isArray(document.metrics)) return [];
  return document.metrics.filter(validateMetric).slice(0, 24).map((metric) => ({
    id: metric.id,
    label: metric.label,
    value: metric.value,
    unit: metric.unit,
    preferredDirection: metric.preferredDirection,
    source: metric.source,
  }));
}

export function validateSnapshot(snapshot) {
  const errors = [];
  if (!snapshot || snapshot.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (typeof snapshot?.generatedAt !== "string") errors.push("generatedAt must be a string");
  if (!Array.isArray(snapshot?.repositories)) errors.push("repositories must be an array");
  for (const [index, repo] of (snapshot?.repositories ?? []).entries()) {
    if (typeof repo.name !== "string" || !repo.name) errors.push(`repositories[${index}].name is required`);
    if (typeof repo.url !== "string" || !repo.url) errors.push(`repositories[${index}].url is required`);
    if (!repo.foundation || typeof repo.foundation.ratio !== "number") {
      errors.push(`repositories[${index}].foundation is required`);
    }
  }
  return errors;
}
