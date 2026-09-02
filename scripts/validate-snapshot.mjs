import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validateSnapshot } from "../lib/model.mjs";

const path = resolve("site/data/repositories.json");
const snapshot = JSON.parse(await readFile(path, "utf8"));
const errors = validateSnapshot(snapshot);
if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Snapshot is valid (${snapshot.repositories.length} repositories).`);
}
