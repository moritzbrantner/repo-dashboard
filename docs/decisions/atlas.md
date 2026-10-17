# Development Portfolio — Decision Atlas

This is the authoritative product-decision record for `repo-dashboard`. It consolidates the owner's steering answers through Question 32. Each numbered leaf is a **Decision**; headings are navigation branches. The labels `Q1`–`Q32` refer to the original steering questions, not to Atlas IDs.

Decisions are append-only: new decisions and consequential unresolved `[question]` leaves receive stable, unused child IDs. New answers append a Decision referring to the answered question; changes to established intent append a superseding Decision rather than silently rewriting old entries. GitHub issues own implementation and native dependencies; this Atlas owns product intent. Progress statistics are derived, not a second source of truth.

- **1** Portfolio overview and measurement
  - **1.1** [Q1 — A] The homepage is the repository portfolio overview; selecting a repository opens detailed product-decision and execution views.
  - **1.2** [Q2 — C] Keep product delivery, decision readiness, and execution health as separate dimensions. Never collapse them into one completion score.
  - **1.3** [Q3 — B] Display historical progress trends, with selectable periods such as 7, 30, and 90 days.
  - **1.4** [Q4 — C] Record implementation (for example, merged PRs) and verified delivery as separate events.
  - **1.5** [Q5 — revised] Do not measure project completion against a growing feature backlog. Report absolute work finished over time and lifetime totals; expanding scope must not appear as regression.
  - **1.6** [Q6 — C] Show total completed issues first, with optional breakdown by work type using existing GitHub metadata. Do not count issues closed as not planned as completed work.
  - **1.7** [Q21 — A] Use a dense sortable, searchable repository table as the portfolio homepage, not decorative scorecards.
  - **1.8** [Q22 — C] Reuse repository-specific acceptance evidence to establish verification; absence of evidence is unknown, not failed or verified. Do not add CI solely for dashboard reporting.
  - **1.9** [Q23 — C] Discover GitHub repositories automatically, including repositories without an Atlas. Support optional filtering for forks and archived repositories without a manually maintained registry.
  - **1.10** [Q24 — C] Backfill GitHub history and reliably recoverable Atlas history, then retain derived snapshots for comparisons. Never invent unavailable historical data.
- **2** Papyrus and execution graph
  - **2.1** [Q7 — refined] Execution is a horizontally scrollable papyrus: the past is left, currently active issues occupy the initial viewport, and future work extends right. Provide room for roughly 3–7 simultaneous issues without imposing Gantt deadlines.
  - **2.2** [Q8 — C] Show current issues individually; compact earlier and upcoming work into expandable groups.
  - **2.3** [Q9 — C] Automatically position nodes for a genuine dependency DAG, not fixed worker lanes. Follow graph branches and joins.
  - **2.4** [Q10 — C] Use a partial-order layout: observed history to the left, active work around the center, future dependencies to the right. Do not assign a forced order to independent work or invent dates.
  - **2.5** [Q11 — revised] Dependencies determine issue eligibility. Do not introduce an execution-priority system. Visual node dragging must not change dependencies; edit native edges separately.
  - **2.6** [Q12 — C] Focus the papyrus on one repository while displaying and following directly related cross-repository dependencies.
  - **2.7** [Q13 — A] Show unresolved decision blockers as badges on affected issue cards; clicking a badge opens the owning Atlas question. Decisions are not separate DAG nodes.
  - **2.8** [Q16 — A] GitHub native issue blocking relationships are the only authoritative implementation dependencies. Descriptions, mentions, and local caches cannot create an edge.
  - **2.9** [Q17 — C] Center the DAG on current work with immediate predecessors and successors; show disconnected, independent work in expandable groups rather than inventing edges.
  - **2.10** [Q18 — C] Classify apparent activity from GitHub evidence (linked open PRs, explicit in-progress state, recent activity), distinguishing signals from proof that a worker is active. Do not require live agent integration initially.
  - **2.11** [Q19 — A] GitHub issues explicitly reference the Decision Atlas questions blocking them. The Atlas owns the question and its answer; the issue owns the reference.
- **3** Decision editing and steering
  - **3.1** [Q14 — C] Apply edits through each repository's established workflow, including PRs and merging when allowed. A decision remains pending until its authoritative repository update succeeds.
  - **3.2** [Q20 — C] Support quick A/B/C answering in the Atlas tree and a detail editor for longer answers, new questions, and structural changes, keeping the hierarchy visible.
  - **3.3** [Q28 — C] Make unanswered questions accessible both in their repository context and in a central decision inbox; distinguish actual issue blockers without inventing priorities.
  - **3.4** [Q29 — C] Offer both free Atlas editing and one-question-at-a-time guided steering, separately for product and technical architecture.
  - **3.5** [Q30 — B] Discover new steering questions only on request, inspecting established decisions, architecture, and issues. Propose only consequential unresolved questions; do not manufacture a backlog.
  - **3.6** [Q31 — A, 2026-10-17] Delegate AI-assisted guided steering and on-demand question discovery to the existing coding agents and their repository-local `/steer` and `/tech-steer` workflows. Reuse agent skills, installed conventions, and existing product/technical decision records; do not build a parallel in-application steering engine. The portfolio is the graphical interface, not an alternative decision authority.
  - **3.7** [Q32 — A, 2026-10-17] Run AI-assisted steering through an existing coding-agent CLI launched as a local process on the machine hosting the portfolio, operating in the selected repository checkout and applying its own `/steer` or `/tech-steer` workflow, `AGENTS.md`, and installed conventions. Do not build or require a remote agent runner initially. If the local CLI or checkout is unavailable, surface the blocker rather than simulating an agent or switching to a parallel steering engine. Agent session lifetime and isolation remain separate decisions.
- **4** Operation and access
  - **4.1** [Q15 — A] Initially infer work status from GitHub issues, PRs, and CI; defer direct live-worker integration.
  - **4.2** [Q25 — A] The initial application is personal and private, with GitHub authentication and repository access controls.
  - **4.3** [Q26 — C] Deploy one self-hostable application locally or optionally in the cloud; do not maintain separate implementations.
  - **4.4** [Q27 — C] Open from cached data, refresh incrementally when accessed, and synchronize periodically while running. Show freshness and avoid redundant API requests.
