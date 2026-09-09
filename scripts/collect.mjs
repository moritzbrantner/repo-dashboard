import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { collectFleet } from "../lib/github.mjs";
import { FleetGitHubClient } from "../lib/fleet-client.mjs";
import { enrichLandscape, validateLandscapeRegistry } from "../lib/landscape.mjs";
import { summarizeFleet, validateSnapshot } from "../lib/model.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const config = JSON.parse(await readFile(resolve(root, "config/dashboard.json"), "utf8"));
const landscapeRegistry = JSON.parse(await readFile(resolve(root, "config/landscape.json"), "utf8"));
const registryErrors = validateLandscapeRegistry(landscapeRegistry);
if (registryErrors.length) {
  throw new Error(`Invalid landscape registry:\n${registryErrors.join("\n")}`);
}
if (landscapeRegistry.owner !== config.owner) {
  throw new Error(`Landscape owner ${landscapeRegistry.owner} does not match dashboard owner ${config.owner}`);
}

const client = new FleetGitHubClient();
console.log(`Collecting ${config.owner} repositories${client.token ? " with authenticated GitHub API" : " with public GitHub API"}...`);
const collectedRepositories = await collectFleet(client, config);
const { repositories, landscape } = await enrichLandscape(
  client,
  config,
  collectedRepositories,
  landscapeRegistry,
);
const snapshot = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  owner: config.owner,
  summary: {
    ...summarizeFleet(repositories),
    landscape: landscape.summary,
  },
  landscape,
  repositories,
};
const errors = validateSnapshot(snapshot);
if (errors.length) throw new Error(`Generated invalid snapshot:\n${errors.join("\n")}`);
const target = resolve(root, "site/data/repositories.json");
await mkdir(dirname(target), { recursive: true });
await writeFile(target, `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(`Wrote ${repositories.length} repositories and ${landscape.graph.edges.length} graph edges to ${target}`);
console.log(
  `Landscape coverage ${landscape.summary.registered}/${repositories.length}; `
    + `repository metadata declared ${landscape.summary.repositoryMetadata.declared}, invalid ${landscape.summary.repositoryMetadata.invalid}; `
    + `dependency contracts declared ${landscape.summary.dependencyContracts.declared}, invalid ${landscape.summary.dependencyContracts.invalid}.`,
);
