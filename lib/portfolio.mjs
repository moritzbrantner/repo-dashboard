// Pure, derived portfolio projections. GitHub issues and the Decision Atlas remain authoritative.
const numberedLine = /^(\s*)- \*\*(\d+(?:\.\d+)*)\*\*\s+(.+)$/;
const dotted = /^\d+(?:\.\d+)+$/;

export function parseAtlas(markdown) {
  const entries = [];
  for (const [index, line] of String(markdown).split("\n").entries()) {
    const match = numberedLine.exec(line);
    if (!match) continue;
    const [, indent, id, body] = match;
    const question = /^\[question\]\b/i.test(body) || body.startsWith("[question]");
    const answers = [...body.matchAll(/\bAnswers?\s+(\d+(?:\.\d+)+)\b/gi)].map((item) => item[1]);
    entries.push({ id, parent: id.includes(".") ? id.slice(0, id.lastIndexOf(".")) : null, body,
      line: index, indent: indent.length, kind: question ? "question" : "decision",
      answers, resolved: false });
  }
  const children = new Set(entries.map((entry) => entry.parent).filter(Boolean));
  const answered = new Set(entries.flatMap((entry) => entry.answers));
  for (const entry of entries) {
    if (children.has(entry.id) && entry.kind !== "question") entry.kind = "group";
    if (entry.kind === "question") entry.resolved = answered.has(entry.id);
  }
  return { entries, totalDecisions: entries.filter((e) => e.kind === "decision").length,
    openQuestions: entries.filter((e) => e.kind === "question" && !e.resolved).length,
    resolvedQuestions: entries.filter((e) => e.kind === "question" && e.resolved).length };
}

export function answerDecision(markdown, questionId, answer) {
  if (!dotted.test(questionId)) throw new Error("Select a numbered Decision Atlas question.");
  const trimmed = String(answer ?? "").trim().replace(/\s+/g, " ");
  if (trimmed.length < 5 || trimmed.length > 2000) throw new Error("Provide a descriptive answer (5–2000 characters).");
  const atlas = parseAtlas(markdown);
  const question = atlas.entries.find((entry) => entry.id === questionId && entry.kind === "question");
  if (!question) throw new Error("Question does not exist in this Decision Atlas.");
  if (question.resolved) throw new Error("Question has already been answered.");
  const parent = question.parent;
  const siblings = atlas.entries.filter((entry) => entry.parent === parent);
  const next = Math.max(0, ...siblings.map((entry) => Number(entry.id.split(".").at(-1)))) + 1;
  const newId = parent + "." + next;
  if (atlas.entries.some((entry) => entry.id === newId)) throw new Error("Decision ID collision.");
  // Preserve the parent numbering, append-only semantics and all historical entries.
  const lines = String(markdown).split("\n");
  let insertion = Math.max(...siblings.map((entry) => entry.line)) + 1;
  // A direct sibling can have nested children. Keep its whole subtree together.
  while (insertion < lines.length) {
    const found = numberedLine.exec(lines[insertion]);
    if (found && !found[2].startsWith(parent + ".")) break;
    if (!found && /^\s*- \*\*\d/.test(lines[insertion])) break;
    insertion += 1;
  }
  const indent = " ".repeat(question.indent);
  lines.splice(insertion, 0, indent + "- **" + newId + "** Answers " + questionId + ": " + trimmed);
  return { markdown: lines.join("\n"), decisionId: newId, questionId };
}

// Only explicitly named Atlas questions are references. Ordinary numbered text is not a blocker.
export function issueQuestionRefs(body) {
  const refs = new Set();
  for (const line of String(body ?? "").split("\n")) {
    const match = /\bDecision Atlas\s+(?:question|questions|Q)\s*[:#]?\s*(\d+(?:\.\d+)+(?:\s*[,;&]\s*\d+(?:\.\d+)+)*)/i.exec(line)
      ?? /\bDecision Atlas\s*:\s*(?:Q\s*)?(\d+(?:\.\d+)+(?:\s*[,;&]\s*\d+(?:\.\d+)+)*)/i.exec(line);
    if (match) for (const id of match[1].split(/\s*[,;&]\s*/)) if (dotted.test(id)) refs.add(id);
  }
  return [...refs];
}

export function isCompleted(issue) {
  return issue.state === "closed" && issue.state_reason !== "not_planned" && issue.state_reason !== "duplicate";
}

export function summarizeIssues(issues, now = new Date()) {
  const start = new Date(now.getTime() - 30 * 86_400_000);
  const wideStart = new Date(now.getTime() - 90 * 86_400_000);
  const completed = issues.filter(isCompleted);
  const recent = completed.filter((issue) => issue.closed_at && new Date(issue.closed_at) >= start);
  const daily = Array.from({ length: 90 }, () => 0);
  for (const issue of completed.filter((item) => item.closed_at && new Date(item.closed_at) >= wideStart)) {
    const elapsed = Math.floor((new Date(now).getTime() - new Date(issue.closed_at).getTime()) / 86_400_000);
    if (elapsed >= 0 && elapsed < 90) daily[89 - elapsed] += 1;
  }
  return { doneTotal: completed.length, done30: recent.length,
    open: issues.filter((issue) => issue.state === "open").length,
    activity: daily, byType: Object.fromEntries(
      [...new Set(completed.map((issue) => issue.type?.name ?? issue.labels?.find((label) => /^(feature|bug|maintenance|documentation)$/i.test(label.name))?.name ?? "Other"))]
        .map((kind) => [kind, completed.filter((issue) => (issue.type?.name ?? issue.labels?.find((label) => /^(feature|bug|maintenance|documentation)$/i.test(label.name))?.name ?? "Other") === kind).length])),
  };
}

export function issueActivity(issue, linkedOpenPr = false) {
  if (linkedOpenPr) return "open-pr";
  if ((issue.labels ?? []).some((label) => /^(in.progress|in progress|working)$/i.test(label.name))) return "in-progress";
  if (issue.state === "open" && issue.updated_at && Date.now() - Date.parse(issue.updated_at) < 7 * 86_400_000) return "recent";
  return issue.state === "closed" ? "done" : "ready-or-unknown";
}

// Graph relationships are only the native blocking edges; screen positions are not authority.
export function layoutDag(nodes, edges) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const incoming = new Map(nodes.map((node) => [node.id, []]));
  const outgoing = new Map(nodes.map((node) => [node.id, []]));
  for (const edge of edges) {
    if (!byId.has(edge.from) || !byId.has(edge.to) || edge.from === edge.to) continue;
    outgoing.get(edge.from).push(edge.to);
    incoming.get(edge.to).push(edge.from);
  }
  const queue = nodes.filter((node) => incoming.get(node.id).length === 0).map((node) => node.id);
  const ranks = new Map(nodes.map((node) => [node.id, node.state === "closed" ? -1 : node.active ? 0 : 1]));
  const visited = new Set();
  for (let i = 0; i < queue.length; i += 1) {
    const id = queue[i];
    visited.add(id);
    for (const next of outgoing.get(id)) {
      ranks.set(next, Math.max(ranks.get(next), ranks.get(id) + 1));
      const left = incoming.get(next);
      if (left.every((parent) => visited.has(parent))) queue.push(next);
    }
  }
  if (visited.size !== nodes.length) throw new Error("GitHub dependency graph contains a cycle.");
  const layers = new Map();
  for (const node of nodes) {
    const rank = ranks.get(node.id);
    if (!layers.has(rank)) layers.set(rank, []);
    layers.get(rank).push(node);
  }
  const positions = [];
  for (const [rank, layer] of [...layers].sort((a,b) => a[0]-b[0])) {
    layer.sort((a,b) => Number(b.active)-Number(a.active) || a.id.localeCompare(b.id));
    layer.forEach((node,i) => positions.push({ ...node, x: 60 + rank * 290,
      y: 70 + i * 104, predecessors: incoming.get(node.id), successors: outgoing.get(node.id) }));
  }
  const minimum = Math.min(0, ...positions.map((node) => node.x));
  return { nodes: positions.map((node) => ({ ...node, x: node.x - minimum + 40 })),
    edges: edges.filter((edge) => byId.has(edge.from) && byId.has(edge.to)),
    height: Math.max(400, ...[...layers.values()].map((layer) => layer.length * 104 + 100)),
    width: Math.max(800, ...positions.map((node) => node.x - minimum + 380)) };
}

export function appendAtlasEntry(markdown, parentId, kind, text) {
  if (!/^\d+(?:\.\d+)*$/.test(parentId)) throw new Error("Select an Atlas section.");
  if (!["question", "decision"].includes(kind)) throw new Error("Invalid Atlas entry kind.");
  const statement=String(text ?? "").trim().replace(/\s+/g," ");
  if (statement.length<10 || statement.length>2000) throw new Error("Provide a meaningful entry (10–2000 characters).");
  const atlas=parseAtlas(markdown);
  const parent=atlas.entries.find((entry)=>entry.id===parentId);
  if (!parent || parent.kind!=="group") throw new Error("New entries must belong to an existing numbered section.");
  const siblings=atlas.entries.filter((entry)=>entry.parent===parentId);
  const next=Math.max(0,...siblings.map((entry)=>Number(entry.id.split(".").at(-1))))+1;
  const newId=parentId+"."+next;
  if (atlas.entries.some((entry)=>entry.id===newId)) throw new Error("Atlas entry ID collision.");
  const lines=String(markdown).split("\n");
  let insertion=parent.line+1;
  // Insert after the full numbered subtree, never inside another numbered parent.
  while(insertion<lines.length) {
    const found=numberedLine.exec(lines[insertion]);
    if(found && !(found[2]===parentId || found[2].startsWith(parentId+"."))) break;
    insertion+=1;
  }
  const indent=" ".repeat(parent.indent+2);
  lines.splice(insertion,0,indent+"- **"+newId+"** "+(kind==="question"?"[question] ":"")+statement);
  return {markdown:lines.join("\n"),decisionId:newId,kind};
}
