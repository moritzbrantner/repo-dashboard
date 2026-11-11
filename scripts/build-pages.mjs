import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PublicGitHubClient, collectPublicSnapshot } from "../lib/public-snapshot.mjs";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const target=resolve(root,"dist");
const mode=process.env.REPO_DASHBOARD_MODE??"public";
if(!["public","private"].includes(mode))throw new Error("Invalid Pages mode: "+mode);
let api;
if(mode==="private"){
  const raw=process.env.REPO_DASHBOARD_API_BASE_URL;
  if(!raw)throw new Error("Set REPO_DASHBOARD_API_BASE_URL to the HTTPS backend origin.");
  api=new URL(raw);
  if(api.protocol!=="https:"||api.pathname!=="/"||api.search||api.hash||api.username||api.password)
    throw new Error("Backend API URL must be an HTTPS origin without path, query or credentials.");
}

let snapshot;
if(mode==="public"){
  // Only owner-scoped public endpoints; never /user/repos or the local private cache.
  const config=JSON.parse(await readFile(resolve(root,"config/public-owners.json"),"utf8"));
  if(!Array.isArray(config.owners)||!config.owners.length||config.owners.some((owner)=>
    typeof owner!=="string"||!/^[a-z\d_.-]+$/i.test(owner)))throw new Error("Invalid public owners configuration.");
  const token=process.env.GITHUB_TOKEN;
  if(!token)throw new Error("A build-only GITHUB_TOKEN is required to refresh the public snapshot.");
  snapshot=await collectPublicSnapshot({client:new PublicGitHubClient(token),owners:config.owners});
}

// Only known static files are copied. Never export private data/, repository history or secrets.
await rm(target,{recursive:true,force:true}); // dist/ is generated output, never user data.
await mkdir(target,{recursive:true});
for(const name of ["app.js","styles.css","index.html"])await copyFile(resolve(root,"site",name),resolve(target,name));
await mkdir(resolve(target,"shared"),{recursive:true});
await copyFile(resolve(root,"lib/portfolio.mjs"),resolve(target,"shared/portfolio.mjs"));
await writeFile(resolve(target,"config.json"),JSON.stringify(mode==="public"?{mode}:{mode,apiBase:api.origin})+"\n");
if(snapshot)await writeFile(resolve(target,"public-data.json"),JSON.stringify(snapshot)+"\n");
const html=await readFile(resolve(target,"index.html"),"utf8");
const csp="default-src 'self'; connect-src 'self' "+(mode==="public"?"https://api.github.com":api.origin)+
  "; img-src 'self' data:; style-src 'self'; script-src 'self'; base-uri 'self'; form-action 'none'; object-src 'none'";
await writeFile(resolve(target,"index.html"),html.replace("<head>",
  '<head>\n    <meta http-equiv="Content-Security-Policy" content="'+csp+'" />'));
