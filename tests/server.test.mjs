import test from "node:test";
import assert from "node:assert/strict";
import {createPortfolioServer} from "../scripts/serve.mjs";

async function withServer(options,action) {
  const server=createPortfolioServer(options);
  await new Promise((resolve)=>server.listen(0,"127.0.0.1",resolve));
  const origin="http://127.0.0.1:"+server.address().port;
  try {await action(origin);} finally {await new Promise((resolve)=>server.close(resolve));}
}

test("remote hosting rejects unauthenticated and insecure configurations",()=>{
  assert.throws(()=>createPortfolioServer({store:{},owner:"o",host:"0.0.0.0",localToken:"secret"}),/loopback/);
  assert.throws(()=>createPortfolioServer({store:{},owner:"o",host:"0.0.0.0",
    clientId:"id",clientSecret:"secret",publicUrl:"http://example.com"}),/HTTPS|https/);
});

test("private API requires an authorized session and a same-origin write",async()=>{
  const store={lastSynced:"2026-10-16",syncing:false,
    overview:()=>({repositories:[]}),detail:async()=>({nodes:[]}),
    decisions:()=>[],sync:async()=>{}};
  await withServer({store,owner:"o",host:"127.0.0.1",clientId:"id",clientSecret:"secret",
    publicUrl:"https://example.test"},async(origin)=>{
    const forbidden=await fetch(origin+"/api/portfolio");
    assert.equal(forbidden.status,401);
    const me=await (await fetch(origin+"/api/me")).json();
    assert.equal(me.authenticated,false);
    const login=await fetch(origin+"/auth/login",{redirect:"manual"});
    assert.equal(login.status,302);
    assert.match(login.headers.get("location"),/github.com\/login\/oauth\/authorize/);
  });
});

test("local-only token authorizes read, rejects cross-origin writes",async()=>{
  const store={lastSynced:"now",syncing:false,overview:()=>({repositories:[{name:"a"}]}),
    detail:async()=>({nodes:[]}),decisions:()=>[],sync:async()=>{}};
  await withServer({store,owner:"o",host:"127.0.0.1",localToken:"fake"},async(origin)=>{
    const response=await fetch(origin+"/api/portfolio");
    assert.equal((await response.json()).repositories.length,1);
    const blocked=await fetch(origin+"/api/refresh",{method:"POST",headers:{Origin:"https://evil.test"}});
    assert.equal(blocked.status,403);
  });
});
