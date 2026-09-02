import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { GitHubClient, collectFleet } from "../lib/github.mjs";
import { summarizeFleet, validateSnapshot } from "../lib/model.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const config = JSON.parse(await readFile(resolve(root, "config/dashboard.json"), "utf8"));
const client = new GitHubClient();

console.log(`Collecting ${config.owner} repositories${client.token ? " with authenticated GitHub API" : " with public GitHub API"}...`);
const repositories = await collectFleet(client, config);
const snapshot = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  owner: config.owner,
  summary: summarizeFleet(repositories),
  repositories,
};
const errors = validateSnapshot(snapshot);
if (errors.length) throw new Error(`Generated invalid snapshot:\n${errors.join("\n")}`);
const target = resolve(root, "site/data/repositories.json");
await mkdir(dirname(target), { recursive: true });
await writeFile(target, `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(`Wrote ${repositories.length} repositories to ${target}`);
