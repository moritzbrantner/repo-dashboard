import test from "node:test";
import assert from "node:assert/strict";
import { parseAtlas, answerDecision, appendAtlasEntry, issueQuestionRefs, summarizeIssues, layoutDag } from "../lib/portfolio.mjs";

const atlas = [
  "- **1** Combat",
  "  - **1.1** Guard",
  "    - **1.1.1** [question] Choose A: fast or B: slow",
  "    - **1.1.2** [implemented] Movement works.",
  "- **2** World",
  "  - **2.1** [question] How many zones?",
].join("\n") + "\n";

test("Atlas navigation entries are not decisions and only explicit Answers resolve a question", () => {
  const parsed = parseAtlas(atlas);
  assert.equal(parsed.totalDecisions, 1);
  assert.equal(parsed.openQuestions, 2);
  assert.deepEqual(parsed.entries.map((node) => node.id), ["1","1.1","1.1.1","1.1.2","2","2.1"]);
});

test("answering appends a stable sibling ID without renumbering or deleting history", () => {
  const updated = answerDecision(atlas, "1.1.1", "Choice A — fast directional guard");
  assert.equal(updated.decisionId, "1.1.3");
  assert.match(updated.markdown, /- \*\*1\.1\.3\*\* Answers 1\.1\.1: Choice A/);
  assert.equal(parseAtlas(updated.markdown).resolvedQuestions, 1);
  assert.throws(() => answerDecision(updated.markdown, "1.1.1", "Choice B — slow"), /already/);
});

test("decision reference extraction is explicit, not arbitrary issue mentions", () => {
  assert.deepEqual(issueQuestionRefs("Blocked by #42.\nDecision Atlas questions: 1.1.1, 2.1\nSee 5.2.3"), ["1.1.1", "2.1"]);
});

test("throughput excludes not-planned issues and uses actual close dates", () => {
  const sample = [
    {state:"closed",state_reason:"completed",closed_at:"2026-10-15T12:00:00Z",labels:[{name:"feature"}]},
    {state:"closed",state_reason:"not_planned",closed_at:"2026-10-15T12:00:00Z",labels:[]},
    {state:"open",labels:[]},
  ];
  const result = summarizeIssues(sample, new Date("2026-10-16T12:00:00Z"));
  assert.equal(result.doneTotal, 1);
  assert.equal(result.done30, 1);
  assert.equal(result.open, 1);
  assert.equal(result.activity.reduce((a,b)=>a+b,0), 1);
  assert.equal(result.byType.feature, 1);
});

test("DAG displays fan-in and fan-out and rejects cycles", () => {
  const nodes = ["a","b","c","d"].map((id) => ({ id, state:id==="a"?"closed":"open", active:id==="c" }));
  const edges = [{from:"a",to:"c"},{from:"b",to:"c"},{from:"c",to:"d"}];
  const output = layoutDag(nodes,edges);
  const byId = new Map(output.nodes.map((node)=>[node.id,node]));
  for (const {from,to} of edges) assert.ok(byId.get(from).x < byId.get(to).x);
  assert.deepEqual(byId.get("c").predecessors, ["a","b"]);
  assert.throws(() => layoutDag(nodes,[...edges,{from:"d",to:"a"}]), /cycle/);
});

test("new questions are appended under the section without changing other IDs", () => {
  const created=appendAtlasEntry(atlas,"1.1","question","How should a guard respond to high attacks?");
  assert.equal(created.decisionId,"1.1.3");
  assert.equal(parseAtlas(created.markdown).openQuestions,3);
});
