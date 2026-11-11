import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
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
    detail:async()=>({nodes:[]}),decisions:()=>[],sync:async()=>{},
    backlog:async(offset)=>({total:1,offset,items:[{id:"o/a#1",status:"ready"}],nextOffset:null})};
  await withServer({store,owner:"o",host:"127.0.0.1",localToken:"fake"},async(origin)=>{
    const response=await fetch(origin+"/api/portfolio");
    assert.equal((await response.json()).repositories.length,1);
    const backlog=await fetch(origin+"/api/backlog?offset=0");
    assert.equal((await backlog.json()).items[0].status,"ready");
    const invalid=await fetch(origin+"/api/backlog?offset=-1");
    assert.equal(invalid.status,400);
    const blocked=await fetch(origin+"/api/refresh",{method:"POST",headers:{Origin:"https://evil.test"}});
    assert.equal(blocked.status,403);
  });
});

test("Pages OAuth handoff requires a PKCE verifier and accepts only owner sessions",async()=>{
  const frontend="https://dashboard.example.test/";
  const verifier="a".repeat(64);
  const challenge=createHash("sha256").update(verifier).digest("base64url");
  const store={lastSynced:"now",syncing:false,overview:()=>({repositories:[]}),sync:async()=>{},
    decisions:()=>[]};
  await withServer({store,owner:"owner",host:"127.0.0.1",clientId:"id",clientSecret:"secret",
    publicUrl:"https://api.example.test",frontendUrl:frontend,
    oauthExchange:async()=>({access_token:"server-only-github-token"}),
    clientFactory:()=>({viewer:async()=>({login:"owner"})})},async(origin)=>{
    const start=await fetch(origin+"/auth/login?challenge="+challenge,{redirect:"manual"});
    assert.equal(start.status,302);
    const state=new URL(start.headers.get("location")).searchParams.get("state");
    const oauthCookie=start.headers.get("set-cookie").split(";")[0];
    const callback=await fetch(origin+"/auth/callback?state="+state+"&code=fixture",{
      headers:{Cookie:oauthCookie},redirect:"manual"});
    assert.equal(callback.status,302);
    assert.ok(callback.headers.get("location").startsWith(frontend));
    assert.doesNotMatch(callback.headers.get("location"),/server-only-github-token/);
    const ticket=new URL(callback.headers.get("location")).searchParams.get("ticket");
    assert.ok(ticket);
    const preflight=await fetch(origin+"/auth/exchange",{method:"OPTIONS",headers:{
      Origin:"https://dashboard.example.test","Access-Control-Request-Method":"POST"}});
    assert.equal(preflight.status,204);
    assert.equal(preflight.headers.get("access-control-allow-origin"),"https://dashboard.example.test");
    const denied=await fetch(origin+"/auth/exchange",{method:"POST",headers:{
      Origin:"https://evil.test","Content-Type":"application/json"},body:JSON.stringify({ticket,verifier})});
    assert.equal(denied.status,403);
    const exchange=()=>fetch(origin+"/auth/exchange",{method:"POST",headers:{
      Origin:"https://dashboard.example.test","Content-Type":"application/json"},
      body:JSON.stringify({ticket,verifier})});
    const accepted=await exchange();
    assert.equal(accepted.status,200);
    const sessionToken=(await accepted.json()).sessionToken;
    assert.match(sessionToken,/^[a-f\d]{64}$/);
    assert.equal((await exchange()).status,403);
    const privateData=await fetch(origin+"/api/portfolio",{headers:{
      Origin:"https://dashboard.example.test",Authorization:"Bearer "+sessionToken}});
    assert.equal(privateData.status,200);
    assert.equal(privateData.headers.get("access-control-allow-origin"),"https://dashboard.example.test");
    const invalidWrite=await fetch(origin+"/api/refresh",{method:"POST",headers:{
      Origin:"https://evil.test",Authorization:"Bearer "+sessionToken}});
    assert.equal(invalidWrite.status,403);
    const validWrite=await fetch(origin+"/api/refresh",{method:"POST",headers:{
      Origin:"https://dashboard.example.test",Authorization:"Bearer "+sessionToken}});
    assert.equal(validWrite.status,202);
  });
});

test("split hosting rejects HTTP frontend and missing OAuth challenges",async()=>{
  const store={lastSynced:"now",syncing:false};
  assert.throws(()=>createPortfolioServer({store,owner:"owner",publicUrl:"https://api.example.test",
    clientId:"id",clientSecret:"secret",frontendUrl:"http://insecure.test"}),/HTTPS/);
  await withServer({store,owner:"owner",clientId:"id",clientSecret:"secret",
    publicUrl:"https://api.example.test",frontendUrl:"https://dashboard.example.test/"},async(origin)=>{
    assert.equal((await fetch(origin+"/auth/login",{redirect:"manual"})).status,400);
  });
});
