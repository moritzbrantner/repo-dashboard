import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
test("Pages artifact contains only allowlisted static assets and no private cache",async()=>{
  const result=spawnSync(process.execPath,["scripts/build-pages.mjs"],{cwd:root,
    env:{...process.env,REPO_DASHBOARD_API_BASE_URL:"https://private-api.example.test"},encoding:"utf8"});
  assert.equal(result.status,0,result.stderr);
  const names=(await readdir(resolve(root,"dist"))).sort();
  assert.deepEqual(names,["app.js","config.json","index.html","shared","styles.css"]);
  assert.deepEqual(await readdir(resolve(root,"dist/shared")),["portfolio.mjs"]);
  assert.deepEqual(JSON.parse(await readFile(resolve(root,"dist/config.json"),"utf8")),
    {apiBase:"https://private-api.example.test"});
  const html=await readFile(resolve(root,"dist/index.html"),"utf8");
  assert.match(html,/Content-Security-Policy/);
  assert.match(html,/connect-src 'self' https:\/\/private-api\.example\.test/);
  assert.doesNotMatch(html,/GITHUB_CLIENT_SECRET/);
});
