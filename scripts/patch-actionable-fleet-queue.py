from pathlib import Path


def replace_once(source: str, old: str, new: str, label: str) -> str:
    if source.count(old) != 1:
        raise SystemExit(f"unexpected {label} anchor count: {source.count(old)}")
    return source.replace(old, new, 1)


model_path = Path("lib/model.mjs")
model = model_path.read_text()
action_model = r'''
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

'''
model = replace_once(
    model,
    "export const RECONCILIATION_METRIC_IDS = Object.freeze({\n",
    action_model + "export const RECONCILIATION_METRIC_IDS = Object.freeze({\n",
    "model action insertion",
)
model_path.write_text(model)


github_path = Path("lib/github.mjs")
github = github_path.read_text()
github = replace_once(
    github,
    'import { CAPABILITY_SIGNALS, classifyActivity, pipelineState, sanitizeMetricsDocument, scoreFoundation } from "./model.mjs";\n',
    'import { CAPABILITY_SIGNALS, classifyActivity, deriveRepositoryAction, pipelineState, sanitizeMetricsDocument, scoreFoundation } from "./model.mjs";\n',
    "github model import",
)
github = replace_once(
    github,
    "  return results.sort((a, b) => a.name.localeCompare(b.name));\n",
    "  return results\n    .map((repo) => ({ ...repo, action: deriveRepositoryAction(repo) }))\n    .sort((a, b) => a.name.localeCompare(b.name));\n",
    "fleet action enrichment",
)
github_path.write_text(github)


test_path = Path("tests/model.test.mjs")
tests = test_path.read_text()
tests = replace_once(
    tests,
    'import { classifyActivity, pipelineState, sanitizeMetricsDocument, scoreFoundation, summarizeFleet } from "../lib/model.mjs";\n',
    'import { classifyActivity, deriveRepositoryAction, pipelineState, sanitizeMetricsDocument, scoreFoundation, summarizeFleet } from "../lib/model.mjs";\n',
    "model test import",
)
tests += r'''

test("repository action repairs failing validation before lower-priority gaps", () => {
  const action = deriveRepositoryAction({
    url: "https://github.com/example/repo",
    dogfood: { validation: true, environment: false },
    collection: { treeAvailable: true },
    pipeline: {
      state: "failing",
      url: "https://github.com/example/repo/actions/runs/1",
      failureJobs: [{ name: "Validate", failedSteps: ["Run tests"] }],
    },
    publicContract: { state: "measured", unverified: 3 },
  });
  assert.deepEqual(action, {
    kind: "pipeline",
    priority: 1,
    id: "repair-pipeline",
    label: "Repair Validate",
    detail: "The latest default-branch run failed at Run tests.",
    href: "https://github.com/example/repo/actions/runs/1",
  });
});

test("repository action advances foundation adoption one deterministic gap at a time", () => {
  const action = deriveRepositoryAction({
    url: "https://github.com/example/repo",
    collection: { treeAvailable: true },
    pipeline: { state: "passing" },
    dogfood: {
      validation: true,
      environment: false,
      conventions: false,
      renovate: false,
      reusableWorkflows: true,
      codingTooling: true,
      agents: true,
    },
    publicContract: { state: "not-configured" },
    activity: "recent",
  });
  assert.equal(action.id, "adopt-environment");
  assert.equal(action.kind, "foundation");
});

test("repository action preserves incomplete public-contract evidence after foundation completion", () => {
  const action = deriveRepositoryAction({
    url: "https://github.com/example/repo",
    collection: { treeAvailable: true },
    pipeline: { state: "passing" },
    dogfood: {
      validation: true,
      environment: true,
      conventions: true,
      renovate: true,
      reusableWorkflows: true,
      codingTooling: true,
      agents: true,
    },
    publicContract: {
      state: "measured",
      failedEvidence: 0,
      incomplete: 2,
      unverified: 0,
      runUrl: "https://github.com/example/repo/actions/runs/2",
    },
    activity: "recent",
  });
  assert.equal(action.id, "complete-public-contract-discovery");
  assert.equal(action.kind, "contract");
});

test("repository action does not invent work when current evidence is healthy", () => {
  const action = deriveRepositoryAction({
    url: "https://github.com/example/repo",
    collection: { treeAvailable: true },
    pipeline: { state: "passing" },
    dogfood: {
      validation: true,
      environment: true,
      conventions: true,
      renovate: true,
      reusableWorkflows: true,
      codingTooling: true,
      agents: true,
    },
    publicContract: { state: "not-configured" },
    activity: "recent",
  });
  assert.equal(action.id, "none");
  assert.equal(action.priority, 100);
});
'''
test_path.write_text(tests)


index_path = Path("site/index.html")
index = index_path.read_text()
index = replace_once(
    index,
    "<p class=\"lede\">CI health, verified public contracts, foundation dogfood, quality capabilities, activity, reconciliation efficiency, and published performance evidence in one read-only view.</p>",
    "<p class=\"lede\">A read-only fleet queue that turns CI, foundation, public-contract, activity, and performance evidence into one deterministic next action per repository.</p>",
    "hero copy",
)
index = replace_once(
    index,
    '<section class="summary" id="summary" aria-label="Fleet summary"></section>',
    '<section class="summary" id="summary" aria-label="Next fleet action"></section>',
    "summary label",
)
action_filter = '''        <label>
          <span>Action</span>
          <select id="action-filter">
            <option value="all">All</option>
            <option value="pipeline">Pipeline</option>
            <option value="foundation">Foundation</option>
            <option value="contract">Public contract</option>
            <option value="evidence">Evidence</option>
            <option value="maintenance">Maintenance</option>
            <option value="none">No immediate action</option>
          </select>
        </label>
'''
index = replace_once(
    index,
    "        <label>\n          <span>Sort</span>\n",
    action_filter + "        <label>\n          <span>Sort</span>\n",
    "action filter",
)
index = replace_once(
    index,
    '<option value="risk">Needs attention</option>',
    '<option value="action">Next action</option>',
    "action sort option",
)
old_headers = '''                <th>Repository</th>
                <th>Pipeline</th>
                <th>Public contract</th>
                <th>Foundation</th>
                <th>Capabilities</th>
                <th>Activity</th>
                <th>Open</th>'''
new_headers = '''                <th>Repository</th>
                <th>Next action</th>
                <th>Pipeline</th>
                <th>Foundation</th>
                <th>Public contract</th>
                <th>Capabilities</th>
                <th>Activity</th>'''
index = replace_once(index, old_headers, new_headers, "table headers")
old_cells = '''        <td class="repo-cell"></td>
        <td class="pipeline-cell"></td>
        <td class="contract-cell"></td>
        <td class="foundation-cell"></td>
        <td class="capabilities-cell"></td>
        <td class="activity-cell"></td>
        <td class="open-cell"></td>'''
new_cells = '''        <td class="repo-cell"></td>
        <td class="action-cell"></td>
        <td class="pipeline-cell"></td>
        <td class="foundation-cell"></td>
        <td class="contract-cell"></td>
        <td class="capabilities-cell"></td>
        <td class="activity-cell"></td>'''
index = replace_once(index, old_cells, new_cells, "row cells")
index_path.write_text(index)


app_path = Path("site/app.js")
app = app_path.read_text()
app = replace_once(
    app,
    'const state = { snapshot: null, query: "", pipeline: "all", activity: "all", sort: "risk" };',
    'const state = { snapshot: null, query: "", pipeline: "all", activity: "all", action: "all", sort: "action" };',
    "app state",
)
start = app.index("function summaryCard(")
end = app.index("function badge(")
action_focus = r'''function renderActionFocus(snapshot) {
  const target = $("#summary");
  const candidates = [...snapshot.repositories]
    .filter((repo) => repo.action?.id && repo.action.id !== "none")
    .sort((a, b) => (a.action.priority ?? 100) - (b.action.priority ?? 100) || a.name.localeCompare(b.name));

  const article = document.createElement("article");
  article.className = "action-focus";
  const copy = document.createElement("div");
  copy.className = "action-focus-copy";
  const kicker = document.createElement("span");
  kicker.className = "action-kicker";
  kicker.textContent = "Next fleet action";
  const title = document.createElement("h2");
  const detail = document.createElement("p");
  detail.className = "action-detail";
  copy.append(kicker, title, detail);

  const top = candidates[0];
  if (!top) {
    title.textContent = "No immediate remediation from the current snapshot";
    detail.textContent = "The queue stays empty rather than inventing work when deterministic evidence exposes no higher-priority gap.";
    article.append(copy);
    target.replaceChildren(article);
    return;
  }

  const repoLink = document.createElement("a");
  repoLink.href = top.url;
  repoLink.target = "_blank";
  repoLink.rel = "noreferrer";
  repoLink.textContent = top.name;
  title.append(repoLink, document.createTextNode(` — ${top.action.label}`));
  detail.textContent = top.action.detail;
  article.append(copy);

  if (top.action.href) {
    const evidenceLink = document.createElement("a");
    evidenceLink.className = "action-evidence-link";
    evidenceLink.href = top.action.href;
    evidenceLink.target = "_blank";
    evidenceLink.rel = "noreferrer";
    evidenceLink.textContent = "Open evidence";
    article.append(evidenceLink);
  }
  target.replaceChildren(article);
}

'''
app = app[:start] + action_focus + app[end:]
app = replace_once(
    app,
    "    repo.publicContract?.state,\n",
    "    repo.publicContract?.state,\n    repo.action?.label,\n    repo.action?.detail,\n    repo.action?.kind,\n",
    "searchable action fields",
)
app = replace_once(
    app,
    "  return [pipeline, contract, stale, repo.foundation?.ratio ?? 0, repo.name];\n",
    "  return [repo.action?.priority ?? 100, pipeline, contract, stale, repo.foundation?.ratio ?? 0, repo.name];\n",
    "action risk rank",
)
app = replace_once(
    app,
    '    (state.pipeline === "all" || repo.pipeline?.state === state.pipeline) &&\n    (state.activity === "all" || repo.activity === state.activity)\n',
    '    (state.pipeline === "all" || repo.pipeline?.state === state.pipeline) &&\n    (state.activity === "all" || repo.activity === state.activity) &&\n    (state.action === "all" || repo.action?.kind === state.action)\n',
    "action filter predicate",
)
app = replace_once(
    app,
    "function renderDetail(repo, target) {\n  const dogfood = document.createElement(\"section\");\n",
    r'''function renderDetail(repo, target) {
  const nextAction = document.createElement("section");
  nextAction.innerHTML = "<h3>Next action</h3>";
  const actionTitle = document.createElement("p");
  const actionStrong = document.createElement("strong");
  actionStrong.textContent = repo.action?.label ?? "Action evidence unavailable";
  actionTitle.append(actionStrong);
  nextAction.append(actionTitle);
  if (repo.action?.detail) {
    nextAction.append(Object.assign(document.createElement("p"), { textContent: repo.action.detail }));
  }
  if (repo.action?.href && repo.action.id !== "none") {
    const actionLink = document.createElement("a");
    actionLink.href = repo.action.href;
    actionLink.target = "_blank";
    actionLink.rel = "noreferrer";
    actionLink.textContent = "Open supporting evidence";
    nextAction.append(actionLink);
  }

  const dogfood = document.createElement("section");
''',
    "detail action section",
)
app = replace_once(
    app,
    "  target.replaceChildren(dogfood, pipeline, contract, evidence);\n",
    "  target.replaceChildren(nextAction, dogfood, pipeline, contract, evidence);\n",
    "detail action placement",
)
app = replace_once(
    app,
    '  if (repo.language) repoCell.append(Object.assign(document.createElement("span"), { className: "secondary", textContent: repo.language }));\n\n  const pipelineCell = template.querySelector(".pipeline-cell");\n',
    r'''  if (repo.language) repoCell.append(Object.assign(document.createElement("span"), { className: "secondary", textContent: repo.language }));

  const actionCell = template.querySelector(".action-cell");
  const action = repo.action ?? { kind: "evidence", id: "unavailable", label: "Action evidence unavailable" };
  const actionLabel = action.href && action.id !== "none" ? document.createElement("a") : document.createElement("strong");
  actionLabel.textContent = action.label;
  if (actionLabel instanceof HTMLAnchorElement) {
    actionLabel.href = action.href;
    actionLabel.target = "_blank";
    actionLabel.rel = "noreferrer";
    actionLabel.addEventListener("click", (event) => event.stopPropagation());
  }
  actionCell.append(actionLabel);
  actionCell.append(Object.assign(document.createElement("span"), { className: "secondary", textContent: prettyState(action.kind) }));

  const pipelineCell = template.querySelector(".pipeline-cell");
''',
    "table action cell",
)
app = replace_once(
    app,
    '  template.querySelector(".open-cell").textContent = String(repo.openIssuesAndPullRequests ?? 0);\n\n',
    "",
    "remove open count",
)
app = replace_once(
    app,
    '  $("#activity-filter").addEventListener("change", (event) => { state.activity = event.target.value; renderRepositories(); });\n  $("#sort").addEventListener("change", (event) => { state.sort = event.target.value; renderRepositories(); });\n',
    '  $("#activity-filter").addEventListener("change", (event) => { state.activity = event.target.value; renderRepositories(); });\n  $("#action-filter").addEventListener("change", (event) => { state.action = event.target.value; renderRepositories(); });\n  $("#sort").addEventListener("change", (event) => { state.sort = event.target.value; renderRepositories(); });\n',
    "action filter binding",
)
app = replace_once(app, "    renderSummary(state.snapshot);\n", "    renderActionFocus(state.snapshot);\n", "action focus render")
app_path.write_text(app)


styles_path = Path("site/styles.css")
styles = styles_path.read_text()
start = styles.index(".summary {")
end = styles.index(".controls {")
action_css = r'''.summary { margin-bottom: 20px; }
.action-focus { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 24px; align-items: center; padding: 20px 22px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); }
.action-focus-copy { display: grid; gap: 6px; }
.action-kicker { color: var(--accent); font-size: 0.74rem; font-weight: 750; letter-spacing: 0.08em; text-transform: uppercase; }
.action-focus h2 { font-size: 1.05rem; line-height: 1.35; }
.action-focus h2 a { text-decoration-thickness: 1px; text-underline-offset: 3px; }
.action-detail { max-width: 960px; margin: 0; color: var(--muted); font-size: 0.86rem; line-height: 1.5; }
.action-evidence-link { display: inline-flex; align-items: center; min-height: 38px; padding: 0 13px; border: 1px solid var(--border); border-radius: 9px; text-decoration: none; font-size: 0.82rem; font-weight: 700; }
'''
styles = styles[:start] + action_css + styles[end:]
styles = replace_once(
    styles,
    ".controls { display: grid; grid-template-columns: minmax(240px, 2fr) repeat(3, minmax(140px, 1fr)); gap: 12px; padding: 16px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); }",
    ".controls { display: grid; grid-template-columns: minmax(240px, 2fr) repeat(4, minmax(130px, 1fr)); gap: 12px; padding: 16px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); }",
    "controls grid",
)
styles = replace_once(
    styles,
    "table { width: 100%; border-collapse: collapse; min-width: 1140px; }",
    "table { width: 100%; border-collapse: collapse; min-width: 1280px; }",
    "table width",
)
styles = replace_once(
    styles,
    ".repo-name { font-weight: 720; text-decoration: none; }\n",
    ".repo-name { font-weight: 720; text-decoration: none; }\n.action-cell { min-width: 230px; max-width: 320px; }\n.action-cell > a { font-weight: 720; text-decoration-thickness: 1px; text-underline-offset: 3px; }\n",
    "action cell styles",
)
styles = styles.replace("  .summary { grid-template-columns: repeat(3, minmax(0, 1fr)); }\n", "")
styles = styles.replace("  .summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }\n", "")
styles = styles.replace("  .summary, .controls { grid-template-columns: 1fr; }\n", "  .controls { grid-template-columns: 1fr; }\n")
styles = replace_once(
    styles,
    "  .freshness { margin-top: 14px; }\n",
    "  .freshness { margin-top: 14px; }\n  .action-focus { grid-template-columns: 1fr; }\n",
    "mobile action focus",
)
styles_path.write_text(styles)


readme_path = Path("README.md")
readme = readme_path.read_text()
old_questions = '''A static operational dashboard for the `moritzbrantner` repository fleet. It answers six questions without becoming another source of truth:

1. **Is the repository healthy?** Latest default-branch pipeline state and failed jobs.
2. **Is its public contract verified?** Report-derived counts for discovered, verified, unverified, and incompletely analyzed external surfaces.
3. **Does it dogfood the shared engineering landscape?** Conservative evidence for agent guidance, environment contracts, conventions, Renovate, validation, reusable workflows, and coding-tooling.
4. **What quality/performance capabilities exist?** Pages, coverage, benchmarks, runtime-profiler, Moonlight, plus optionally published metrics.
5. **Is work moving?** Last push, open issue/PR count, archived state, and stale/recent activity classification.
6. **How much deterministic work is avoided?** Optional reconciliation metrics distinguish real changes from verified no-ops.
'''
new_questions = '''A static operational dashboard for the `moritzbrantner` repository fleet. It answers seven questions without becoming another source of truth:

1. **Is the repository healthy?** Latest default-branch pipeline state and failed jobs.
2. **Is its public contract verified?** Report-derived discovered, verified, unverified, and incompletely analyzed external surfaces.
3. **Does it dogfood the shared engineering landscape?** Conservative evidence for agent guidance, environment contracts, conventions, Renovate, validation, reusable workflows, and coding-tooling.
4. **What should happen next?** One deterministic remediation derived from evidence, ordered pipeline → foundation → public contract → stale ownership review.
5. **What quality/performance capabilities exist?** Pages, coverage, benchmarks, runtime-profiler, Moonlight, plus optionally published metrics.
6. **Is work moving?** Last push, archived state, and stale/recent activity classification.
7. **How much deterministic work is avoided?** Optional reconciliation metrics distinguish real changes from verified no-ops.
'''
readme = replace_once(readme, old_questions, new_questions, "README questions")
readme = replace_once(
    readme,
    "The dashboard is intentionally read-only. It observes repositories; it does not edit them. Private repositories are excluded by default so a public Pages deployment cannot leak their names or metadata.\n",
    "The dashboard is intentionally read-only. It observes repositories; it does not edit them. Private repositories are excluded by default so a public Pages deployment cannot leak their names or metadata. The UI leads with the next evidence-backed action instead of fleet KPI/count cards; raw measurements stay attached to the repository evidence where they can drive an actual decision.\n",
    "README action principle",
)
readme = replace_once(
    readme,
    "- `lib/model.mjs` owns scoring, activity classification, summaries, reconciliation efficiency, and snapshot validation.\n",
    "- `lib/model.mjs` owns scoring, activity classification, deterministic next-action derivation, summaries, reconciliation efficiency, and snapshot validation.\n",
    "README model ownership",
)
readme_path.write_text(readme)
