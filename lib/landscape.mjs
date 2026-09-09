import { parseRepositoryMetadata } from "./repository-metadata.mjs";

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

function unavailableDependencyArchitecture(reason) {
  return { state: "unavailable", repositoryLayer: null, dependencies: [], reason };
}

function unavailableRepositoryMetadata(reason) {
  return {
    state: "unavailable",
    kind: null,
    status: null,
    summary: null,
    dependsOn: [],
    consumedBy: [],
    supersedes: [],
    replacedBy: [],
    reason,
  };
}

function classificationAction(repo) {
  return {
    kind: "landscape",
    priority: 30,
    id: "classify-repository",
    label: "Classify repository tier and maturity",
    detail: "Add this repository to config/landscape.json before treating its strategic lifecycle or reuse role as known.",
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

function repositoryMetadataAction(repo, metadata) {
  return {
    kind: "landscape",
    priority: 25,
    id: "repair-repository-metadata",
    label: "Repair repository lifecycle metadata",
    detail: `The declared .repository.toml contract is invalid: ${metadata.reason ?? "unknown error"}.`,
    href: repo.url ?? null,
  };
}

async function enrichRepository(client, config, repo, registry) {
  const classification = registry.repositories[repo.name] ?? null;
  const branch = repo.defaultBranch || "main";
  let dependencyArchitecture = {
    state: "not-declared",
    repositoryLayer: null,
    dependencies: [],
  };
  let repositoryMetadata = {
    state: "not-declared",
    kind: null,
    status: null,
    summary: null,
    dependsOn: [],
    consumedBy: [],
    supersedes: [],
    replacedBy: [],
  };

  const [dependencyRead, metadataRead] = await Promise.allSettled([
    client.textFile(config.owner, repo.name, ".coding-tooling.dependencies.json", branch),
    client.textFile(config.owner, repo.name, ".repository.toml", branch),
  ]);

  if (dependencyRead.status === "fulfilled") {
    if (dependencyRead.value) {
      dependencyArchitecture = parseDependencyArchitecture(dependencyRead.value, config.owner, repo.name);
    } else if (repo.collection?.treeAvailable === false) {
      dependencyArchitecture = unavailableDependencyArchitecture("repository tree evidence is unavailable");
    }
  } else {
    dependencyArchitecture = unavailableDependencyArchitecture(
      dependencyRead.reason instanceof Error ? dependencyRead.reason.message : String(dependencyRead.reason),
    );
  }

  if (metadataRead.status === "fulfilled") {
    if (metadataRead.value) {
      repositoryMetadata = parseRepositoryMetadata(metadataRead.value, config.owner, repo.name);
    } else if (repo.collection?.treeAvailable === false) {
      repositoryMetadata = unavailableRepositoryMetadata("repository tree evidence is unavailable");
    }
  } else {
    repositoryMetadata = unavailableRepositoryMetadata(
      metadataRead.reason instanceof Error ? metadataRead.reason.message : String(metadataRead.reason),
    );
  }

  let action = repo.action;
  const existingPriority = action?.priority ?? 100;
  if (["invalid", "unavailable"].includes(dependencyArchitecture.state) && existingPriority >= 24) {
    action = dependencyContractAction(repo, dependencyArchitecture);
  } else if (repositoryMetadata.state === "invalid" && existingPriority >= 25) {
    action = repositoryMetadataAction(repo, repositoryMetadata);
  } else if (!classification && existingPriority >= 30) {
    action = classificationAction(repo);
  }

  return {
    ...repo,
    action,
    landscape: {
      registered: classification !== null,
      tier: classification?.tier ?? null,
      maturity: classification?.maturity ?? null,
      repositoryMetadata,
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
    operationalKind: repo.landscape?.repositoryMetadata?.kind ?? null,
    operationalStatus: repo.landscape?.repositoryMetadata?.status ?? null,
    summary: repo.landscape?.repositoryMetadata?.summary ?? null,
    architectureLayer: repo.landscape?.dependencyArchitecture?.repositoryLayer ?? null,
    pages: repo.capabilities?.pages === true,
  }));
  const edges = [];
  const edgeKeys = new Set();
  let omittedExternalEdges = 0;

  function localName(reference) {
    const [targetOwner, targetName] = reference.split("/");
    if (targetOwner !== registry.owner || !byName.has(targetName)) {
      omittedExternalEdges += 1;
      return null;
    }
    return targetName;
  }

  function addEdge(edge) {
    const key = `${edge.from}\u0000${edge.to}\u0000${edge.type}\u0000${edge.relation ?? ""}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push(edge);
  }

  for (const repo of repositories) {
    for (const dependency of repo.landscape?.dependencyArchitecture?.dependencies ?? []) {
      const targetName = localName(dependency.repository);
      if (!targetName) continue;
      addEdge({
        from: repo.name,
        to: targetName,
        type: "dependency",
        relation: dependency.relation,
        targetArchitectureLayer: dependency.layer,
      });
    }

    const metadata = repo.landscape?.repositoryMetadata;
    for (const reference of metadata?.dependsOn ?? []) {
      const targetName = localName(reference);
      if (targetName) addEdge({ from: repo.name, to: targetName, type: "repository-dependency", relation: "depends-on" });
    }
    for (const reference of metadata?.consumedBy ?? []) {
      const consumerName = localName(reference);
      if (consumerName) addEdge({ from: consumerName, to: repo.name, type: "declared-consumer", relation: "consumes" });
    }
    for (const reference of metadata?.supersedes ?? []) {
      const targetName = localName(reference);
      if (targetName) addEdge({ from: repo.name, to: targetName, type: "supersedes", relation: "supersedes" });
    }
    for (const reference of metadata?.replacedBy ?? []) {
      const targetName = localName(reference);
      if (targetName) addEdge({ from: repo.name, to: targetName, type: "replaced-by", relation: "replaced-by" });
    }
  }

  nodes.sort((left, right) => left.name.localeCompare(right.name));
  edges.sort((left, right) =>
    left.from.localeCompare(right.from)
      || left.to.localeCompare(right.to)
      || left.type.localeCompare(right.type)
      || String(left.relation ?? "").localeCompare(String(right.relation ?? "")),
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

function countContractStates(repositories, selector) {
  const states = ["declared", "not-declared", "invalid", "unavailable"];
  return Object.fromEntries(states.map((state) => [
    state,
    repositories.filter((repo) => selector(repo)?.state === state).length,
  ]));
}

function summarizeLandscape(repositories, graph) {
  const registered = repositories.filter((repo) => repo.landscape?.registered === true).length;
  return {
    registered,
    unregistered: repositories.length - registered,
    coverageRatio: repositories.length === 0 ? 0 : registered / repositories.length,
    byTier: countBy(repositories, (repo) => repo.landscape?.tier, REPOSITORY_TIERS),
    byMaturity: countBy(repositories, (repo) => repo.landscape?.maturity, MATURITY_STAGES),
    repositoryMetadata: countContractStates(repositories, (repo) => repo.landscape?.repositoryMetadata),
    dependencyContracts: countContractStates(repositories, (repo) => repo.landscape?.dependencyArchitecture),
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
