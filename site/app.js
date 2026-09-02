const state = { snapshot: null, query: "", pipeline: "all", activity: "all", sort: "risk" };
const $ = (selector) => document.querySelector(selector);
const percent = (value) => `${Math.round((value || 0) * 100)}%`;
const prettyState = (value) => (value || "unknown").replaceAll("-", " ");

function relativeDate(value) {
  if (!value) return "unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown";
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} mo ago`;
  return `${Math.floor(months / 12)} yr ago`;
}

function summaryCard(label, value, note) {
  const article = document.createElement("article");
  article.className = "summary-card";
  article.innerHTML = `<span class="summary-label"></span><strong class="summary-value"></strong><span class="summary-note"></span>`;
  article.querySelector(".summary-label").textContent = label;
  article.querySelector(".summary-value").textContent = value;
  article.querySelector(".summary-note").textContent = note;
  return article;
}

function renderSummary(snapshot) {
  const summary = snapshot.summary || {};
  const contract = summary.publicContract || {};
  const contractValue = contract.discovered > 0 ? `${contract.verified ?? 0}/${contract.discovered}` : "—";
  const target = $("#summary");
  target.replaceChildren(
    summaryCard("Repositories", summary.total ?? snapshot.repositories.length, `${summary.stale ?? 0} stale`),
    summaryCard("Passing", percent(summary.passingRatio), `${summary.passing ?? 0} latest pipelines green`),
    summaryCard("Failing", String(summary.failing ?? 0), "latest default-branch runs"),
    summaryCard(
      "Public contract",
      contractValue,
      `${contract.measuredRepositories ?? 0} repos measured · ${contract.incomplete ?? 0} incomplete`,
    ),
    summaryCard("Foundation", percent(summary.averageFoundationRatio), "average dogfood adoption"),
    summaryCard("Benchmarked", String(summary.benchmarked ?? 0), "benchmark evidence detected"),
  );
}

function badge(text, className = "unknown") {
  const span = document.createElement("span");
  span.className = `badge ${className}`;
  span.textContent = text;
  return span;
}

function signal(name, enabled) {
  const span = document.createElement("span");
  span.className = `signal ${enabled ? "on" : "off"}`;
  span.textContent = name;
  return span;
}

function searchable(repo) {
  return [
    repo.name,
    repo.description,
    repo.language,
    repo.pipeline?.workflow,
    repo.publicContract?.state,
    ...(repo.pipeline?.failureJobs ?? []).flatMap((job) => [job.name, ...(job.failedSteps ?? [])]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function riskRank(repo) {
  const pipeline = { failing: 0, attention: 1, unknown: 2, "not-configured": 3, running: 4, passing: 5 }[repo.pipeline?.state] ?? 2;
  const contract = repo.publicContract?.state === "measured"
    ? (repo.publicContract.unverified > 0 || repo.publicContract.incomplete > 0 ? 0 : 3)
    : repo.publicContract?.state === "unavailable"
      ? 1
      : 2;
  const stale = repo.activity === "stale" ? 0 : 1;
  return [pipeline, contract, stale, repo.foundation?.ratio ?? 0, repo.name];
}

function compareTuple(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  return 0;
}

function filteredRepositories() {
  const q = state.query.trim().toLowerCase();
  const repos = state.snapshot.repositories.filter((repo) =>
    (!q || searchable(repo).includes(q)) &&
    (state.pipeline === "all" || repo.pipeline?.state === state.pipeline) &&
    (state.activity === "all" || repo.activity === state.activity)
  );
  return repos.sort((a, b) => {
    if (state.sort === "name") return a.name.localeCompare(b.name);
    if (state.sort === "updated") return String(b.pushedAt || "").localeCompare(String(a.pushedAt || ""));
    if (state.sort === "dogfood") return (a.foundation?.ratio ?? 0) - (b.foundation?.ratio ?? 0) || a.name.localeCompare(b.name);
    return compareTuple(riskRank(a), riskRank(b));
  });
}

function renderDetail(repo, target) {
  const dogfood = document.createElement("section");
  dogfood.innerHTML = "<h3>Foundation evidence</h3>";
  const labels = { agents: "agents", environment: "environment", conventions: "conventions", renovate: "renovate", validation: "validation", reusableWorkflows: "reusable workflows", codingTooling: "coding-tooling" };
  Object.entries(labels).forEach(([key, label]) => dogfood.append(signal(label, repo.dogfood?.[key] === true)));

  const pipeline = document.createElement("section");
  pipeline.innerHTML = "<h3>Pipeline evidence</h3>";
  if (repo.pipeline?.url) {
    const link = document.createElement("a");
    link.href = repo.pipeline.url;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = `${repo.pipeline.workflow || "Latest workflow"} · ${prettyState(repo.pipeline.state)}`;
    pipeline.append(link);
  } else {
    pipeline.append(Object.assign(document.createElement("p"), { textContent: "No accessible workflow run." }));
  }
  for (const job of repo.pipeline?.failureJobs ?? []) {
    const p = document.createElement("p");
    p.className = "failure";
    p.textContent = `${job.name}${job.failedSteps?.length ? ` — ${job.failedSteps.join(", ")}` : ""}`;
    pipeline.append(p);
  }
  if (repo.collection?.error) pipeline.append(Object.assign(document.createElement("p"), { textContent: `Collection: ${repo.collection.error}` }));

  const contract = document.createElement("section");
  contract.innerHTML = "<h3>Public contract</h3>";
  if (repo.publicContract?.state === "measured") {
    contract.append(
      Object.assign(document.createElement("p"), {
        textContent: `${repo.publicContract.verified}/${repo.publicContract.discovered} verified (${percent(repo.publicContract.verifiedRatio)})`,
      }),
      Object.assign(document.createElement("p"), {
        textContent: `${repo.publicContract.unverified} unverified · ${repo.publicContract.incomplete} incomplete discovery · ${repo.publicContract.failedEvidence} failed evidence`,
      }),
    );
    if (repo.publicContract.runUrl) {
      const link = document.createElement("a");
      link.href = repo.publicContract.runUrl;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = `Verification run · ${relativeDate(repo.publicContract.createdAt)}`;
      contract.append(link);
    }
  } else {
    contract.append(
      Object.assign(document.createElement("p"), {
        textContent: repo.publicContract?.state === "not-configured"
          ? "Public-contract pipeline not adopted."
          : "Public-contract pipeline exists, but no readable report summary is available yet.",
      }),
    );
  }

  const evidence = document.createElement("section");
  evidence.innerHTML = "<h3>Performance & quality</h3>";
  const capabilityLabels = { pages: "Pages", coverage: "Coverage", benchmarks: "Benchmarks", runtimeProfiler: "Runtime profiler", moonlight: "Moonlight" };
  Object.entries(capabilityLabels).forEach(([key, label]) => evidence.append(signal(label, repo.capabilities?.[key] === true)));
  for (const metric of repo.metrics ?? []) {
    const row = document.createElement("div");
    row.className = "metric";
    row.innerHTML = "<span></span><strong></strong>";
    row.querySelector("span").textContent = metric.label;
    row.querySelector("strong").textContent = `${metric.value} ${metric.unit}`;
    evidence.append(row);
  }
  for (const artifact of repo.evidenceArtifacts ?? []) {
    const p = document.createElement("p");
    p.textContent = `Artifact: ${artifact.name}${artifact.expired ? " (expired)" : ""}`;
    evidence.append(p);
  }
  target.replaceChildren(dogfood, pipeline, contract, evidence);
}

function makeRow(repo) {
  const template = $("#repo-row-template").content.cloneNode(true);
  const primary = template.querySelector(".repo-row");
  const detailRow = template.querySelector(".detail-row");
  const repoCell = template.querySelector(".repo-cell");
  const link = document.createElement("a");
  link.className = "repo-name";
  link.href = repo.url;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = repo.name;
  link.addEventListener("click", (event) => event.stopPropagation());
  repoCell.append(link);
  if (repo.description) repoCell.append(Object.assign(document.createElement("span"), { className: "repo-description", textContent: repo.description }));
  if (repo.language) repoCell.append(Object.assign(document.createElement("span"), { className: "secondary", textContent: repo.language }));

  const pipelineCell = template.querySelector(".pipeline-cell");
  pipelineCell.append(badge(prettyState(repo.pipeline?.state), repo.pipeline?.state));
  if (repo.pipeline?.workflow) pipelineCell.append(Object.assign(document.createElement("span"), { className: "secondary", textContent: repo.pipeline.workflow }));

  const contractCell = template.querySelector(".contract-cell");
  if (repo.publicContract?.state === "measured") {
    contractCell.append(
      Object.assign(document.createElement("strong"), {
        textContent: `${repo.publicContract.verified}/${repo.publicContract.discovered}`,
      }),
    );
    const meter = document.createElement("div");
    meter.className = "contract-meter";
    const fill = document.createElement("span");
    fill.style.width = percent(repo.publicContract.verifiedRatio);
    meter.append(fill);
    const note = repo.publicContract.incomplete > 0
      ? `${repo.publicContract.incomplete} incomplete`
      : `${repo.publicContract.unverified} unverified`;
    contractCell.append(
      meter,
      Object.assign(document.createElement("span"), { className: "secondary", textContent: note }),
    );
  } else {
    const label = repo.publicContract?.state === "not-configured" ? "not measured" : prettyState(repo.publicContract?.state);
    contractCell.append(Object.assign(document.createElement("span"), { className: "secondary", textContent: label }));
  }

  const foundationCell = template.querySelector(".foundation-cell");
  foundationCell.append(Object.assign(document.createElement("strong"), { textContent: `${repo.foundation?.adopted ?? 0}/${repo.foundation?.total ?? 7}` }));
  const meter = document.createElement("div");
  meter.className = "foundation-meter";
  const fill = document.createElement("span");
  fill.style.width = percent(repo.foundation?.ratio ?? 0);
  meter.append(fill);
  foundationCell.append(meter, Object.assign(document.createElement("span"), { className: "secondary", textContent: percent(repo.foundation?.ratio ?? 0) }));

  const capabilitiesCell = template.querySelector(".capabilities-cell");
  const caps = { coverage: "coverage", benchmarks: "bench", runtimeProfiler: "profiler", moonlight: "moonlight", pages: "pages" };
  const enabled = Object.entries(caps).filter(([key]) => repo.capabilities?.[key]);
  if (enabled.length) enabled.forEach(([, label]) => capabilitiesCell.append(signal(label, true)));
  else capabilitiesCell.append(Object.assign(document.createElement("span"), { className: "secondary", textContent: "none detected" }));

  const activityCell = template.querySelector(".activity-cell");
  activityCell.append(badge(repo.activity, repo.activity));
  activityCell.append(Object.assign(document.createElement("span"), { className: "secondary", textContent: relativeDate(repo.pushedAt) }));
  template.querySelector(".open-cell").textContent = String(repo.openIssuesAndPullRequests ?? 0);

  primary.tabIndex = 0;
  primary.setAttribute("aria-expanded", "false");
  const toggle = () => {
    const hidden = detailRow.hidden;
    detailRow.hidden = !hidden;
    primary.setAttribute("aria-expanded", String(hidden));
    if (hidden && !detailRow.dataset.rendered) {
      renderDetail(repo, detailRow.querySelector(".detail"));
      detailRow.dataset.rendered = "true";
    }
  };
  primary.addEventListener("click", toggle);
  primary.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggle(); }
  });
  return template;
}

function renderRepositories() {
  const repos = filteredRepositories();
  const target = $("#repositories");
  target.replaceChildren(...repos.map(makeRow));
  $("#result-count").textContent = `${repos.length} of ${state.snapshot.repositories.length}`;
  $("#empty").hidden = repos.length !== 0;
  $(".table-wrap").hidden = repos.length === 0;
}

function bindControls() {
  $("#search").addEventListener("input", (event) => { state.query = event.target.value; renderRepositories(); });
  $("#pipeline-filter").addEventListener("change", (event) => { state.pipeline = event.target.value; renderRepositories(); });
  $("#activity-filter").addEventListener("change", (event) => { state.activity = event.target.value; renderRepositories(); });
  $("#sort").addEventListener("change", (event) => { state.sort = event.target.value; renderRepositories(); });
}

async function main() {
  try {
    const response = await fetch(`./data/repositories.json?ts=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`snapshot HTTP ${response.status}`);
    state.snapshot = await response.json();
    renderSummary(state.snapshot);
    $("#freshness").textContent = `Snapshot ${relativeDate(state.snapshot.generatedAt)} · ${new Date(state.snapshot.generatedAt).toLocaleString()}`;
    bindControls();
    renderRepositories();
  } catch (error) {
    $("#freshness").textContent = `Unable to load snapshot: ${error instanceof Error ? error.message : String(error)}`;
    $("#empty").hidden = false;
    $("#empty").textContent = "The dashboard snapshot could not be loaded.";
    $(".table-wrap").hidden = true;
  }
}

main();
