import test from "node:test";
import assert from "node:assert/strict";
import {
  MATURITY_STAGES,
  REPOSITORY_TIERS,
  enrichLandscape,
  sanitizeDependencyArchitecture,
  validateLandscapeRegistry,
} from "../lib/landscape.mjs";

function makeRegistry(repositories = { alpha: { tier: "foundation", maturity: "proving" } }) {
  return {
    schemaVersion: 1,
    owner: "example",
    tierDefinitions: Object.fromEntries(
      REPOSITORY_TIERS.map((tier) => [tier, { description: tier, expectations: ["required"] }]),
    ),
    maturityDefinitions: Object.fromEntries(
      MATURITY_STAGES.map((stage) => [stage, { description: stage, promotionEvidence: "evidence" }]),
    ),
    repositories,
  };
}

function makeRepo(name) {
  return {
    name,
    url: `https://github.com/example/${name}`,
    defaultBranch: "main",
    collection: { treeAvailable: true },
    action: {
      kind: "none",
      priority: 100,
      id: "none",
      label: "No immediate action",
      detail: "No higher-priority evidence gap.",
      href: `https://github.com/example/${name}`,
    },
  };
}

test("registry is closed over supported tiers and maturity stages", () => {
  assert.deepEqual(validateLandscapeRegistry(makeRegistry()), []);

  const bad = makeRegistry({ alpha: { tier: "unknown", maturity: "proving" } });
  assert.ok(validateLandscapeRegistry(bad).some((error) => error.includes("tier must be one of")));
});

test("dependency architecture is sanitized fail-closed", () => {
  const result = sanitizeDependencyArchitecture(
    {
      schemaVersion: 1,
      repository: { name: "example/alpha", layer: "domain" },
      dependencies: [
        { repository: "example/base", layer: "foundation", relation: "foundation" },
      ],
    },
    "example",
    "alpha",
  );

  assert.deepEqual(result, {
    state: "declared",
    repositoryLayer: "domain",
    dependencies: [
      { repository: "example/base", layer: "foundation", relation: "foundation" },
    ],
  });

  const mismatch = sanitizeDependencyArchitecture(
    {
      schemaVersion: 1,
      repository: { name: "example/somewhere-else", layer: "domain" },
      dependencies: [],
    },
    "example",
    "alpha",
  );
  assert.equal(mismatch.state, "invalid");
});

test("enrichment builds dependency edges independently from lifecycle registration", async () => {
  const registry = makeRegistry({
    alpha: { tier: "shared-platform", maturity: "reusable" },
    base: { tier: "foundation", maturity: "stable" },
  });
  const client = {
    async textFile(_owner, repository) {
      if (!["alpha", "unknown"].includes(repository)) return null;
      return JSON.stringify({
        schemaVersion: 1,
        repository: { name: `example/${repository}`, layer: "domain" },
        dependencies: [
          { repository: "example/base", layer: "foundation", relation: "foundation" },
        ],
      });
    },
  };

  const result = await enrichLandscape(
    client,
    { owner: "example", maxConcurrency: 2 },
    [makeRepo("alpha"), makeRepo("base"), makeRepo("unknown")],
    registry,
  );

  assert.deepEqual(result.landscape.graph.edges, [
    {
      from: "alpha",
      to: "base",
      type: "dependency",
      relation: "foundation",
      targetArchitectureLayer: "foundation",
    },
    {
      from: "unknown",
      to: "base",
      type: "dependency",
      relation: "foundation",
      targetArchitectureLayer: "foundation",
    },
  ]);
  assert.equal(result.landscape.summary.registered, 2);
  assert.equal(result.landscape.summary.unregistered, 1);
  assert.equal(
    result.repositories.find((repo) => repo.name === "unknown").action.id,
    "classify-repository",
  );
});

test("higher-priority repository actions are preserved during landscape enrichment", async () => {
  const registry = makeRegistry({ alpha: { tier: "product", maturity: "proving" } });
  const repo = makeRepo("alpha");
  repo.action = {
    kind: "pipeline",
    priority: 1,
    id: "repair-pipeline",
    label: "Repair pipeline",
    detail: "Validation is failing.",
    href: repo.url,
  };
  const client = { async textFile() { return "not-json"; } };

  const result = await enrichLandscape(client, { owner: "example" }, [repo], registry);
  assert.equal(result.repositories[0].landscape.dependencyArchitecture.state, "invalid");
  assert.equal(result.repositories[0].action.id, "repair-pipeline");
});
