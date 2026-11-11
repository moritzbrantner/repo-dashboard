import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { PortfolioGitHubClient } from "../lib/portfolio-github.mjs";
import { PortfolioStore } from "../lib/portfolio-store.mjs";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const site=resolve(root,"site");
const mime={".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",
  ".js":"text/javascript; charset=utf-8",".json":"application/json; charset=utf-8",
  ".svg":"image/svg+xml"};

const random=()=>randomBytes(32).toString("hex");
const challenge=(verifier)=>createHash("sha256").update(verifier).digest("base64url");
const validChallenge=(value)=>typeof value==="string"&&/^[A-Za-z0-9_-]{43}$/.test(value);
const sameChallenge=(left,right)=>{
  const a=Buffer.from(left),b=Buffer.from(right);
  return a.length===b.length&&timingSafeEqual(a,b);
};
function cookies(request) {
  return Object.fromEntries(String(request.headers.cookie??"").split(";")
    .map((part)=>part.trim().split("=")).filter((pair)=>pair.length===2));
}
function writeJson(response,status,value) {
  response.writeHead(status,{"content-type":"application/json; charset=utf-8","cache-control":"no-store"});
  response.end(JSON.stringify(value));
}
async function readJson(request) {
  if (request.headers["content-type"]?.split(";")[0]!=="application/json") throw new Error("JSON content type required.");
  let buffer="";
  for await (const chunk of request) {
    buffer+=chunk.toString("utf8");
    if (buffer.length>8192) throw new Error("Request too large.");
  }
  return JSON.parse(buffer);
}
function writeRedirect(response,url,cookie) {
  response.writeHead(302,{location:url,...(cookie?{"set-cookie":cookie}:{})});
  response.end();
}
function cookie(name,value,secure=false,maxAge=0) {
  return name+"="+value+"; Path=/; HttpOnly; SameSite=Lax"+
    (secure?"; Secure":"")+(maxAge?"; Max-Age="+maxAge:"");
}

export function createPortfolioServer({store,owner,host="127.0.0.1",localToken=null,
  clientId=process.env.GITHUB_CLIENT_ID,clientSecret=process.env.GITHUB_CLIENT_SECRET,
  publicUrl=process.env.PUBLIC_URL,frontendUrl=process.env.FRONTEND_URL,
  oauthExchange=async(code)=>{
    const exchange=await fetch("https://github.com/login/oauth/access_token",{
      method:"POST",headers:{Accept:"application/json","Content-Type":"application/json"},
      body:JSON.stringify({client_id:clientId,client_secret:clientSecret,code})});
    if(!exchange.ok)throw new Error("GitHub OAuth exchange failed.");
    return exchange.json();
  },clientFactory=(token)=>new PortfolioGitHubClient(token)}={}) {
  const loopback=["127.0.0.1","localhost","::1"].includes(host);
  const oauth=Boolean(clientId && clientSecret && publicUrl);
  const secure=Boolean(publicUrl?.startsWith("https://"));
  if (!owner || !store) throw new Error("Portfolio store and owner are required.");
  if (localToken && !loopback) throw new Error("Local token mode must bind to loopback.");
  if (!localToken && !oauth) throw new Error("Set GITHUB_TOKEN for local use or GitHub OAuth configuration.");
  if (!loopback && (!oauth || !secure)) throw new Error("Remote hosting requires GitHub OAuth and PUBLIC_URL=https://...");
  const base=publicUrl?new URL(publicUrl):null;
  const origin=base?.origin ?? null;
  const frontend=frontendUrl?new URL(frontendUrl):null;
  if(frontend && (frontend.protocol!=="https:"||frontend.username||frontend.password||frontend.search||frontend.hash||
    !frontend.pathname.endsWith("/")))
    throw new Error("FRONTEND_URL must be a fixed HTTPS page URL ending in /, without credentials or query parameters.");
  if(frontend && !oauth)throw new Error("Split frontend requires GitHub OAuth.");
  const frontendOrigin=frontend?.origin??null;
  const sessions=new Map();
  const pending=new Map();
  const tickets=new Map();

  const server=createServer(async(request,response)=>{
    response.setHeader("x-content-type-options","nosniff");
    response.setHeader("referrer-policy","no-referrer");
    response.setHeader("content-security-policy","default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      const url=new URL(request.url,"http://localhost");
      const path=url.pathname;
      const values=cookies(request);
      if(path==="/auth/login"){
        for(const [key,value] of pending)if(value.expires<=Date.now())pending.delete(key);
        for(const [key,value] of tickets)if(value.expires<=Date.now())tickets.delete(key);
        for(const [key,value] of sessions)if(value.expires<=Date.now())sessions.delete(key);
      }
      const incoming=request.headers.origin;
      if(frontendOrigin && incoming===frontendOrigin &&
        (path.startsWith("/api/")||path==="/auth/exchange")){
        response.setHeader("access-control-allow-origin",frontendOrigin);
        response.setHeader("vary","Origin");
        response.setHeader("access-control-allow-headers","Authorization, Content-Type");
        response.setHeader("access-control-allow-methods","GET, POST, OPTIONS");
      }
      if(request.method==="OPTIONS" && (path.startsWith("/api/")||path==="/auth/exchange")){
        response.writeHead(incoming===frontendOrigin&&frontendOrigin?204:403);
        return response.end();
      }
      if (path==="/auth/login" && request.method==="GET") {
        if (localToken) return writeRedirect(response,"/");
        const state=random();
        const pkce=url.searchParams.get("challenge");
        if(frontend && !validChallenge(pkce))return writeJson(response,400,{error:"Invalid login challenge."});
        pending.set(state,{expires:Date.now()+300_000,pkce});
        const next=new URL("https://github.com/login/oauth/authorize");
        next.searchParams.set("client_id",clientId);
        next.searchParams.set("redirect_uri",base.origin+base.pathname.replace(/\/$/,"")+"/auth/callback");
        next.searchParams.set("scope","repo");
        next.searchParams.set("state",state);
        return writeRedirect(response,next.href,cookie("portfolio_oauth",state,secure,300));
      }
      if (path==="/auth/callback" && request.method==="GET" && oauth) {
        const state=url.searchParams.get("state");
        const record=pending.get(state);
        const valid=record && state===values.portfolio_oauth && record.expires>Date.now();
        if (state) pending.delete(state);
        if (!valid || !url.searchParams.get("code")) return writeJson(response,403,{error:"Invalid OAuth state."});
        const grant=await oauthExchange(url.searchParams.get("code"));
        if (!grant.access_token) throw new Error("GitHub OAuth access denied.");
        const client=clientFactory(grant.access_token);
        const viewer=await client.viewer();
        if (viewer.login?.toLowerCase()!==owner.toLowerCase()) return writeJson(response,403,{error:"GitHub account not authorized."});
        const session=random();
        sessions.set(session,{client,expires:Date.now()+12*3_600_000,login:viewer.login});
        store.client=client;
        if(frontend){
          const ticket=random();
          tickets.set(ticket,{session,pkce:record.pkce,expires:Date.now()+60_000});
          const destination=new URL(frontend);
          destination.searchParams.set("ticket",ticket);
          return writeRedirect(response,destination.href,cookie("portfolio_oauth","",secure,-1));
        }
        return writeRedirect(response,"/",cookie("portfolio_session",session,secure,43200));
      }

      if(path==="/auth/exchange" && request.method==="POST" && frontend){
        if(incoming!==frontendOrigin)return writeJson(response,403,{error:"Origin check failed."});
        const body=await readJson(request);
        if(!body||typeof body.ticket!=="string"||typeof body.verifier!=="string")
          return writeJson(response,400,{error:"Invalid login exchange request."});
        const record=tickets.get(body.ticket);
        if(body.ticket)tickets.delete(body.ticket);
        if(!record||record.expires<=Date.now()||body.verifier.length>256||
          !sameChallenge(challenge(body.verifier),record.pkce))
          return writeJson(response,403,{error:"Invalid or expired login ticket."});
        return writeJson(response,200,{sessionToken:record.session});
      }

      const bearer=/^Bearer ([a-f0-9]{64})$/.exec(request.headers.authorization??"")?.[1];
      const sessionKey=bearer??values.portfolio_session;
      const session=sessions.get(sessionKey);
      const validSession=session?.expires>Date.now() ? session : null;
      const authenticated=Boolean(localToken || validSession);
      if (path==="/api/me" && request.method==="GET") {
        return writeJson(response,200,{authenticated,login:authenticated?owner:null,
          mode:localToken?"local":"oauth"});
      }
      if (path.startsWith("/api/")) {
        if (!authenticated) return writeJson(response,401,{error:"Sign in with your GitHub account."});
        if (!localToken) store.client=validSession.client;
        if (request.method!=="GET") {
          const expected=bearer&&frontendOrigin?frontendOrigin:origin??("http://"+request.headers.host);
          if (!incoming || incoming!==expected) return writeJson(response,403,{error:"Origin check failed."});
        }
        if (path==="/api/portfolio" && request.method==="GET") {
          if (!store.lastSynced && !store.syncing) void store.sync();
          return writeJson(response,200,store.overview());
        }
        if (path==="/api/refresh" && request.method==="POST") {
          void store.sync();
          return writeJson(response,202,{syncing:true});
        }
        if (path==="/api/decisions" && request.method==="GET") return writeJson(response,200,{questions:store.decisions()});
        if (path==="/api/backlog" && request.method==="GET") {
          const raw=url.searchParams.get("offset")??"0";
          if(!/^(0|[1-9]\d{0,5})$/.test(raw))return writeJson(response,400,{error:"Invalid backlog offset."});
          return writeJson(response,200,await store.backlog(Number(raw)));
        }
        if (path==="/api/logout" && request.method==="POST") {
          if (sessionKey) sessions.delete(sessionKey);
          response.setHeader("set-cookie",cookie("portfolio_session","",secure,0)+"; Max-Age=0");
          return writeJson(response,200,{loggedOut:true});
        }

        const match=/^\/api\/repositories\/([a-zA-Z0-9_.-]+)(?:\/(atlas|answer|entry|dependencies))?$/.exec(path);
        if (!match) return writeJson(response,404,{error:"Unknown endpoint."});
        const name=match[1];
        if (request.method==="GET" && !match[2]) {
          const detail=await store.detail(name);
          return writeJson(response,detail?200:404,detail??{error:"Repository not found."});
        }
        if (request.method==="GET" && match[2]==="atlas") {
          const atlas=await store.atlas(name);
          return writeJson(response,atlas?200:404,atlas??{error:"Repository not found."});
        }
        if (request.method==="POST" && match[2]==="answer") {
          const data=await readJson(request);
          if (typeof data.questionId!=="string" || typeof data.answer!=="string" ||
            typeof data.sha!=="string") return writeJson(response,400,{error:"Invalid answer request."});
          return writeJson(response,201,await store.answer(name,data.questionId,data.answer,data.sha));
        }
        if (request.method==="POST" && match[2]==="entry") {
          const data=await readJson(request);
          if (typeof data.parentId!=="string" || typeof data.body!=="string" ||
              typeof data.kind!=="string" || typeof data.sha!=="string")
            return writeJson(response,400,{error:"Invalid entry request."});
          return writeJson(response,201,await store.entry(name,data.parentId,data.kind,data.body,data.sha));
        }
        if (request.method==="POST" && match[2]==="dependencies") {
          const data=await readJson(request);
          if (!["add","remove"].includes(data.action) ||
              !Number.isSafeInteger(data.issue) || !Number.isSafeInteger(data.blockingIssue) ||
              !/^[a-z\d_.-]+$/i.test(data.blockingRepo)) return writeJson(response,400,{error:"Invalid dependency request."});
          await store.dependency(name,data.issue,data.action,data.blockingRepo,data.blockingIssue);
          return writeJson(response,200,{updated:true});
        }
        return writeJson(response,405,{error:"Method not allowed."});
      }

      if (request.method!=="GET" && request.method!=="HEAD") return writeJson(response,405,{error:"Method not allowed."});
      if (path==="/shared/portfolio.mjs") {
        const bytes=await readFile(resolve(root,"lib/portfolio.mjs"));
        response.writeHead(200,{"content-type":"text/javascript; charset=utf-8","cache-control":"no-store"});
        return response.end(request.method==="HEAD"?undefined:bytes);
      }
      let decoded;
      try {decoded=decodeURIComponent(path);} catch {return writeJson(response,400,{error:"Invalid path."});}
      const candidate=resolve(site,"."+decoded);
      if (candidate!==site && !candidate.startsWith(site+sep)) return writeJson(response,404,{error:"Not found."});
      const filepath=candidate===site?resolve(site,"index.html"):candidate;
      const bytes=await readFile(filepath);
      response.writeHead(200,{"content-type":mime[extname(filepath)]??"application/octet-stream","cache-control":"no-store"});
      if (request.method==="HEAD") response.end(); else response.end(bytes);
    } catch(error) {
      const message=error instanceof Error?error.message:String(error);
      const status=message.startsWith("GitHub 403")?403:
        /not found|Unknown repository/i.test(message)?404:
        /changed; refresh|already been answered|collision/i.test(message)?409:
        /Invalid|too large|does not exist|Select a|Provide a/.test(message)?400:502;
      writeJson(response,status,{error:message});
    }
  });
  return server;
}

if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const config=JSON.parse(await readFile(resolve(root,"config/dashboard.json"),"utf8"));
  const host=process.env.HOST??"127.0.0.1";
  const port=Number(process.env.PORT??4173);
  const token=process.env.GITHUB_TOKEN??null;
  const client=token?new PortfolioGitHubClient(token):null;
  const store=await new PortfolioStore({owner:config.owner,file:resolve(root,"data/portfolio.json"),
    client,concurrency:config.maxConcurrency}).load();
  const server=createPortfolioServer({store,owner:config.owner,host,localToken:token});
  if (client) {
    const user=await client.viewer();
    if (user.login?.toLowerCase()!==config.owner.toLowerCase()) {
      throw new Error("GITHUB_TOKEN must authenticate as "+config.owner+", got "+user.login);
    }
  }
  server.listen(port,host,()=>{
    console.log("Portfolio manager: http://"+host+":"+port);
    if (client) void store.sync();
  });
  setInterval(()=>{if (store.client) void store.sync();},15*60_000).unref();
}
