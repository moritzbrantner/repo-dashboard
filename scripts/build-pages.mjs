import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const target=resolve(root,"dist");
const raw=process.env.REPO_DASHBOARD_API_BASE_URL;
if(!raw)throw new Error("Set REPO_DASHBOARD_API_BASE_URL to the HTTPS backend origin.");
const api=new URL(raw);
if(api.protocol!=="https:"||api.pathname!=="/"||api.search||api.hash||api.username||api.password)
  throw new Error("Backend API URL must be an HTTPS origin without path, query or credentials.");

// Only known static files are copied. Never export private data/, repository history or secrets.
await rm(target,{recursive:true,force:true}); // dist/ is generated output, never user data.
await mkdir(target,{recursive:true});
for(const name of ["app.js","styles.css","index.html"])await copyFile(resolve(root,"site",name),resolve(target,name));
await mkdir(resolve(target,"shared"),{recursive:true});
await copyFile(resolve(root,"lib/portfolio.mjs"),resolve(target,"shared/portfolio.mjs"));
await writeFile(resolve(target,"config.json"),JSON.stringify({apiBase:api.origin})+"\n");
const html=await readFile(resolve(target,"index.html"),"utf8");
const csp="default-src 'self'; connect-src 'self' "+api.origin+
  "; img-src 'self' data:; style-src 'self'; script-src 'self'; base-uri 'self'; form-action 'none'; object-src 'none'";
await writeFile(resolve(target,"index.html"),html.replace("<head>",
  '<head>\n    <meta http-equiv="Content-Security-Policy" content="'+csp+'" />'));
