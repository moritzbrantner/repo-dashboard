import { GitHubClient } from "./github.mjs";
import { parseAtlas, summarizeIssues, issueActivity, issueQuestionRefs, answerDecision, appendAtlasEntry } from "./portfolio.mjs";

function endpoint(owner, repo) {
  if (!/^[a-z\d_.-]+$/i.test(owner) || !/^[a-z\d_.-]+$/i.test(repo)) throw new Error("Invalid GitHub repository.");
  return "/repos/" + owner + "/" + repo;
}

function normalizedIssue(issue) {
  const repository = issue.repository_url?.match(/\/repos\/([^/]+\/[^/]+)$/)?.[1]
    ?? issue.html_url?.match(/github\.com\/([^/]+\/[^/]+)\/issues\//)?.[1] ?? "";
  return { id: repository + "#" + issue.number, repo:repository, number:issue.number, githubId:issue.id,
    title:issue.title, body:issue.body ?? "", url:issue.html_url, state:issue.state, state_reason:issue.state_reason,
    created_at:issue.created_at, updated_at:issue.updated_at, closed_at:issue.closed_at,
    labels:(issue.labels ?? []).map((label)=>({name:typeof label === "string" ? label : label.name})),
    type:issue.type, questionRefs:issueQuestionRefs(issue.body) };
}

async function paged(client, path, { maxPages = 30 } = {}) {
  const all=[];
  let truncated=false;
  for (let page=1; page<=maxPages; page+=1) {
    const separator=path.includes("?")?"&":"?";
    const batch=await client.request(path+separator+"per_page=100&page="+page);
    if (!Array.isArray(batch)) throw new Error("Expected GitHub paginated array");
    all.push(...batch);
    if (batch.length<100) return {items:all,truncated:false};
    truncated=page===maxPages;
  }
  return {items:all,truncated};
}

export class PortfolioGitHubClient extends GitHubClient {
  constructor(token) {
    super({token});
    if (!this.token) throw new Error("GitHub authentication is required.");
  }

  async viewer() {
    return this.request("/user");
  }

  async list(owner) {
    return (await this.listOwnedRepositories(owner)).filter((repo)=>repo.owner?.login?.toLowerCase()===owner.toLowerCase());
  }

  async syncRepository(owner, repo, previous=null, now=new Date()) {
    const base=endpoint(owner,repo.name);
    // GitHub's since filter is on updated_at. Re-fetch a small overlap so the update is idempotent.
    const since=previous?.syncedAt
      ? "&since="+encodeURIComponent(new Date(Date.parse(previous.syncedAt)-300_000).toISOString()) : "";
    const result=await paged(this,base+"/issues?state=all&sort=updated&direction=desc"+since);
    const previousIssues=previous?.issues ?? [];
    const byId=new Map(previousIssues.map((issue)=>[issue.id,issue]));
    for (const issue of result.items.filter((item)=>!item.pull_request)) {
      const normalized=normalizedIssue({...issue,repository_url:base.replace(/^\/repos\//,"https://api.github.com/repos/")});
      byId.set(normalized.id,normalized);
    }
    const issues=[...byId.values()];
    const summary=summarizeIssues(issues,now);
    const start=new Date(now.getTime()-30*86_400_000).toISOString().slice(0,10);
    let merged30=null;
    try {
      const q="repo:"+owner+"/"+repo.name+" is:pr is:merged merged:>="+start;
      const response=await this.request("/search/issues?q="+encodeURIComponent(q)+"&per_page=1");
      merged30=typeof response.total_count==="number" ? response.total_count : null;
    } catch {
      // Optional metadata does not invalidate issue history.
    }

    let atlas=null;
    try {
      atlas=await this.loadAtlas(owner,repo.name,repo.default_branch ?? "main");
    } catch(error) {
      atlas={error:error.message};
    }
    const unresolved=new Set(atlas?.parsed?.entries?.filter((item)=>item.kind==="question"&&!item.resolved).map((item)=>item.id)??[]);
    summary.questionBlockers=issues.filter((item)=>item.state==="open"&&item.questionRefs.some((id)=>unresolved.has(id))).length;
    const priorHistory=previous?.history ?? [];
    const day=now.toISOString().slice(0,10);
    const observation={day,completed:summary.doneTotal,open:summary.open,
      questionsOpen:atlas?.parsed?.openQuestions ?? null,decisions:atlas?.parsed?.totalDecisions ?? null};
    const history=[...priorHistory.filter((point)=>point.day!==day),observation].slice(-365);
    return {
      name:repo.name, fullName:owner+"/"+repo.name, url:repo.html_url, description:repo.description ?? "",
      private:repo.private===true, archived:repo.archived===true, fork:repo.fork===true,
      pushedAt:repo.pushed_at, defaultBranch:repo.default_branch ?? "main", issues,
      summary:{...summary,merged30,verified:null,
        atlasDecisions:atlas?.parsed?.totalDecisions ?? null,
        questionsOpen:atlas?.parsed?.openQuestions ?? null,
        questionsResolved:atlas?.parsed?.resolvedQuestions ?? null,
        completedCountPartial:result.truncated || previous?.summary?.completedCountPartial===true},
      atlas:atlas?{path:atlas.path,entries:atlas.parsed?.entries ?? [],error:atlas.error}:null,
      history, syncedAt:now.toISOString(), error:null,
    };
  }

  async loadAtlas(owner,repo,branch) {
    const tree=await this.tree(owner,repo,branch);
    if (!tree?.tree) return null;
    const paths=tree.tree.filter((entry)=>entry.type==="blob").map((entry)=>entry.path);
    const candidates=paths.filter((path)=>/(^|\/)(atlas|decision[-_]atlas)\.md$/i.test(path));
    candidates.sort((a,b)=>Number(b.toLowerCase()==="docs/decisions/atlas.md")-Number(a.toLowerCase()==="docs/decisions/atlas.md")||a.length-b.length);
    const path=candidates[0];
    if (!path) return null;
    const document=await this.request(endpoint(owner,repo)+"/contents/"+path.split("/").map(encodeURIComponent).join("/")+"?ref="+encodeURIComponent(branch));
    if (document?.type!=="file" || document.encoding!=="base64") throw new Error("Decision Atlas could not be read.");
    const markdown=Buffer.from(document.content.replace(/\n/g,""),"base64").toString("utf8");
    return {path,sha:document.sha,markdown,parsed:parseAtlas(markdown)};
  }

  async listDetail(owner,name,repo) {
    const base=endpoint(owner,name);
    const openPrs=(await this.request(base+"/pulls?state=open&per_page=100")) ?? [];
    const referenced=new Map();
    for (const pr of openPrs) {
      for (const match of String(pr.body??"").matchAll(/\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/gi)) {
        referenced.set(Number(match[1]),pr.html_url);
      }
    }
    const raw=repo.issues;
    const recentlyClosed=raw.filter((issue)=>issue.state==="closed")
      .sort((a,b)=>String(b.closed_at).localeCompare(String(a.closed_at))).slice(0,10);
    const open=raw.filter((issue)=>issue.state==="open");
    const active=open.filter((issue)=>issueActivity(issue,referenced.has(issue.number))!=="ready-or-unknown")
      .sort((a,b)=>String(b.updated_at).localeCompare(String(a.updated_at))).slice(0,7);
    const focused=active.length ? active : [...open].sort((a,b)=>String(b.updated_at).localeCompare(String(a.updated_at))).slice(0,7);
    const unique=new Map([...recentlyClosed,...focused].map((issue)=>[issue.id,issue]));
    const edges=new Map();
    const notices=[];
    const candidates=focused.slice(0,7);
    await Promise.all(candidates.map(async (issue)=>{
      const path=base+"/issues/"+issue.number+"/dependencies/";
      const results=await Promise.allSettled([
        this.request(path+"blocked_by?per_page=100"),
        this.request(path+"blocking?per_page=100"),
      ]);
      for (let i=0;i<results.length;i+=1) {
        const value=results[i];
        if (value.status==="rejected") {notices.push("Native dependencies unavailable for #"+issue.number);continue;}
        for (const other of value.value ?? []) {
          const item=normalizedIssue(other);
          if (!item.repo) continue;
          unique.set(item.id,item);
          const from=i===0?item.id:issue.id;
          const to=i===0?issue.id:item.id;
          edges.set(from+"→"+to,{from,to});
        }
      }
    }));
    const nodes=[...unique.values()].map((issue)=>({...issue,
      active:active.some((item)=>item.id===issue.id),activity:issueActivity(issue,referenced.has(issue.number)),
      pullUrl:referenced.get(issue.number)??null}));
    const remaining=open.filter((issue)=>!unique.has(issue.id));
    const independent=remaining.length;
    const independentItems=remaining.slice(0,20).map((issue)=>({...issue,active:false,
      activity:issueActivity(issue,referenced.has(issue.number)),pullUrl:referenced.get(issue.number)??null}));
    return {repo:name,nodes,edges:[...edges.values()],independent,independentItems,notices,
      atlas:repo.atlas,summary:repo.summary,syncedAt:repo.syncedAt};
  }

  async proposeChange(owner,name,expectedSha,update) {
    const base=endpoint(owner,name);
    const metadata=await this.request(base);
    const atlas=await this.loadAtlas(owner,name,metadata.default_branch);
    if (!atlas) throw new Error("No Decision Atlas found.");
    if (atlas.sha!==expectedSha) throw new Error("Decision Atlas changed; refresh before editing.");
    const change=update(atlas.markdown);
    const branch="portfolio/atlas-"+change.decisionId.replaceAll(".","-")+"-"+Date.now().toString(36);
    const head=await this.request(base+"/git/ref/heads/"+encodeURIComponent(metadata.default_branch));
    await this.request(base+"/git/refs",{method:"POST",body:{ref:"refs/heads/"+branch,sha:head.object.sha}});
    await this.request(base+"/contents/"+atlas.path.split("/").map(encodeURIComponent).join("/"),
      {method:"PUT",body:{message:"docs: record Decision Atlas "+change.decisionId,
        content:Buffer.from(change.markdown).toString("base64"),sha:atlas.sha,branch}});
    const pr=await this.request(base+"/pulls",{method:"POST",body:{
      title:"Record Decision Atlas "+change.decisionId,head:branch,base:metadata.default_branch,
      body:"Append Decision Atlas entry "+change.decisionId+" without changing existing stable IDs."}});
    let autoMerge=false;
    if (metadata.allow_auto_merge===true && pr.node_id) {
      try {
        const mutation="mutation($id:ID!){enablePullRequestAutoMerge(input:{pullRequestId:$id,mergeMethod:SQUASH}){clientMutationId}}";
        const response=await this.request("/graphql",{method:"POST",body:{query:mutation,variables:{id:pr.node_id}}});
        autoMerge=!response.errors?.length;
      } catch { /* The repository may prohibit GitHub auto-merge. */ }
    }
    return {url:pr.html_url,number:pr.number,decisionId:change.decisionId,autoMerge,pending:true};
  }

  async proposeAnswer(owner,name,questionId,answer,expectedSha) {
    return this.proposeChange(owner,name,expectedSha,(markdown)=>answerDecision(markdown,questionId,answer));
  }

  async proposeEntry(owner,name,parentId,kind,body,expectedSha) {
    return this.proposeChange(owner,name,expectedSha,(markdown)=>appendAtlasEntry(markdown,parentId,kind,body));
  }

  async dependency(owner,name,issueNumber,action,blockingRepo,blockingNumber) {
    const base=endpoint(owner,name);
    if (!Number.isSafeInteger(issueNumber)||issueNumber<1)throw new Error("Invalid issue number");
    const other=await this.request(endpoint(owner,blockingRepo)+"/issues/"+blockingNumber);
    if (!other || other.pull_request)throw new Error("Blocking issue does not exist");
    const path=base+"/issues/"+issueNumber+"/dependencies/blocked_by";
    if (action==="add") return this.request(path,{method:"POST",body:{issue_id:other.id}});
    if (action==="remove") return this.request(path+"/"+other.id,{method:"DELETE"});
    throw new Error("Unknown dependency action");
  }
}
