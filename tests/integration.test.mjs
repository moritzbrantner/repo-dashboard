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
