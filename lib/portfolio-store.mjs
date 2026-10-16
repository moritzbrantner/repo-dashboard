import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

function publicRepository(repo) {
  if (!repo) return null;
  const {issues,atlas,...others}=repo;
  return others;
}

export class PortfolioStore {
  constructor({ owner, file, client, concurrency = 3, clock = () => new Date() }) {
    this.owner=owner;
    this.file=file;
    this.client=client;
    this.concurrency=Math.max(1,Math.min(4,concurrency));
    this.clock=clock;
    this.repositories={};
    this.syncing=false;
    this.lastError=null;
    this.lastSynced=null;
    this.running=null;
  }

  async load() {
    try {
      const document=JSON.parse(await readFile(this.file,"utf8"));
      if (document.owner===this.owner && document.schemaVersion===1) {
        this.repositories=document.repositories ?? {};
        this.lastSynced=document.lastSynced ?? null;
      }
    } catch(error) {
      if (error.code!=="ENOENT") throw error;
    }
    return this;
  }

  async persist() {
    await mkdir(dirname(this.file),{recursive:true,mode:0o700});
    const name=this.file+".tmp";
    await writeFile(name,JSON.stringify({schemaVersion:1,owner:this.owner,
      lastSynced:this.lastSynced,repositories:this.repositories}),{mode:0o600});
    await rename(name,this.file);
  }

  overview() {
    return {owner:this.owner,lastSynced:this.lastSynced,syncing:this.syncing,error:this.lastError,
      repositories:Object.values(this.repositories).map(publicRepository)
        .sort((a,b)=>a.name.localeCompare(b.name))};
  }

  decisions() {
    const entries=[];
    for (const repo of Object.values(this.repositories)) {
      const answered=new Set((repo.atlas?.entries??[]).flatMap((entry)=>entry.answers ?? []));
      const linked=new Set((repo.issues??[]).filter((issue)=>issue.state==="open").flatMap((issue)=>issue.questionRefs ?? []));
      for (const entry of repo.atlas?.entries ?? []) {
        if (entry.kind==="question" && !answered.has(entry.id)) {
          entries.push({repo:repo.name,id:entry.id,body:entry.body,
            blocking:linked.has(entry.id)});
        }
      }
    }
    return entries.sort((a,b)=>Number(b.blocking)-Number(a.blocking)||a.repo.localeCompare(b.repo)||a.id.localeCompare(b.id,undefined,{numeric:true}));
  }

  async sync() {
    if (this.running) return this.running;
    this.syncing=true;
    this.lastError=null;
    this.running=this.performSync().catch((error)=>{
      this.lastError=error instanceof Error ? error.message : String(error);
    }).finally(()=>{this.syncing=false;this.running=null;});
    return this.running;
  }

  async performSync() {
    const discovered=await this.client.list(this.owner);
    const names=new Set(discovered.map((repo)=>repo.name));
    for (const name of Object.keys(this.repositories)) if (!names.has(name)) delete this.repositories[name];
    let cursor=0;
    const workers=Array.from({length:Math.min(this.concurrency,discovered.length)},async()=>{
      while(cursor<discovered.length) {
        const repo=discovered[cursor++];
        try {
          this.repositories[repo.name]=await this.client.syncRepository(
            this.owner,repo,this.repositories[repo.name],this.clock());
        } catch(error) {
          const previous=this.repositories[repo.name];
          this.repositories[repo.name]={...previous,name:repo.name,url:repo.html_url,
            private:repo.private,archived:repo.archived,fork:repo.fork,
            issues:previous?.issues??[],summary:previous?.summary??null,
            error:error instanceof Error?error.message:String(error)};
        }
      }
    });
    await Promise.all(workers);
    this.lastSynced=this.clock().toISOString();
    await this.persist();
  }

  async detail(name) {
    const repo=this.repositories[name];
    if (!repo) return null;
    if (!repo.summary) return {repo:name,error:repo.error??"Repository data not yet available."};
    return this.client.listDetail(this.owner,name,repo);
  }

  async atlas(name) {
    const repo=this.repositories[name];
    if (!repo) return null;
    const source=await this.client.loadAtlas(this.owner,name,repo.defaultBranch);
    if (!source) return {found:false};
    return {found:true,path:source.path,sha:source.sha,entries:source.parsed.entries,
      openQuestions:source.parsed.openQuestions,totalDecisions:source.parsed.totalDecisions};
  }

  async answer(name,questionId,answer,sha) {
    if (!this.repositories[name]) throw new Error("Unknown repository.");
    const result=await this.client.proposeAnswer(this.owner,name,questionId,answer,sha);
    // Keep the authoritative snapshot unchanged until the PR is actually merged.
    return result;
  }

  async dependency(name,issue,action,blockingRepo,blockingIssue) {
    if (!this.repositories[name]) throw new Error("Unknown repository.");
    return this.client.dependency(this.owner,name,issue,action,blockingRepo,blockingIssue);
  }
}
