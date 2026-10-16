import { layoutDag } from "./shared/portfolio.mjs";

const $=(selector)=>document.querySelector(selector);
const state={portfolio:null,repo:null,detail:null,atlas:null,selected:null,question:null,
  view:"atlas",period:"30",sort:"name",query:"",includeArchived:false,includeForks:false,
  filter:"all",openOnly:false,expanded:false,inbox:[],busy:false};
const node=(tag,cls,content)=>{
  const element=document.createElement(tag);
  if(cls)element.className=cls;
  if(content!==undefined && content!==null)element.textContent=String(content);
  return element;
};
const text=(tag,content,cls)=>node(tag,cls,content);
const api=async(path,options={})=>{
  const response=await fetch(path,{headers:{"Content-Type":"application/json"},...options});
  const result=await response.json();
  if(!response.ok)throw new Error(result.error??"Request failed");
  return result;
};
function message(error) {
  const element=$("#message");
  element.hidden=!error;
  element.textContent=error ? (error instanceof Error ? error.message:String(error)):"";
}
function safeGithubUrl(raw) {
  try {const url=new URL(raw);return url.protocol==="https:"&&url.host==="github.com"?url.href:null;}catch{return null;}
}
function externalLink(value,label) {
  const valid=safeGithubUrl(value);
  const anchor=node(valid?"a":"span","external",label);
  if(valid){anchor.href=valid;anchor.target="_blank";anchor.rel="noopener noreferrer";}
  return anchor;
}
function formatDate(value) {
  if(!value)return "unknown";
  const date=new Date(value);
  return Number.isNaN(date.getTime())?"unknown":date.toLocaleDateString();
}
function setRoute({repo=null,view=null,question=null,issue=null,inbox=false}={}) {
  const params=new URLSearchParams();
  if(repo){params.set("repo",repo);params.set("view",view??"atlas");}
  if(question)params.set("question",question);
  if(issue)params.set("issue",issue);
  if(inbox)params.set("page","decisions");
  history.pushState(null,"",params.size?"?"+params.toString():location.pathname);
  void route();
}
function repoByName(name){return state.portfolio?.repositories.find((item)=>item.name===name);}
function metric(repo,period=state.period){
  if(period==="all")return repo.summary?.doneTotal;
  const range=Number(period);
  return repo.summary?.activity?.slice(-range).reduce((a,b)=>a+b,0);
}
function sparkline(values,limit) {
  const chart=document.createElementNS("http://www.w3.org/2000/svg","svg");
  chart.setAttribute("viewBox","0 0 110 28");
  chart.setAttribute("width","110");chart.setAttribute("height","28");
  chart.setAttribute("role","img");chart.setAttribute("aria-label","Completed issue trend");
  const shown=(values??[]).slice(-Number(limit||90));
  const total=shown.length;
  if(!total)return chart;
  const max=Math.max(1,...shown);
  const poly=document.createElementNS(chart.namespaceURI,"polyline");
  poly.setAttribute("points",shown.map((n,i)=>(i*109/Math.max(1,total-1))+","+(26-24*n/max)).join(" "));
  poly.setAttribute("fill","none");poly.setAttribute("stroke","currentColor");
  poly.setAttribute("stroke-width","2");chart.append(poly);
  return chart;
}
function badge(label,cls="") {return node("span","tag "+cls,label);}
function renderTable(){
  if(!state.portfolio)return;
  const q=state.query.toLowerCase().trim();
  const repos=state.portfolio.repositories.filter((repo)=>
    (!q||(repo.name+" "+(repo.description??"")).toLowerCase().includes(q))&&
    (state.includeArchived||!repo.archived)&&(state.includeForks||!repo.fork));
  repos.sort((a,b)=>{
    if(state.sort==="done")return (metric(b)??-1)-(metric(a)??-1)||a.name.localeCompare(b.name);
    if(state.sort==="decisions")return (b.summary?.questionsOpen??-1)-(a.summary?.questionsOpen??-1)||a.name.localeCompare(b.name);
    if(state.sort==="updated")return String(b.pushedAt??"").localeCompare(String(a.pushedAt??""));
    return a.name.localeCompare(b.name);
  });
  $("#repo-count").textContent=repos.length+" of "+state.portfolio.repositories.length;
  const body=$("#portfolio-rows");
  body.replaceChildren();
  for(const repo of repos){
    const row=node("tr","clickable");
    const first=node("td","repository-name");
    first.append(text("strong",repo.name),text("span",repo.private?"Private":"Public","muted"));
    if(repo.error)first.append(text("small","Collection error: "+repo.error,"warning"));
    row.append(first);
    const count=metric(repo);
    row.append(text("td",count===undefined||count===null?"—":(repo.summary?.completedCountPartial?"≥ ":"")+count,"numeric"));
    row.append(text("td",repo.summary?.merged30??"—","numeric"));
    row.append(text("td",repo.summary?.atlasDecisions??"—","numeric"));
    row.append(text("td",repo.summary?.questionsOpen??"—","numeric"));
    row.append(text("td",repo.summary?.questionBlockers??"—","numeric"));
    row.append(text("td",repo.summary?.verified??"Unknown","muted"));
    const trend=node("td","spark");trend.append(sparkline(repo.summary?.activity,state.period==="all"?90:state.period));row.append(trend);
    row.tabIndex=0;row.setAttribute("aria-label","Open "+repo.name);
    row.addEventListener("click",()=>setRoute({repo:repo.name}));
    row.addEventListener("keydown",(event)=>{if(event.key==="Enter")setRoute({repo:repo.name});});
    body.append(row);
  }
  if(!repos.length){const row=node("tr");const td=text("td","No repositories match the filters.","muted");td.colSpan=8;row.append(td);body.append(row);}
}

async function loadPortfolio(){
  state.portfolio=await api("/api/portfolio");
  $("#synced").textContent=state.portfolio.syncing?"Syncing GitHub…":
    "Updated "+formatDate(state.portfolio.lastSynced);
  if(state.portfolio.error)message(state.portfolio.error);
  renderTable();
}
async function loadRepository(name){
  const repo=repoByName(name);
  if (state.repo?.name!==name) {state.atlas=null;state.detail=null;state.selected=null;}
  state.repo=repo;
  if(!repo){message("Repository not found. Synchronize first.");return;}
  $("#repository-title").textContent=name;
  const href=safeGithubUrl(repo.url);
  $("#repository-github").href=href??"#";
  const meta=$("#repository-meta");
  meta.replaceChildren(
    text("span",(repo.summary?.doneTotal??"—")+" issues completed"),
    text("span",(repo.summary?.questionsOpen??"—")+" open questions"),
    text("span",(repo.summary?.merged30??"—")+" PRs merged in 30d"),
    text("span","Verification: "+(repo.summary?.verified??"unknown")),
  );
}
async function loadAtlas(name){
  $("#atlas-tree").replaceChildren(text("p","Loading Decision Atlas…","muted"));
  const atlas=await api("/api/repositories/"+encodeURIComponent(name)+"/atlas");
  state.atlas=atlas;
  renderAtlas();
}
function cleanMarkdown(body) {
  return String(body??"").replace(/\[([^\]]+)\]\([^)]+\)/g,"$1")
    .replace(/\*\*/g,"").replace(/^\[(?:question|implemented[^]]*|owner decision[^]]*)\]\s*/i,"");
}
function createTreeItem(entry,children,query){
  if(state.openOnly && entry.kind!=="group" && (entry.kind!=="question"||entry.resolved))return null;
  const li=node("li","atlas-entry "+entry.kind+(entry.resolved?" resolved":""));
  if(entry.kind==="group"){
    const details=node("details");
    details.open=Number(entry.id.split(".").length)<=2 || Boolean(query && children.has(entry.id));
    const summary=node("summary");
    summary.append(text("span",entry.id+" · "+cleanMarkdown(entry.body)));
    summary.addEventListener("click",()=>{
      state.question=entry.id;
      const params=new URLSearchParams(location.search);params.set("question",entry.id);
      history.replaceState(null,"","?"+params.toString());
      renderAtlasEditor(entry);
    });
    details.append(summary);
    const nested=node("ul");
    for(const child of children.get(entry.id)??[]) {
      const item=createTreeItem(child,children,query);
      if(item)nested.append(item);
    }
    if(nested.children.length)details.append(nested);
    li.append(details);
    if(!nested.children.length)return null;
  }else{
    const button=node("button","atlas-entry-button"+(state.question===entry.id?" selected":""));
    button.type="button";
    button.append(text("span",entry.id,"entry-id"),text("span",cleanMarkdown(entry.body).slice(0,260),"entry-text"));
    if(entry.kind==="question")button.append(badge(entry.resolved?"Answered":"Question",entry.resolved?"subtle":"warn"));
    button.addEventListener("click",()=>{state.question=entry.id;setRoute({repo:state.repo.name,view:"atlas",question:entry.id});});
    li.append(button);
  }
  return li;
}
function renderAtlas(){
  const target=$("#atlas-tree");
  target.replaceChildren();
  if(!state.atlas?.found) {
    target.append(text("p","No Decision Atlas found in this repository.","muted"));
    $("#atlas-editor").replaceChildren(text("p","The portfolio does not create another decision source of truth.","muted"));
    return;
  }
  const entries=state.atlas.entries;
  const children=new Map();
  for(const entry of entries) {
    const parent=entries.some((candidate)=>candidate.id===entry.parent)?entry.parent:null;
    if(!children.has(parent))children.set(parent,[]);
    children.get(parent).push(entry);
  }
  const root=node("ul");
  for(const entry of children.get(null)??[]) {
    const item=createTreeItem(entry,children);
    if(item)root.append(item);
  }
  target.append(root);
  const selected=entries.find((entry)=>entry.id===state.question);
  renderAtlasEditor(selected);
}
function choiceText(question,letter){
  const plain=cleanMarkdown(question.body);
  const marker=new RegExp("\\b(?:Choose\\s+)?"+letter+"\\s*[:—-]\\s*","i");
  const match=marker.exec(plain);
  if(!match)return "Choice "+letter+" — ";
  const rest=plain.slice(match.index+match[0].length);
  const end=rest.search(/;\s*(?:or\s+)?[ABC]\s*[:—-]/i);
  return "Choice "+letter+" — "+(end>=0?rest.slice(0,end):rest).trim().slice(0,550);
}
function renderAtlasEditor(entry){
  const target=$("#atlas-editor");
  target.replaceChildren();
  if(!entry){target.append(text("p","Select an entry in the tree.","muted"));return;}
  target.append(text("p","Decision Atlas "+entry.id,"eyebrow"),text("h2",entry.kind==="question"?"Unresolved question":entry.kind==="decision"?"Recorded decision":"Section"));
  const body=text("p",cleanMarkdown(entry.body),"decision-body");target.append(body);
  if(entry.kind==="group") {
    const form=node("form","answer-form");
    form.append(text("label","Add an entry under section "+entry.id));
    const kind=node("select");
    for(const value of ["question","decision"]) {
      const option=node("option",null,value==="question"?"Question":"Decision");
      option.value=value;kind.append(option);
    }
    const statement=node("textarea");statement.rows=5;statement.required=true;statement.minLength=10;
    statement.placeholder="New question or established decision; give enough context to make it meaningful.";
    const submit=node("button","primary","Propose entry");submit.type="submit";
    const result=node("div","save-result");
    form.append(kind,statement,submit,result);
    form.addEventListener("submit",async(event)=>{
      event.preventDefault();submit.disabled=true;result.textContent="Creating GitHub change…";
      try {
        const saved=await api("/api/repositories/"+encodeURIComponent(state.repo.name)+"/entry",{
          method:"POST",body:JSON.stringify({parentId:entry.id,kind:kind.value,body:statement.value,sha:state.atlas.sha})});
        result.replaceChildren(text("p","Entry "+saved.decisionId+" proposed; pending repository merge."));
        result.append(externalLink(saved.url,"Open pull request #"+saved.number));
      }catch(error){result.replaceChildren(text("p",error.message,"warning"));}
      finally{submit.disabled=false;}
    });
    target.append(form);
    return;
  }
  if(entry.kind!=="question"||entry.resolved){
    if(entry.resolved)target.append(badge("Already answered","subtle"));
    return;
  }
  const form=node("form","answer-form");
  form.append(text("label","Answer / decision to record"));
  const answer=node("textarea");answer.rows=6;answer.required=true;answer.minLength=5;
  answer.placeholder="Describe the actual decision. The Atlas will receive a new numbered Answers entry.";
  const choices=node("div","choice-buttons");
  for(const letter of ["A","B","C"]){
    const choice=node("button","choice",letter);choice.type="button";
    choice.addEventListener("click",()=>{answer.value=choiceText(entry,letter);answer.focus();});
    choices.append(choice);
  }
  form.append(choices,answer);
  const submit=node("button","primary","Record decision");submit.type="submit";
  form.append(submit);
  const result=node("div","save-result");form.append(result);
  form.addEventListener("submit",async(event)=>{
    event.preventDefault();submit.disabled=true;result.replaceChildren(text("span","Creating GitHub change…"));
    try {
      const saved=await api("/api/repositories/"+encodeURIComponent(state.repo.name)+"/answer",{
        method:"POST",body:JSON.stringify({questionId:entry.id,answer:answer.value,sha:state.atlas.sha})});
      result.replaceChildren(text("p","Decision "+saved.decisionId+" proposed; pending repository merge."));
      result.append(externalLink(saved.url,"Open pull request #"+saved.number));
      if(saved.autoMerge)result.append(text("p","GitHub auto-merge enabled; awaiting repository requirements.","muted"));
    } catch(error){result.replaceChildren(text("p",error.message,"warning"));}
    finally{submit.disabled=false;}
  });
  target.append(form);
}
function issueLabel(issue){
  return issue.repo+"#"+issue.number;
}
function issueById(id){return [...(state.detail?.nodes??[]),...(state.detail?.independentItems??[])].find((item)=>item.id===id);}
function svg(tag){return document.createElementNS("http://www.w3.org/2000/svg",tag);}
function renderPapyrus(){
  const canvas=$("#papyrus-canvas");
  canvas.replaceChildren();
  const detail=state.detail;
  if(!detail?.nodes){canvas.append(text("p",detail?.error??"No issue evidence available.","muted"));return;}
  let graph;
  const visible=state.expanded?[...detail.nodes,...(detail.independentItems??[])]:detail.nodes;
  try{graph=layoutDag(visible,detail.edges);}
  catch(error){canvas.append(text("p",error.message,"warning"));return;}
  canvas.style.width=graph.width+"px";canvas.style.height=graph.height+"px";
  const paths=svg("svg");paths.setAttribute("class","papyrus-edges");
  paths.setAttribute("viewBox","0 0 "+graph.width+" "+graph.height);
  paths.setAttribute("width",graph.width);paths.setAttribute("height",graph.height);
  const defs=svg("defs"),marker=svg("marker"),arrow=svg("path");
  marker.setAttribute("id","arrow");marker.setAttribute("viewBox","0 0 10 10");
  marker.setAttribute("refX","9");marker.setAttribute("refY","5");
  marker.setAttribute("markerWidth","5");marker.setAttribute("markerHeight","5");
  marker.setAttribute("orient","auto-start-reverse");
  arrow.setAttribute("d","M0,0 L10,5 L0,10 z");arrow.setAttribute("fill","currentColor");
  marker.append(arrow);defs.append(marker);paths.append(defs);
  const byId=new Map(graph.nodes.map((item)=>[item.id,item]));
  for(const {from,to} of graph.edges){
    const a=byId.get(from),b=byId.get(to);
    const line=svg("path");
    line.setAttribute("d","M"+(a.x+222)+","+(a.y+35)+" C"+(a.x+265)+","+(a.y+35)+" "+(b.x-45)+","+(b.y+35)+" "+b.x+","+(b.y+35));
    line.setAttribute("fill","none");line.setAttribute("marker-end","url(#arrow)");
    line.setAttribute("class","dependency"+(state.selected && state.selected!==from && state.selected!==to?" dim":""));
    paths.append(line);
  }
  canvas.append(paths);
  for(const item of graph.nodes){
    const selected=state.selected===item.id;
    const neighbor=state.selected && (item.predecessors.includes(state.selected)||item.successors.includes(state.selected));
    const card=node("div","issue-node "+(item.state==="closed"?"done":item.active?"active":"future")+
      (selected?" selected":"")+(state.selected&&!selected&&!neighbor?" dim":""));
    card.style.left=item.x+"px";card.style.top=item.y+"px";
    card.tabIndex=0;card.setAttribute("role","button");card.setAttribute("aria-label","Inspect "+issueLabel(item));
    const header=node("div","issue-header");
    header.append(text("strong","#"+item.number),badge(item.state==="closed"?"Done":item.activity==="open-pr"?"Open PR":
      item.activity==="in-progress"?"In progress":item.activity==="recent"?"Recent activity":"Open"));
    card.append(header,text("span",item.title,"issue-title"));
    card.append(text("span",item.repo,"issue-repo"));
    const ownRepo=item.repo===state.repo.fullName;
    const openRefs=item.questionRefs?.filter((id)=>!ownRepo || state.atlas?.entries?.some((entry)=>entry.id===id&&!entry.resolved))??[];
    if(openRefs.length){
      const button=node("button","question-badge",openRefs.length+" decision question"+(openRefs.length>1?"s":""));
      button.type="button";
      button.addEventListener("click",(event)=>{
        event.stopPropagation();
        const repoName=item.repo.split("/")[1];
        if(repoByName(repoName))setRoute({repo:repoName,view:"atlas",question:openRefs[0]});
        else message("The referenced repository is not in this portfolio.");
      });
      card.append(button);
    }
    card.addEventListener("click",()=>selectIssue(item.id));
    card.addEventListener("keydown",(event)=>{if(event.key==="Enter")selectIssue(item.id);});
    canvas.append(card);
  }
  renderInspector();
  const actualActive=graph.nodes.filter((item)=>item.active);
  const first=actualActive[0]??graph.nodes.find((item)=>item.state==="open")??graph.nodes[0];
  if(!state.selected && first) {
    requestAnimationFrame(()=>{$("#papyrus-scroll").scrollLeft=Math.max(0,first.x-($("#papyrus-scroll").clientWidth/2)+110);});
  }
  $("#independent-summary").textContent="Other independent issues ("+detail.independent+")";
  const list=$("#independent-items");
  list.replaceChildren();
  for(const item of detail.independentItems??[]) {
    const button=node("button","independent-issue","#"+item.number+" · "+item.title);
    button.addEventListener("click",()=>{state.expanded=true;$("#independent-details").open=true;selectIssue(item.id);});
    list.append(button);
  }
  if(detail.notices?.length)list.append(text("p",detail.notices.join("; "),"warning"));
}
function selectIssue(id){
  state.selected=id;
  const params=new URLSearchParams(location.search);params.set("issue",id);
  history.replaceState(null,"","?"+params.toString());
  renderPapyrus();
  const position=[...$("#papyrus-canvas").querySelectorAll(".issue-node")].find((item)=>
    item.getAttribute("aria-label")==="Inspect "+issueLabel(issueById(id)??{repo:"",number:-1}));
  if(position)position.scrollIntoView({block:"nearest",inline:"center",behavior:"smooth"});
}
function renderInspector(){
  const target=$("#issue-inspector");target.replaceChildren();
  const issue=issueById(state.selected);
  if(!issue){target.append(text("p","Select an issue. Native GitHub dependencies are shown as arrows.","muted"));return;}
  target.append(text("p",issueLabel(issue),"eyebrow"),text("h2",issue.title));
  target.append(badge(issue.state==="closed"?"Completed":issue.activity==="open-pr"?"Open PR":
    issue.activity==="recent"?"Recently updated":"Open"));
  target.append(externalLink(issue.url,"Open issue on GitHub ↗"));
  if(issue.pullUrl)target.append(externalLink(issue.pullUrl,"Referenced by an open PR"));
  target.append(text("h3","Immediate predecessors"));
  const predecessors=state.detail.edges.filter((edge)=>edge.to===issue.id);
  if(!predecessors.length)target.append(text("p","No native blocking dependencies.","muted"));
  for(const edge of predecessors){
    const predecessor=issueById(edge.from);
    if(!predecessor)continue;
    const row=node("div","dependency-row");
    const button=node("button",null,issueLabel(predecessor)+" · "+predecessor.title);
    button.addEventListener("click",()=>selectIssue(predecessor.id));row.append(button);
    if(issue.repo===state.repo.fullName){
      const remove=node("button","subtle-button","Remove");
      remove.addEventListener("click",()=>editDependency("remove",issue,predecessor.repo.split("/")[1],predecessor.number));
      row.append(remove);
    }
    target.append(row);
  }
  target.append(text("h3","Immediate successors"));
  const successors=state.detail.edges.filter((edge)=>edge.from===issue.id);
  if(!successors.length)target.append(text("p","No native successors detected.","muted"));
  for(const edge of successors){
    const next=issueById(edge.to);if(!next)continue;
    const button=node("button","dependency-row",issueLabel(next)+" · "+next.title);
    button.addEventListener("click",()=>selectIssue(next.id));target.append(button);
  }
  if(issue.questionRefs?.length){
    target.append(text("h3","Referenced Decision Atlas questions"));
    for(const id of issue.questionRefs){
      const button=node("button","question-link","Question "+id+" ↗");
      button.addEventListener("click",()=>{
        const repoName=issue.repo.split("/")[1];
        if(repoByName(repoName))setRoute({repo:repoName,view:"atlas",question:id});
        else message("The referenced repository is not in this portfolio.");
      });
      target.append(button);
    }
  }
  if(issue.repo===state.repo.fullName && issue.state==="open"){
    const form=node("form","dependency-form");
    form.append(text("h3","Add native dependency"));
    const input=node("input");input.placeholder="repository#123 (or #123)";
    input.required=true;
    const submit=node("button","subtle-button","Add blocker");submit.type="submit";
    form.append(input,submit);
    form.addEventListener("submit",async(event)=>{
      event.preventDefault();
      const parsed=/^(?:([a-z\d_.-]+)\/)?([a-z\d_.-]+)?#(\d+)$/i.exec(input.value.trim());
      if(!parsed){message("Use repo#123, owner/repo#123 or #123.");return;}
      const repoName=parsed[2]??state.repo.name;
      await editDependency("add",issue,repoName,Number(parsed[3]));
    });
    target.append(form);
  }
}
async function editDependency(action,issue,blockingRepo,blockingIssue){
  try {
    await api("/api/repositories/"+encodeURIComponent(state.repo.name)+"/dependencies",{
      method:"POST",body:JSON.stringify({action,issue:issue.number,blockingRepo,blockingIssue})});
    message(null);
    state.detail=await api("/api/repositories/"+encodeURIComponent(state.repo.name));
    renderPapyrus();
  }catch(error){message(error);}
}
async function loadExecution(name){
  $("#papyrus-canvas").replaceChildren(text("p","Loading native GitHub issue dependencies…","muted"));
  state.detail=await api("/api/repositories/"+encodeURIComponent(name));
  const wanted=new URLSearchParams(location.search).get("issue");
  if(wanted && state.detail.nodes?.some((issue)=>issue.id===wanted))state.selected=wanted;
  else state.selected=null;
  renderPapyrus();
}
async function renderInbox(){
  const data=await api("/api/decisions");state.inbox=data.questions;
  const items=data.questions.filter((item)=>state.filter==="all"||item.blocking);
  $("#question-count").textContent=items.length+" unanswered";
  const target=$("#decision-items");target.replaceChildren();
  for(const item of items){
    const article=node("article","inbox-item");
    const row=node("div","inbox-heading");
    row.append(text("strong",item.repo+" · "+item.id));
    if(item.blocking)row.append(badge("Blocks an issue","warn"));
    article.append(row,text("p",cleanMarkdown(item.body)));
    const button=node("button","subtle-button","Open question");
    button.addEventListener("click",()=>setRoute({repo:item.repo,view:"atlas",question:item.id}));
    article.append(button);target.append(article);
  }
  if(!items.length)target.append(text("p","No unanswered questions in the current view.","muted"));
}
async function route(){
  const p=new URLSearchParams(location.search);
  const name=p.get("repo");
  const inbox=p.get("page")==="decisions";
  const v=p.get("view")==="execution"?"execution":"atlas";
  state.question=p.get("question");
  $("#portfolio-page").hidden=Boolean(name||inbox);
  $("#repository-page").hidden=!name;
  $("#decisions-page").hidden=!inbox;
  $("#nav-repos").classList.toggle("nav-active",!inbox);
  $("#nav-decisions").classList.toggle("nav-active",inbox);
  if(inbox){await renderInbox();return;}
  if(!name){renderTable();return;}
  await loadRepository(name);
  if(!state.repo)return;
  state.view=v;
  $("#tab-atlas").classList.toggle("active",v==="atlas");
  $("#tab-execution").classList.toggle("active",v==="execution");
  $("#tab-atlas").setAttribute("aria-selected",String(v==="atlas"));
  $("#tab-execution").setAttribute("aria-selected",String(v==="execution"));
  $("#atlas-view").hidden=v!=="atlas";
  $("#execution-view").hidden=v!=="execution";
  if(v==="atlas")await loadAtlas(name);else {
    if(!state.atlas || state.repo.name!==name) {
      try {state.atlas=await api("/api/repositories/"+encodeURIComponent(name)+"/atlas");}catch{state.atlas=null;}
    }
    await loadExecution(name);
  }
}
function bind(){
  $("#home-link").addEventListener("click",(e)=>{e.preventDefault();setRoute();});
  $("#back-to-repos").addEventListener("click",()=>setRoute());
  $("#nav-repos").addEventListener("click",()=>setRoute());
  $("#nav-decisions").addEventListener("click",()=>setRoute({inbox:true}));
  $("#repo-search").addEventListener("input",(e)=>{state.query=e.target.value;renderTable();});
  $("#period").addEventListener("change",(e)=>{state.period=e.target.value;renderTable();});
  $("#repo-sort").addEventListener("change",(e)=>{state.sort=e.target.value;renderTable();});
  $("#include-archived").addEventListener("change",(e)=>{state.includeArchived=e.target.checked;renderTable();});
  $("#include-forks").addEventListener("change",(e)=>{state.includeForks=e.target.checked;renderTable();});
  $("#tab-atlas").addEventListener("click",()=>setRoute({repo:state.repo.name,view:"atlas"}));
  $("#tab-execution").addEventListener("click",()=>setRoute({repo:state.repo.name,view:"execution"}));
  $("#open-only").addEventListener("change",(e)=>{state.openOnly=e.target.checked;renderAtlas();});
  $("#jump-now").addEventListener("click",()=>{state.selected=null;renderPapyrus();});
  $("#independent-details").addEventListener("toggle",(event)=>{
    state.expanded=event.target.open;
    if(state.view==="execution"&&state.detail)renderPapyrus();
  });
  $("#decision-filter").addEventListener("change",(e)=>{state.filter=e.target.value;void renderInbox();});
  $("#guided-next").addEventListener("click",()=>{
    const next=state.inbox.find((entry)=>state.filter!=="blocking"||entry.blocking);
    if(next)setRoute({repo:next.repo,view:"atlas",question:next.id});
  });
  $("#refresh").addEventListener("click",async()=>{
    try{await api("/api/refresh",{method:"POST",body:"{}"});$("#synced").textContent="Syncing GitHub…";}
    catch(error){message(error);}
  });
  $("#sign-in").addEventListener("click",()=>{location.href="/auth/login";});
  $("#sign-out").addEventListener("click",async()=>{await api("/api/logout",{method:"POST",body:"{}"});location.reload();});
  window.addEventListener("popstate",()=>{void route().catch(message);});
}
async function main(){
  bind();
  try{
    const me=await api("/api/me");
    $("#sign-in").hidden=me.authenticated;
    $("#sign-out").hidden=!me.authenticated||me.mode==="local";
    if(!me.authenticated){
      $("#portfolio-rows").replaceChildren();
      $("#synced").textContent="Authentication required";
      message("Sign in with GitHub to access your private portfolio.");
      return;
    }
    await loadPortfolio();
    await route();
    setInterval(async()=>{
      if(document.hidden)return;
      try {
        const previous=state.portfolio?.lastSynced;
        await loadPortfolio();
        if(previous!==state.portfolio.lastSynced && new URLSearchParams(location.search).get("page")==="decisions")await renderInbox();
      }catch(error){message(error);}
    },15_000);
  }catch(error){message(error);}
}
void main();
