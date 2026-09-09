import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validateLandscapeRegistry } from "../lib/landscape.mjs";

const path = resolve("config/landscape.json");
const registry = JSON.parse(await readFile(path, "utf8"));
const errors = validateLandscapeRegistry(registry);

if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Landscape registry is valid (${Object.keys(registry.repositories).length} repositories).`);
}
