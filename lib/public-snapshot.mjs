import { PortfolioGitHubClient } from "./portfolio-github.mjs";
import { issueActivity, issueQuestionRefs, summarizeIssues } from "./portfolio.mjs";

const safeName=(value)=>/^[a-z\d_.-]+$/i.test(value);
function normalizeIssue(issue,repo) {
  const full=repo||(issue.repository_url?.match(/\/repos\/([^/]+\/[^/]+)$/)?.[1]??"");
  return {id:full+"#"+issue.number,repo:full,number:issue.number,githubId:issue.id,
    title:issue.title??"",body:issue.body??"",url:issue.html_url??"https://github.com/"+full+"/issues/"+issue.number,
    state:issue.state,state_reason:issue.state_reason,created_at:issue.created_at,
    updated_at:issue.updated_at,closed_at:issue.closed_at,labels:(issue.labels??[]).map((label)=>({name:label.name??label})),
    type:issue.type,questionRefs:issueQuestionRefs(issue.body)};
}
async function pages(client,path,maxPages=1) {
  const items=[];let partial=false;
  for(let page=1;page<=maxPages;page++){
    const batch=await client.request(path+"&page="+page);
    if(!Array.isArray(batch))throw new Error("Expected public GitHub API array");
    items.push(...batch);
    if(batch.length<100)return {items,partial:false};
    partial=true;
  }
  return {items,partial};
}
export class PublicGitHubClient extends PortfolioGitHubClient {
  async listPublicOwners(owners) {
    const repositories=[];
    for(const owner of owners){
      if(!safeName(owner))throw new Error("Invalid public owner.");
      const account=await this.request("/users/"+owner);
      const path=account.type==="Organization"?"/orgs/"+owner+"/repos?type=public&per_page=100":
        "/users/"+owner+"/repos?type=owner&per_page=100";
      const result=await pages(this,path,3);
      if(result.partial)throw new Error("Public repository discovery exceeded 300 for "+owner);
      repositories.push(...result.items.filter((repo)=>repo.private===false&&
        repo.owner?.login?.toLowerCase()===owner.toLowerCase()));
    }
    return [...new Map(repositories.map((repo)=>[repo.full_name,repo])).values()];
  }
}

// Public-only projection: it never reads /user/repos or a local private portfolio cache.
export async function collectPublicSnapshot({client,owners,now=new Date(),maxDependencyChecks=240}={}) {
  if(!client||!owners?.length)throw new Error("Public snapshot needs owners and a GitHub client.");
  // Defense in depth: the public-only exporter must not trust a client fixture or future discovery regression.
  const found=(await client.listPublicOwners(owners)).filter((repo)=>repo.private===false&&
    owners.some((owner)=>repo.owner?.login?.toLowerCase()===owner.toLowerCase()));
  const repositories=[];
  const atlasByRepo={};
  const issuesByRepo={};
  const partialByRepo={};
  for(const repo of found){
    const full=repo.full_name;
    const base="/repos/"+full;
    try {
      const [open,closed,prs,atlas]=await Promise.all([
        pages(client,base+"/issues?state=open&sort=updated&direction=desc&per_page=100",3),
        pages(client,base+"/issues?state=closed&sort=updated&direction=desc&per_page=100",1),
        pages(client,base+"/pulls?state=closed&sort=updated&direction=desc&per_page=100",1)
          .catch(()=>({items:[],partial:true})),
        client.loadAtlas(repo.owner.login,repo.name,repo.default_branch??"main").catch(()=>null),
      ]);
      const issues=[...open.items,...closed.items].filter((issue)=>!issue.pull_request)
        .map((issue)=>normalizeIssue(issue,full));
      const parsed=atlas?.parsed??null;
      const unresolved=new Set(parsed?.entries?.filter((entry)=>entry.kind==="question"&&!entry.resolved)
        .map((entry)=>entry.id)??[]);
      const summary=summarizeIssues(issues,now);
      summary.completedCountPartial=closed.partial;
      summary.questionBlockers=parsed?issues.filter((issue)=>issue.state==="open"&&
        issue.questionRefs.some((id)=>unresolved.has(id))).length:null;
      summary.atlasDecisions=parsed?.totalDecisions??null;
      summary.questionsOpen=parsed?.openQuestions??null;
      summary.questionsResolved=parsed?.resolvedQuestions??null;
      const cutoff=now.getTime()-30*86_400_000;
      summary.merged30=prs.partial?null:prs.items.filter((pr)=>pr.merged_at&&Date.parse(pr.merged_at)>=cutoff).length;
      summary.verified=null;
      const name=full; // Qualified names avoid collisions across personal and organization repos.
      repositories.push({name,fullName:full,url:repo.html_url,description:repo.description??"",
        private:false,archived:repo.archived===true,fork:repo.fork===true,
        pushedAt:repo.pushed_at,defaultBranch:repo.default_branch??"main",summary,
        syncedAt:now.toISOString(),error:null});
      issuesByRepo[full]=issues;
      partialByRepo[full]=open.partial;
      atlasByRepo[full]=atlas?{found:true,path:atlas.path,entries:parsed.entries,
        openQuestions:parsed.openQuestions,totalDecisions:parsed.totalDecisions}: {found:false};
    }catch(error){
      repositories.push({name:full,fullName:full,url:repo.html_url,private:false,
        archived:repo.archived===true,fork:repo.fork===true,pushedAt:repo.pushed_at,
        summary:null,error:error instanceof Error?error.message:String(error)});
    }
  }

  const publicNames=new Set(repositories.filter((repo)=>!repo.error).map((repo)=>repo.fullName.toLowerCase()));
  const eligible=new Set(repositories.filter((repo)=>!repo.archived&&!repo.fork&&!repo.error)
    .map((repo)=>repo.fullName));
  const allOpen=Object.values(issuesByRepo).flatMap((items)=>items.filter((issue)=>issue.state==="open"&&eligible.has(issue.repo)))
    .sort((a,b)=>a.id.localeCompare(b.id,undefined,{numeric:true}));
  const checked=new Map();
  let cursor=0;
  // Round-robin coverage across repositories without inventing an issue priority.
  const queues=new Map();
  for(const issue of allOpen){if(!queues.has(issue.repo))queues.set(issue.repo,[]);queues.get(issue.repo).push(issue);}
  const selected=[];
  while(selected.length<maxDependencyChecks){
    let progressed=false;
    for(const queue of queues.values())if(queue.length&&selected.length<maxDependencyChecks){
      selected.push(queue.shift());progressed=true;
    }
    if(!progressed)break;
  }
  await Promise.all(Array.from({length:Math.min(4,selected.length)},async()=>{
    while(cursor<selected.length){
      const issue=selected[cursor++];
      try{
        const items=await client.request("/repos/"+issue.repo+"/issues/"+issue.number+
          "/dependencies/blocked_by?per_page=100");
        if(!Array.isArray(items)||items.length===100)throw new Error("Incomplete dependency response");
        const normalized=items.map((item)=>normalizeIssue(item,item.repository_url?.match(/\/repos\/([^/]+\/[^/]+)$/)?.[1]??""));
        if(normalized.some((item)=>!publicNames.has(item.repo.toLowerCase())))throw new Error("A dependency is outside the public portfolio");
        checked.set(issue.id,{blockers:normalized,error:null});
      }catch(error){checked.set(issue.id,{blockers:[],error:error instanceof Error?error.message:String(error)});}
    }
  }));
  const backlogItems=allOpen.map((issue)=>{
    const atlas=atlasByRepo[issue.repo];
    const questionEntries=atlas?.entries??[];
    const questions=issue.questionRefs.filter((id)=>questionEntries.some((entry)=>entry.id===id&&entry.kind==="question"&&!entry.resolved));
    const missing=issue.questionRefs.some((id)=>!questionEntries.some((entry)=>entry.id===id));
    const result=checked.get(issue.id);
    const error=result?.error??(result?null:"Not scanned: API budget");
    const knownBlocked=result?.blockers.some((item)=>item.state!=="closed")||questions.length>0;
    const status=knownBlocked?"blocked":error||missing?"unknown":"ready";
    return {...issue,status,blockers:result?.blockers??[],questions,
      error:missing?"Decision Atlas reference unavailable":error};
  });
  const backlogById=new Map(backlogItems.map((item)=>[item.id,item]));
  const details={};
  for(const repo of repositories.filter((entry)=>!entry.error)){
    const issues=issuesByRepo[repo.fullName];
    const open=issues.filter((issue)=>issue.state==="open");
    const focus=open.slice(0,7);
    const recent=issues.filter((issue)=>issue.state==="closed").slice(0,10);
    const nodes=new Map([...recent,...focus].map((issue)=>[issue.id,{...issue,
      active:focus.some((item)=>item.id===issue.id),activity:issueActivity(issue),pullUrl:null}]));
    const edges=[];
    for(const issue of focus){
      for(const blocker of backlogById.get(issue.id)?.blockers??[]){
        nodes.set(blocker.id,{...blocker,active:false,activity:issueActivity(blocker),pullUrl:null});
        edges.push({from:blocker.id,to:issue.id});
      }
    }
    details[repo.fullName]={repo:repo.name,nodes:[...nodes.values()],edges,
      independent:Math.max(0,open.length-focus.length),independentItems:open.slice(7,27),
      notices:["Public snapshot: native dependencies checked for a bounded issue subset"],
      atlas:atlasByRepo[repo.fullName],summary:repo.summary,syncedAt:now.toISOString()};
  }
  const decisions=[];
  for(const [repo,atlas] of Object.entries(atlasByRepo)){
    const linked=new Set((issuesByRepo[repo]??[]).filter((issue)=>issue.state==="open").flatMap((issue)=>issue.questionRefs));
    for(const entry of atlas.entries??[])if(entry.kind==="question"&&!entry.resolved)
      decisions.push({repo,id:entry.id,body:entry.body,blocking:linked.has(entry.id)});
  }
  decisions.sort((a,b)=>Number(b.blocking)-Number(a.blocking)||a.repo.localeCompare(b.repo));
  return {schemaVersion:1,mode:"public",generatedAt:now.toISOString(),
    portfolio:{owner:owners.join(", "),lastSynced:now.toISOString(),syncing:false,error:null,repositories},
    atlases:atlasByRepo,details,decisions,backlog:{total:allOpen.length,
      partial:Object.values(partialByRepo).some(Boolean),items:backlogItems}};
}
