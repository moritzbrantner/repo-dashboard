// Preloaded only by the Pages artifact test; no network or secrets are required.
const issue={id:1,number:1,title:"Public sample issue",body:"",state:"open",
  html_url:"https://github.com/moritzbrantner/sample-public/issues/1",
  repository_url:"https://api.github.com/repos/moritzbrantner/sample-public",
  created_at:"2026-11-11T10:00:00Z",updated_at:"2026-11-11T10:00:00Z"};
const repository={name:"sample-public",full_name:"moritzbrantner/sample-public",
  owner:{login:"moritzbrantner"},html_url:"https://github.com/moritzbrantner/sample-public",
  private:false,fork:false,archived:false,default_branch:"main"};
globalThis.fetch=async(raw)=>{
  const path=new URL(raw).pathname;
  const query=new URL(raw).searchParams;
  let value;
  if(path==="/users/moritzbrantner")value={type:"User"};
  else if(path==="/users/moenarch-games")value={type:"Organization"};
  else if(path==="/users/moritzbrantner/repos")value=query.get("page")==="1"?[repository]:[];
  else if(path==="/orgs/moenarch-games/repos")value=[];
  else if(path==="/repos/moritzbrantner/sample-public/issues")
    value=query.get("state")==="open"?[issue]:[];
  else if(path==="/repos/moritzbrantner/sample-public/pulls")value=[];
  else if(path==="/repos/moritzbrantner/sample-public/git/trees/main")value={tree:[]};
  else if(path==="/repos/moritzbrantner/sample-public/issues/1/dependencies/blocked_by")value=[];
  else throw new Error("Unexpected public GitHub endpoint: "+path);
  return new Response(JSON.stringify(value),{status:200,headers:{"Content-Type":"application/json"}});
};
