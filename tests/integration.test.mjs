import test from "node:test";
import assert from "node:assert/strict";
import { PortfolioGitHubClient } from "../lib/portfolio-github.mjs";

test("execution view uses only native issue dependencies, including cross-repository neighbors",async()=>{
  const client=new PortfolioGitHubClient("fixture");
  const primary={id:"owner/main#1",repo:"owner/main",number:1,githubId:101,title:"Implement",
    state:"open",updated_at:new Date().toISOString(),labels:[],questionRefs:[]};
  const other={id:202,number:2,repository_url:"https://api.github.com/repos/owner/shared",
    title:"Prerequisite",state:"closed",state_reason:"completed",labels:[],body:"Blocked by random #88"};
  const successor={id:303,number:3,repository_url:"https://api.github.com/repos/owner/main",
    title:"Follow-up",state:"open",labels:[],body:""};
  client.request=async(path)=>{
    if(path.endsWith("/pulls?state=open&per_page=100"))return [];
    if(path.endsWith("/issues/1/dependencies/blocked_by?per_page=100"))return [other];
    if(path.endsWith("/issues/1/dependencies/blocking?per_page=100"))return [successor];
    throw new Error("Unexpected endpoint: "+path);
  };
  const view=await client.listDetail("owner","main",{issues:[primary],atlas:null,summary:{},syncedAt:"today"});
  assert.equal(view.nodes.some((issue)=>issue.id==="owner/shared#2"),true);
  assert.deepEqual(view.edges,[{from:"owner/shared#2",to:"owner/main#1"},{from:"owner/main#1",to:"owner/main#3"}]);
  assert.equal(view.nodes.some((issue)=>issue.id==="owner/main#88"),false);
});

test("no GitHub work evidence does not mark ready fallback issues as active",async()=>{
  const client=new PortfolioGitHubClient("fixture");
  const issue={id:"owner/main#2",repo:"owner/main",number:2,title:"Queued",state:"open",labels:[],questionRefs:[],updated_at:"2020-01-01T00:00:00Z"};
  client.request=async(path)=>{
    if(path.endsWith("/pulls?state=open&per_page=100"))return [];
    if(path.includes("/dependencies/"))return [];
    throw new Error("Unexpected endpoint: "+path);
  };
  const view=await client.listDetail("owner","main",{issues:[issue],atlas:null,summary:{},syncedAt:"today"});
  assert.equal(view.nodes[0].active,false);
  assert.equal(view.nodes[0].activity,"ready-or-unknown");
});

test("backlog reconciliation uses native cross-repository blockers and explicit Atlas questions",async()=>{
  const client=new PortfolioGitHubClient("fixture");
  const issue=(number,body="")=>({id:"owner/main#"+number,repo:"owner/main",number,
    title:"Task "+number,url:"https://github.com/owner/main/issues/"+number,
    state:"open",questionRefs:body?["1.2"]:[]});
  const repositories={main:{name:"main",issues:[issue(1),issue(2),issue(3,"Atlas 1.2")],
    atlas:{entries:[{id:"1.2",kind:"question",resolved:false}]}},
    parked:{archived:true,issues:[{...issue(4),id:"owner/parked#4"}]}};
  client.request=async(path)=>{
    if(path.includes("/issues/1/"))return [{id:45,number:5,
      repository_url:"https://api.github.com/repos/owner/physics",state:"open",
      html_url:"https://github.com/owner/physics/issues/5",title:"Prerequisite"}];
    if(path.includes("/issues/2/"))return [];
    if(path.includes("/issues/3/"))return [];
    throw new Error("Unexpected endpoint: "+path);
  };
  const first=await client.reconcileBacklog(repositories,{offset:0,limit:2});
  assert.equal(first.total,3);
  assert.equal(first.nextOffset,2);
  assert.equal(first.items[0].status,"blocked");
  assert.equal(first.items[0].blockers[0].id,"owner/physics#5");
  assert.equal(first.items[1].status,"ready");
  const last=await client.reconcileBacklog(repositories,{offset:2,limit:2});
  assert.equal(last.items[0].status,"blocked");
  assert.deepEqual(last.items[0].questions,["1.2"]);
  assert.equal(last.nextOffset,null);
});

test("failed dependency reads never make an issue ready",async()=>{
  const client=new PortfolioGitHubClient("fixture");
  client.request=async()=>{throw new Error("GitHub 403");};
  const result=await client.reconcileBacklog({main:{issues:[{id:"owner/main#8",repo:"owner/main",
    number:8,state:"open",questionRefs:[]}]}});
  assert.equal(result.items[0].status,"unknown");
  assert.match(result.items[0].error,/403/);
});
