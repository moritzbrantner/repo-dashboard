import test from "node:test";
import assert from "node:assert/strict";
import { collectPublicSnapshot, PublicGitHubClient } from "../lib/public-snapshot.mjs";
import { parseAtlas } from "../lib/portfolio.mjs";

const owner="example";
const now=new Date("2026-11-11T10:00:00.000Z");
const repo=(name,privateRepo=false)=>({name,full_name:owner+"/"+name,
  owner:{login:owner},private:privateRepo,archived:false,fork:false,
  html_url:"https://github.com/"+owner+"/"+name,default_branch:"main"});
function issue(name,number,state="open",body=""){
  return {id:number,number,state,title:"Issue "+number,body,
    html_url:"https://github.com/"+owner+"/"+name+"/issues/"+number,
    repository_url:"https://api.github.com/repos/"+owner+"/"+name,
    updated_at:now.toISOString(),created_at:now.toISOString(),closed_at:state==="closed"?now.toISOString():null};
}
test("public owner discovery filters private and unrelated repositories",async()=>{
  const client=new PublicGitHubClient("fixture-token");
  client.request=async(path)=>{
    if(path==="/users/example")return {type:"User"};
    if(path.endsWith("page=1"))return [repo("alpha"),repo("secret",true),
      {...repo("other"),owner:{login:"someone-else"}}];
    throw new Error("Unexpected endpoint "+path);
  };
  assert.deepEqual((await client.listPublicOwners([owner])).map((entry)=>entry.name),["alpha"]);
});

test("snapshot honors public boundaries, native cross-repo blockers and unresolved Atlas questions",async()=>{
  const requests=[];
  const client={
    listPublicOwners:async()=>[repo("alpha"),repo("beta"),repo("hidden",true)],
    loadAtlas:async(_owner,name)=>name==="alpha"?{
      path:"docs/decisions/atlas.md",parsed:parseAtlas("- **1** Steering\n  - **1.1** [question] Which path?")}:null,
    request:async(path)=>{
      requests.push(path);
      if(path.includes("/issues?state=open")){
        if(path.includes("alpha"))return [issue("alpha",1,"open","Decision Atlas question 1.1")];
        return [issue("beta",2)];
      }
      if(path.includes("/issues?state=closed")||path.includes("/pulls?state=closed"))return [];
      if(path.includes("alpha/issues/1/dependencies/blocked_by"))return [issue("beta",3,"open")];
      if(path.includes("beta/issues/2/dependencies/blocked_by"))return [];
      throw new Error("Unexpected endpoint "+path);
    },
  };
  const snapshot=await collectPublicSnapshot({client,owners:[owner],now});
  assert.equal(snapshot.mode,"public");
  assert.deepEqual(snapshot.portfolio.repositories.map((item)=>item.name),["example/alpha","example/beta"]);
  assert.deepEqual(snapshot.backlog.items.map((item)=>item.status),["blocked","ready"]);
  assert.deepEqual(snapshot.backlog.items[0].blockers.map((blocker)=>blocker.id),["example/beta#3"]);
  assert.equal(snapshot.decisions[0].blocking,true);
  assert.deepEqual(snapshot.details["example/alpha"].edges,[{from:"example/beta#3",to:"example/alpha#1"}]);
  assert.ok(requests.every((path)=>!path.includes("hidden")&&!path.includes("/user/repos")));
});

test("unscanned and unavailable native dependencies remain unknown",async()=>{
  const client={listPublicOwners:async()=>[repo("alpha")],loadAtlas:async()=>null,
    request:async(path)=>{
      if(path.includes("/issues?state=open"))return [issue("alpha",1),issue("alpha",2)];
      if(path.includes("/issues?state=closed")||path.includes("/pulls?state=closed"))return [];
      if(path.includes("dependencies"))throw new Error("GitHub unavailable");
      throw new Error("Unexpected endpoint");
    }};
  const snapshot=await collectPublicSnapshot({client,owners:[owner],now,maxDependencyChecks:1});
  assert.deepEqual(snapshot.backlog.items.map((item)=>item.status),["unknown","unknown"]);
  assert.match(snapshot.backlog.items[0].error,/unavailable/);
  assert.match(snapshot.backlog.items[1].error,/Not scanned/);
});

test("a blocker outside the public portfolio never enters the published artifact",async()=>{
  const client={listPublicOwners:async()=>[repo("alpha")],loadAtlas:async()=>null,
    request:async(path)=>{
      if(path.includes("/issues?state=open"))return [issue("alpha",1)];
      if(path.includes("/issues?state=closed")||path.includes("/pulls?state=closed"))return [];
      if(path.includes("dependencies"))return [{...issue("secret",7),
        repository_url:"https://api.github.com/repos/private-owner/secret"}];
      throw new Error("Unexpected endpoint");
    }};
  const snapshot=await collectPublicSnapshot({client,owners:[owner],now});
  assert.equal(snapshot.backlog.items[0].status,"unknown");
  assert.deepEqual(snapshot.backlog.items[0].blockers,[]);
  assert.doesNotMatch(JSON.stringify(snapshot),/private-owner/);
});
