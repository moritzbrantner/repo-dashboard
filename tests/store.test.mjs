import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,rm,readFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {PortfolioStore} from "../lib/portfolio-store.mjs";

test("synchronization deduplicates updates and persists only derived local snapshots", async () => {
  const dir=await mkdtemp(join(tmpdir(),"portfolio-"));
  let collected=0;
  const client={
    list:async()=>[{name:"example",html_url:"https://github.com/o/example",private:true}],
    syncRepository:async(owner,repo,old)=>({name:repo.name,url:repo.html_url,private:true,
      issues:[{id:"o/example#1",state:"closed"}],summary:{doneTotal:1},
      history:[{day:"2026-10-16",completed:1}],syncedAt:"2026-10-16T12:00:00Z",
      atlas:{entries:[{id:"1.1",kind:"question",body:"[question] Decide",answers:[]}]},
      updates:++collected}),
  };
  try {
    const file=join(dir,"cache.json");
    const store=await new PortfolioStore({owner:"o",file,client}).load();
    await Promise.all([store.sync(),store.sync()]);
    assert.equal(collected,1);
    assert.equal(store.overview().repositories[0].issues,undefined);
    assert.equal(store.decisions()[0].id,"1.1");
    const restored=await new PortfolioStore({owner:"o",file,client}).load();
    assert.equal(restored.overview().repositories[0].summary.doneTotal,1);
    assert.equal(JSON.parse(await readFile(file)).owner,"o");
  } finally {await rm(dir,{recursive:true,force:true});}
});
