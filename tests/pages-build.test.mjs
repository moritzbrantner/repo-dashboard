import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
test("Pages artifact contains only allowlisted static assets and no private cache",async()=>{
  const result=spawnSync(process.execPath,["scripts/build-pages.mjs"],{cwd:root,
    env:{...process.env,REPO_DASHBOARD_MODE:"private",REPO_DASHBOARD_API_BASE_URL:"https://private-api.example.test"},encoding:"utf8"});
  assert.equal(result.status,0,result.stderr);
  const names=(await readdir(resolve(root,"dist"))).sort();
  assert.deepEqual(names,["app.js","config.json","index.html","shared","styles.css"]);
  assert.deepEqual(await readdir(resolve(root,"dist/shared")),["portfolio.mjs"]);
  assert.deepEqual(JSON.parse(await readFile(resolve(root,"dist/config.json"),"utf8")),
    {mode:"private",apiBase:"https://private-api.example.test"});
  const html=await readFile(resolve(root,"dist/index.html"),"utf8");
  assert.match(html,/Content-Security-Policy/);
  assert.match(html,/connect-src 'self' https:\/\/private-api\.example\.test/);
  assert.doesNotMatch(html,/GITHUB_CLIENT_SECRET/);
});

test("public Pages artifact is self-contained and contains only public data",async()=>{
  const result=spawnSync(process.execPath,["--import","./tests/helpers/mock-public-github.mjs","scripts/build-pages.mjs"],{
    cwd:root,env:{...process.env,REPO_DASHBOARD_MODE:"public",GITHUB_TOKEN:"test-build-token",
      REPO_DASHBOARD_API_BASE_URL:"https://unrelated-private-api.example.test"},encoding:"utf8"});
  assert.equal(result.status,0,result.stderr);
  assert.deepEqual((await readdir(resolve(root,"dist"))).sort(),
    ["app.js","config.json","index.html","public-data.json","shared","styles.css"]);
  assert.deepEqual(JSON.parse(await readFile(resolve(root,"dist/config.json"),"utf8")),{mode:"public"});
  const data=JSON.parse(await readFile(resolve(root,"dist/public-data.json"),"utf8"));
  assert.equal(data.mode,"public");
  assert.deepEqual(data.portfolio.repositories.map((repo)=>repo.fullName),["moritzbrantner/sample-public"]);
  assert.equal(data.backlog.items[0].status,"ready");
  const artifact=(await Promise.all(["config.json","public-data.json","index.html","app.js"].map((name)=>
    readFile(resolve(root,"dist",name),"utf8")))).join("\n");
  assert.doesNotMatch(artifact,/test-build-token|unrelated-private-api|GITHUB_CLIENT_SECRET/);
  assert.match(artifact,/connect-src 'self' https:\/\/api\.github\.com/);
});
