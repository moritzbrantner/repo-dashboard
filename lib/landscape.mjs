export const REPOSITORY_TIERS = Object.freeze([
  "foundation",
  "shared-platform",
  "product",
  "lab",
  "template",
]);

export const MATURITY_STAGES = Object.freeze([
  "experiment",
  "proving",
  "reusable",
  "stable",
  "maintenance",
]);

export const ARCHITECTURE_LAYERS = Object.freeze([
  "foundation",
  "domain",
  "adapter",
  "application",
  "tooling",
]);

const FULL_REPOSITORY_NAME = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateDefinition(errors, collection, id, path, maturity = false) {
  const definition = collection?.[id];
  if (!isObject(definition)) {
    errors.push(`${path}.${id} is required`);
    return;
  }
  if (typeof definition.description !== "string" || definition.description.length === 0) {
    errors.push(`${path}.${id}.description is required`);
  }
  if (maturity) {
    if (typeof definition.promotionEvidence !== "string" || definition.promotionEvidence.length === 0) {
      errors.push(`${path}.${id}.promotionEvidence is required`);
    }
    return;
  }
  if (!Array.isArray(definition.expectations) || definition.expectations.length === 0) {
    errors.push(`${path}.${id}.expectations must be a non-empty array`);
  } else if (definition.expectations.some((expectation) => typeof expectation !== "string" || expectation.length === 0)) {
    errors.push(`${path}.${id}.expectations must contain non-empty strings`);
  }
}

export function validateLandscapeRegistry(registry) {
  const errors = [];
  if (!isObject(registry) || registry.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (typeof registry?.owner !== "string" || registry.owner.length === 0) errors.push("owner is required");

  for (const tier of REPOSITORY_TIERS) {
    validateDefinition(errors, registry?.tierDefinitions, tier, "tierDefinitions");
  }
  for (const tier of Object.keys(registry?.tierDefinitions ?? {})) {
    if (!REPOSITORY_TIERS.includes(tier)) errors.push(`tierDefinitions.${tier} is not a supported tier`);
  }

  for (const stage of MATURITY_STAGES) {
    validateDefinition(errors, registry?.maturityDefinitions, stage, "maturityDefinitions", true);
  }
  for (const stage of Object.keys(registry?.maturityDefinitions ?? {})) {
    if (!MATURITY_STAGES.includes(stage)) errors.push(`maturityDefinitions.${stage} is not a supported maturity stage`);
  }

  if (!isObject(registry?.repositories)) {
    errors.push("repositories must be an object");
    return errors;
  }

  for (const [name, metadata] of Object.entries(registry.repositories)) {
    if (!name || name.includes("/")) errors.push(`repositories.${name || "<empty>"} must use an owner-local repository name`);
    if (!isObject(metadata)) {
      errors.push(`repositories.${name} must be an object`);
      continue;
    }
    if (!REPOSITORY_TIERS.includes(metadata.tier)) {
      errors.push(`repositories.${name}.tier must be one of ${REPOSITORY_TIERS.join(", ")}`);
    }
    if (!MATURITY_STAGES.includes(metadata.maturity)) {
      errors.push(`repositories.${name}.maturity must be one of ${MATURITY_STAGES.join(", ")}`);
    }
  }

  return errors;
}

function invalidDependencyArchitecture(reason) {
  return {
    state: "invalid",
    repositoryLayer: null,
    dependencies: [],
    reason,
  };
}

export function sanitizeDependencyArchitecture(document, owner, repositoryName) {
  const expectedRepository = `${owner}/${repositoryName}`;
  if (!isObject(document) || document.schemaVersion !== 1) {
    return invalidDependencyArchitecture("schemaVersion must be 1");
  }
  if (document.repository?.name !== expectedRepository) {
    return invalidDependencyArchitecture(`repository.name must be ${expectedRepository}`);
  }
  if (!ARCHITECTURE_LAYERS.includes(document.repository?.layer)) {
    return invalidDependencyArchitecture("repository.layer is unsupported");
  }
  if (!Array.isArray(document.dependencies)) {
    return invalidDependencyArchitecture("dependencies must be an array");
  }
  if (document.dependencies.length > 64) {
    return invalidDependencyArchitecture("dependencies exceeds the dashboard safety limit");
  }

  const dependencies = [];
  const seen = new Set();
  for (const dependency of document.dependencies) {
    if (!isObject(dependency) || typeof dependency.repository !== "string" || !FULL_REPOSITORY_NAME.test(dependency.repository)) {
      return invalidDependencyArchitecture("dependency repository is invalid");
    }
    if (!ARCHITECTURE_LAYERS.includes(dependency.layer)) {
      return invalidDependencyArchitecture(`dependency ${dependency.repository} has an unsupported layer`);
    }
    if (typeof dependency.relation !== "string" || dependency.relation.length === 0 || dependency.relation.length > 40) {
      return invalidDependencyArchitecture(`dependency ${dependency.repository} has an invalid relation`);
    }
    if (seen.has(dependency.repository)) {
      return invalidDependencyArchitecture(`dependency ${dependency.repository} is duplicated`);
    }
    seen.add(dependency.repository);
    dependencies.push({
      repository: dependency.repository,
      layer: dependency.layer,
      relation: dependency.relation,
    });
  }

  return {
    state: "declared",
    repositoryLayer: document.repository.layer,
    dependencies,
  };
}

export function parseDependencyArchitecture(text, owner, repositoryName) {
  if (typeof text !== "string" || text.length === 0) return null;
  try {
    return sanitizeDependencyArchitecture(JSON.parse(text), owner, repositoryName);
  } catch {
    return invalidDependencyArchitecture("dependency contract is not valid JSON");
  }
}

function classificationAction(repo) {
  return {
    kind: "landscape",
    priority: 30,
    id: "classify-repository",
    label: "Classify repository tier and maturity",
    detail: "Add this repository to config/landscape.json before treating its lifecycle or reuse role as known.",
    href: repo.url ?? null,
  };
}

function dependencyContractAction(repo, architecture) {
  return {
    kind: "landscape",
    priority: 24,
    id: "repair-dependency-contract",
    label: "Repair dependency architecture evidence",
    detail: architecture.reason
      ? `The declared .coding-tooling.dependencies.json contract is invalid: ${architecture.reason}.`
      : "The declared dependency architecture could not be read reliably.",
    href: repo.url ?? null,
  };
}

async function enrichRepository(client, config, repo, registry) {
  const metadata = registry.repositories[repo.name] ?? null;
  let dependencyArchitecture = {
    state: "not-declared",
    repositoryLayer: null,
    dependencies: [],
  };

  try {
    const text = await client.textFile(
      config.owner,
      repo.name,
      ".coding-tooling.dependencies.json",
      repo.defaultBranch || "main",
    );
    if (text) {
      dependencyArchitecture = parseDependencyArchitecture(text, config.owner, repo.name);
    } else if (repo.collection?.treeAvailable === false) {
      dependencyArchitecture = {
        state: "unavailable",
        repositoryLayer: null,
        dependencies: [],
        reason: "repository tree evidence is unavailable",
      };
    }
  } catch (error) {
    dependencyArchitecture = {
      state: "unavailable",
      repositoryLayer: null,
      dependencies: [],
      reason: error instanceof Error ? error.message : String(error),
    };
  }

  let action = repo.action;
  const existingPriority = action?.priority ?? 100;
  if (["invalid", "unavailable"].includes(dependencyArchitecture.state) && existingPriority >= 24) {
    action = dependencyContractAction(repo, dependencyArchitecture);
  } else if (!metadata && existingPriority >= 30) {
    action = classificationAction(repo);
  }

  return {
    ...repo,
    action,
    landscape: {
      registered: metadata !== null,
      tier: metadata?.tier ?? null,
      maturity: metadata?.maturity ?? null,
      dependencyArchitecture,
    },
  };
}

function buildGraph(repositories, registry) {
  const byName = new Map(repositories.map((repo) => [repo.name, repo]));
  const nodes = repositories.map((repo) => ({
    name: repo.name,
    url: repo.url,
    registered: repo.landscape?.registered === true,
    tier: repo.landscape?.tier ?? null,
    maturity: repo.landscape?.maturity ?? null,
    architectureLayer: repo.landscape?.dependencyArchitecture?.repositoryLayer ?? null,
  }));
  const edges = [];
  let omittedExternalEdges = 0;

  for (const repo of repositories) {
    for (const dependency of repo.landscape?.dependencyArchitecture?.dependencies ?? []) {
      const [targetOwner, targetName] = dependency.repository.split("/");
      if (targetOwner !== registry.owner || !byName.has(targetName)) {
        omittedExternalEdges += 1;
        continue;
      }
      edges.push({
        from: repo.name,
        to: targetName,
        type: "dependency",
        relation: dependency.relation,
        targetArchitectureLayer: dependency.layer,
      });
    }
  }

  nodes.sort((left, right) => left.name.localeCompare(right.name));
  edges.sort((left, right) =>
    left.from.localeCompare(right.from) || left.to.localeCompare(right.to) || left.relation.localeCompare(right.relation),
  );

  return {
    schemaVersion: 1,
    nodes,
    edges,
    omittedExternalEdges,
  };
}

function countBy(repositories, selector, allowed) {
  return Object.fromEntries(allowed.map((value) => [
    value,
    repositories.filter((repo) => selector(repo) === value).length,
  ]));
}

function summarizeLandscape(repositories, graph) {
  const registered = repositories.filter((repo) => repo.landscape?.registered === true).length;
  const contractStates = ["declared", "not-declared", "invalid", "unavailable"];
  return {
    registered,
    unregistered: repositories.length - registered,
    coverageRatio: repositories.length === 0 ? 0 : registered / repositories.length,
    byTier: countBy(repositories, (repo) => repo.landscape?.tier, REPOSITORY_TIERS),
    byMaturity: countBy(repositories, (repo) => repo.landscape?.maturity, MATURITY_STAGES),
    dependencyContracts: Object.fromEntries(contractStates.map((state) => [
      state,
      repositories.filter((repo) => repo.landscape?.dependencyArchitecture?.state === state).length,
    ])),
    graphNodes: graph.nodes.length,
    graphEdges: graph.edges.length,
  };
}

export async function enrichLandscape(client, config, repositories, registry) {
  const errors = validateLandscapeRegistry(registry);
  if (errors.length > 0) throw new Error(`Invalid landscape registry:\n${errors.join("\n")}`);
  if (registry.owner !== config.owner) {
    throw new Error(`Landscape owner ${registry.owner} does not match dashboard owner ${config.owner}`);
  }

  const enriched = new Array(repositories.length);
  let cursor = 0;
  const concurrency = Math.max(1, Math.min(Number(config.maxConcurrency) || 4, 12));
  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= repositories.length) return;
      enriched[index] = await enrichRepository(client, config, repositories[index], registry);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, repositories.length || 1) }, () => worker()));

  const graph = buildGraph(enriched, registry);
  return {
    repositories: enriched,
    landscape: {
      schemaVersion: 1,
      registrySchemaVersion: registry.schemaVersion,
      summary: summarizeLandscape(enriched, graph),
      graph,
    },
  };
}
