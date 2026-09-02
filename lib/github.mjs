import { CAPABILITY_SIGNALS, classifyActivity, pipelineState, sanitizeMetricsDocument, scoreFoundation } from "./model.mjs";

const API = "https://api.github.com";
const CONTENT_SCAN_LIMIT = 120_000;

export class GitHubClient {
  constructor({ token = process.env.GITHUB_TOKEN, apiBase = API } = {}) {
    this.token = token || null;
    this.apiBase = apiBase.replace(/\/$/, "");
  }

  async request(path, { optional = false } = {}) {
    const headers = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "repo-dashboard/0.1",
    };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    const response = await fetch(`${this.apiBase}${path}`, { headers });
    if (optional && (response.status === 404 || response.status === 403)) return null;
    if (!response.ok) {
      const remaining = response.headers.get("x-ratelimit-remaining");
      throw new Error(`GitHub ${response.status} for ${path}${remaining === "0" ? " (rate limit exhausted)" : ""}`);
    }
    return response.json();
  }

  async listOwnedRepositories(owner) {
    const repositories = [];
    const authenticatedPath = this.token
      ? `/user/repos?affiliation=owner&visibility=all&sort=updated&per_page=100`
      : null;
    for (let page = 1; ; page += 1) {
      let batch;
      if (authenticatedPath) {
        batch = await this.request(`${authenticatedPath}&page=${page}`);
        batch = batch.filter((repo) => repo.owner?.login?.toLowerCase() === owner.toLowerCase());
      } else {
        batch = await this.request(`/users/${encodeURIComponent(owner)}/repos?type=owner&sort=updated&per_page=100&page=${page}`);
      }
      repositories.push(...batch);
      if (batch.length < 100) break;
    }
    return repositories;
  }

  tree(owner, repo, branch) {
    return this.request(`/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`, { optional: true });
  }

  latestWorkflowRun(owner, repo, branch, workflowFile) {
    if (!workflowFile) return Promise.resolve(null);
    return this.request(`/repos/${owner}/${repo}/actions/workflows/${encodeURIComponent(workflowFile)}/runs?branch=${encodeURIComponent(branch)}&per_page=1`, { optional: true });
  }

  workflowJobs(owner, repo, runId) {
    return this.request(`/repos/${owner}/${repo}/actions/runs/${runId}/jobs?per_page=100`, { optional: true });
  }

  workflowArtifacts(owner, repo, runId) {
    return this.request(`/repos/${owner}/${repo}/actions/runs/${runId}/artifacts?per_page=100`, { optional: true });
  }

  async textFile(owner, repo, path, ref) {
    const data = await this.request(`/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`, { optional: true });
    if (!data || data.type !== "file" || data.encoding !== "base64" || typeof data.content !== "string") return null;
    const text = Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf8");
    return text.length > CONTENT_SCAN_LIMIT ? text.slice(0, CONTENT_SCAN_LIMIT) : text;
  }
}

function anyPath(paths, predicate) {
  return paths.some((path) => predicate(path.toLowerCase()));
}

export function derivePathSignals(paths) {
  const normalized = new Set(paths.map((path) => path.toLowerCase()));
  const hasPrefix = (prefix) => [...normalized].some((path) => path.startsWith(prefix));
  const workflows = [...normalized].filter((path) => path.startsWith(".github/workflows/") && /\.ya?ml$/.test(path));
  const workflowBasename = (path) => path.split("/").at(-1);
  const validationWorkflowPath = workflows.find((path) => /^(validate|validation|ci)\.ya?ml$/.test(workflowBasename(path)))
    ?? workflows.find((path) => /^(validate|validation|ci)[-_.]/.test(workflowBasename(path)))
    ?? null;
  const evidenceWorkflowPath = workflows.find((path) => /(benchmark|bench|perf|performance|profile|moonlight|coverage)/.test(workflowBasename(path))) ?? null;

  return {
    agents: normalized.has("agents.md"),
    environment:
      normalized.has(".repository-environment.toml") ||
      normalized.has("scripts/codex-environment.sh") ||
      hasPrefix(".devcontainer/"),
    conventions: hasPrefix(".conventions/"),
    renovate: normalized.has("renovate.json") || normalized.has("renovate.json5"),
    validation: validationWorkflowPath !== null,
    validationWorkflowPath,
    evidenceWorkflowPath,
    pages: workflows.some((path) => path.includes("pages")),
    coverage: anyPath([...normalized], (path) => path.includes("coverage") || path.includes("lcov")),
    benchmarks: anyPath([...normalized], (path) =>
      path.startsWith("benches/") ||
      path.includes("/benches/") ||
      path.startsWith("benchmarks/") ||
      path.includes("/benchmarks/") ||
      /(^|[\/_.-])(benchmark|perf)([\/_.-]|$)/.test(path),
    ),
    metricsContract: normalized.has(".repo-dashboard/metrics.json"),
  };
}

export function deriveContentSignals(contents) {
  const text = contents.filter(Boolean).join("\n").toLowerCase();
  return {
    conventions: text.includes("coding-agent-conventions"),
    reusableWorkflows: text.includes("moritzbrantner/reusable-workflows"),
    codingTooling: text.includes("coding-tooling"),
    runtimeProfiler: text.includes("runtime-profiler"),
    moonlight: text.includes("moonlight"),
    coverage: /(^|[^a-z])(coverage|lcov|llvm-cov|tarpaulin|codecov)([^a-z]|$)/.test(text),
    benchmarks: /(^|[^a-z])(benchmark|criterion|hyperfine)([^a-z]|$)/.test(text),
  };
}

function compactFailureJobs(jobs) {
  return (jobs?.jobs ?? [])
    .filter((job) => ["failure", "timed_out", "startup_failure", "action_required"].includes(job.conclusion))
    .slice(0, 6)
    .map((job) => ({
      name: job.name,
      url: job.html_url,
      failedSteps: (job.steps ?? [])
        .filter((step) => ["failure", "timed_out", "action_required"].includes(step.conclusion))
        .slice(0, 4)
        .map((step) => step.name),
    }));
}

function compactArtifacts(artifacts) {
  return (artifacts?.artifacts ?? [])
    .filter((artifact) => /benchmark|perf|profile|moonlight|coverage|lcov/i.test(artifact.name))
    .slice(0, 12)
    .map((artifact) => ({ name: artifact.name, expired: artifact.expired === true }));
}

async function collectRepository(client, owner, repo, staleAfterDays) {
  const branch = repo.default_branch || "main";
  const treeResult = await client.tree(owner, repo.name, branch);
  const paths = (treeResult?.tree ?? []).filter((entry) => entry.type === "blob").map((entry) => entry.path);
  const pathSignals = derivePathSignals(paths);
  const runsResult = pathSignals.validationWorkflowPath
    ? await client.latestWorkflowRun(owner, repo.name, branch, pathSignals.validationWorkflowPath.split("/").at(-1))
    : null;

  const workflowPaths = paths.filter((path) => /^\.github\/workflows\/[^/]+\.ya?ml$/i.test(path)).slice(0, 24);
  const scanPaths = [...new Set([
    "AGENTS.md",
    ".agent-loop.toml",
    "package.json",
    "Cargo.toml",
    "pyproject.toml",
    ...workflowPaths,
  ].filter((path) => paths.includes(path)))];

  const contentResults = await Promise.all(scanPaths.map((path) => client.textFile(owner, repo.name, path, branch)));
  const contentSignals = deriveContentSignals(contentResults);
  const dogfood = {
    agents: pathSignals.agents,
    environment: pathSignals.environment,
    conventions: pathSignals.conventions || contentSignals.conventions,
    renovate: pathSignals.renovate,
    validation: pathSignals.validation,
    reusableWorkflows: contentSignals.reusableWorkflows,
    codingTooling: contentSignals.codingTooling,
  };
  const capabilities = Object.fromEntries(CAPABILITY_SIGNALS.map((signal) => [signal, false]));
  capabilities.pages = pathSignals.pages;
  capabilities.coverage = pathSignals.coverage || contentSignals.coverage;
  capabilities.benchmarks = pathSignals.benchmarks || contentSignals.benchmarks;
  capabilities.runtimeProfiler = contentSignals.runtimeProfiler;
  capabilities.moonlight = contentSignals.moonlight;

  const run = runsResult?.workflow_runs?.[0] ?? null;
  const state = pathSignals.validation
    ? (runsResult === null || run === null ? "unknown" : pipelineState(run))
    : "not-configured";
  let failureJobs = [];
  let artifacts = [];
  if (run && state === "failing") {
    failureJobs = compactFailureJobs(await client.workflowJobs(owner, repo.name, run.id));
  }
  if (capabilities.benchmarks || capabilities.runtimeProfiler || capabilities.moonlight || capabilities.coverage) {
    let evidenceRun = run;
    if (pathSignals.evidenceWorkflowPath && pathSignals.evidenceWorkflowPath !== pathSignals.validationWorkflowPath) {
      const evidenceRuns = await client.latestWorkflowRun(owner, repo.name, branch, pathSignals.evidenceWorkflowPath.split("/").at(-1));
      evidenceRun = evidenceRuns?.workflow_runs?.[0] ?? evidenceRun;
    }
    if (evidenceRun) artifacts = compactArtifacts(await client.workflowArtifacts(owner, repo.name, evidenceRun.id));
  }

  let metrics = [];
  if (pathSignals.metricsContract) {
    try {
      const text = await client.textFile(owner, repo.name, ".repo-dashboard/metrics.json", branch);
      if (text) metrics = sanitizeMetricsDocument(JSON.parse(text));
    } catch {
      metrics = [];
    }
  }

  return {
    name: repo.name,
    url: repo.html_url,
    description: repo.description ?? null,
    language: repo.language ?? null,
    archived: repo.archived === true,
    private: repo.private === true,
    defaultBranch: branch,
    pushedAt: repo.pushed_at ?? null,
    updatedAt: repo.updated_at ?? null,
    openIssuesAndPullRequests: repo.open_issues_count ?? 0,
    activity: classifyActivity(repo.pushed_at, staleAfterDays),
    dogfood,
    foundation: scoreFoundation(dogfood),
    capabilities,
    pipeline: {
      state,
      workflow: run?.name ?? null,
      conclusion: run?.conclusion ?? null,
      status: run?.status ?? null,
      url: run?.html_url ?? null,
      updatedAt: run?.updated_at ?? null,
      failureJobs,
    },
    evidenceArtifacts: artifacts,
    metrics,
    collection: {
      treeAvailable: treeResult !== null,
      actionsAvailable: pathSignals.validation ? runsResult !== null : null,
    },
  };
}

export async function collectFleet(client, config) {
  const repos = (await client.listOwnedRepositories(config.owner))
    .filter((repo) => config.includePrivate || !repo.private)
    .filter((repo) => config.includeArchived || !repo.archived)
    .filter((repo) => !(config.exclude ?? []).includes(repo.name));

  const results = new Array(repos.length);
  let cursor = 0;
  const concurrency = Math.max(1, Math.min(Number(config.maxConcurrency) || 4, 12));
  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= repos.length) return;
      const repo = repos[index];
      try {
        results[index] = await collectRepository(client, config.owner, repo, config.staleAfterDays ?? 90);
      } catch (error) {
        results[index] = {
          name: repo.name,
          url: repo.html_url,
          description: repo.description ?? null,
          language: repo.language ?? null,
          archived: repo.archived === true,
          private: repo.private === true,
          defaultBranch: repo.default_branch || "main",
          pushedAt: repo.pushed_at ?? null,
          updatedAt: repo.updated_at ?? null,
          openIssuesAndPullRequests: repo.open_issues_count ?? 0,
          activity: classifyActivity(repo.pushed_at, config.staleAfterDays ?? 90),
          dogfood: Object.fromEntries(["agents", "environment", "conventions", "renovate", "validation", "reusableWorkflows", "codingTooling"].map((key) => [key, false])),
          foundation: scoreFoundation({}),
          capabilities: Object.fromEntries(CAPABILITY_SIGNALS.map((key) => [key, false])),
          pipeline: { state: "unknown", workflow: null, conclusion: null, status: null, url: null, updatedAt: null, failureJobs: [] },
          evidenceArtifacts: [],
          metrics: [],
          collection: { treeAvailable: false, actionsAvailable: false, error: error instanceof Error ? error.message : String(error) },
        };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, repos.length || 1) }, () => worker()));
  return results.sort((a, b) => a.name.localeCompare(b.name));
}
