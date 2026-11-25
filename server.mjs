import {createSessions} from './src/session.mjs';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {authorize,allowedWrite,validateSave,createStore,applyOperation} from './src/cloud.mjs';
const root=new URL('.',import.meta.url);
const files={'/':'index.html','/index.html':'index.html','/src/app.mjs':'src/app.mjs','/src/core.mjs':'src/core.mjs','/src/i18n.mjs':'src/i18n.mjs','/src/professional.mjs':'src/professional.mjs','/src/export.mjs':'src/export.mjs','/src/diagram.mjs':'src/diagram.mjs','/src/diagram-ui.mjs':'src/diagram-ui.mjs','/src/styles.css':'src/styles.css','/login.html':'login.html','/src/login.mjs':'src/login.mjs','/src/analysis-tools.mjs':'src/analysis-tools.mjs'};
const mime={html:'text/html; charset=utf-8',mjs:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8'};
const MAX=10*1024*1024;
export function buildServer({store=null,user='',password='',origin='',sessionMode=false,publicMode=false}={}){
 const failures=new Map(),sessions=sessionMode&&!publicMode?createSessions(user,password):null;
 return createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost'),path=url.pathname,project=url.searchParams.get('project')||'default';
  const headers={'X-Content-Type-Options':'nosniff','Cache-Control':'no-store','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"};
  if(store)headers['Strict-Transport-Security']='max-age=31536000';
  const json=(status,data,extra={})=>{res.writeHead(status,{...headers,'Content-Type':'application/json; charset=utf-8',...extra});res.end(JSON.stringify(data));};
  try{
   if(path==='/healthz'&&req.method==='GET'){
    if(store)await store.health();
    return json(200,{ok:true});
   }
   if(store&&sessions){
    if(path==='/login.html'||path==='/src/login.mjs'||path==='/src/styles.css'){
     if(req.method!=='GET'&&req.method!=='HEAD')return json(405,{error:'Method not allowed.'});
     const data=await readFile(new URL(files[path],root));res.writeHead(200,{...headers,'Content-Type':mime[files[path].split('.').pop()]});return res.end(req.method==='HEAD'?undefined:data);
    }
    if(path==='/api/login'||path==='/api/logout'){
     if(req.method!=='POST'||!allowedWrite(req.headers,origin))return json(403,{error:'Invalid request origin or content type.'});
     if(path==='/api/logout'){sessions.revoke(req.headers.cookie);return json(200,{ok:true},{'Set-Cookie':sessions.clearCookie});}
     let n=0,parts=[];for await(const chunk of req){n+=chunk.length;if(n>4096){res.destroy();return;}parts.push(chunk);}
     let body;try{body=JSON.parse(Buffer.concat(parts).toString('utf8'));}catch{return json(400,{error:'Invalid login request.'});}
     const outcome=await sessions.login(body?.username,body?.password);
     if(outcome.status!==200)return json(outcome.status,{error:outcome.status===429?'Too many authentication attempts. Retry later.':'Invalid credentials.'});
     return json(200,{ok:true},{'Set-Cookie':outcome.cookie});
    }
    if(!sessions.valid(req.headers.cookie)){
     if(path==='/'||path==='/index.html'){res.writeHead(303,{...headers,Location:'/login.html'});return res.end();}
     return json(401,{error:'Authentication required.'});
    }
   }
   if(store&&!sessions&&!publicMode){
    const ip=req.socket.remoteAddress||'unknown',now=Date.now();
    // Bounded global fallback because reverse proxy addresses may be shared.
    for(const [key,v] of failures)if(v.until<=now)failures.delete(key);
    if(!authorize(req.headers.authorization,user,password)){
     const v=failures.get(ip)||{count:0,until:now+60000};
     if(v.count>=30)return json(429,{error:'Too many authentication attempts. Retry later.'},{'Retry-After':'60'});
     if(req.headers.authorization&&failures.size<1000){v.count++;failures.set(ip,v);}
     return json(401,{error:'Authentication required.'},{'WWW-Authenticate':'Basic realm="Requirement Studio", charset="UTF-8"'});
    }
   }
   if(!/^(default|[a-f0-9-]{36})$/.test(project))return json(400,{error:'Invalid project ID.'});
   if(path==='/api/projects'&&req.method==='GET')return json(200,store?{projects:await store.list()}:{projects:[]});
   if(path==='/api/projects'||path==='/api/workspace'){
    if(req.method==='GET'){
     if(!store)return json(200,{mode:'local'});
     const current=await store.read(project);
     return current?json(200,{mode:'cloud',...current,authRequired:!publicMode}):json(404,{error:'Project not found.'});
    }
    if(!store||!(path==='/api/projects'?req.method==='POST':req.method==='PUT'))return json(405,{error:'Method not allowed.'});
    if(!allowedWrite(req.headers,origin))return json(403,{error:'Invalid request origin or content type.'});
    if(Number(req.headers['content-length'])>MAX){res.setHeader('Connection','close');return json(413,{error:'Workspace exceeds 10 MB.'});}
    let n=0;const chunks=[];
    for await(const chunk of req){n+=chunk.length;if(n>MAX){res.destroy();return;}chunks.push(chunk);}
    let body,workspace;
    try{
     body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
     if(path==='/api/projects'){
      if(typeof body.name!=='string'||!body.name.trim()||body.name.length>120)throw Error('Invalid project name.');
      if((await store.list()).length>=100)throw Error('Project limit reached.');
      const id=randomUUID();await store.create(id,body.name.trim());return json(201,{id});
     }
     if(body.operation){
      const current=await store.read(project);
      if(!current)return json(404,{error:'Project not found.'});
      if(current.revision!==body.revision)return json(409,{error:'Workspace changed on another device. Reload and retry.'});
      workspace=applyOperation(current.workspace,body.operation);
      workspace=validateSave({revision:body.revision,workspace});
     }else workspace=validateSave(body);
    }catch(e){return json(400,{error:e.message});}
    const revision=await store.write(body.revision,workspace,project,body.operation?.kind||'import');
    if(revision===null)return json(409,{error:'Workspace changed on another device. Back up unsaved work if needed, reload and retry.'});
    return json(200,{revision,workspace});
   }
   if(!['GET','HEAD'].includes(req.method)||!Object.hasOwn(files,path))return json(404,{error:'Not found.'});
   const data=await readFile(new URL(files[path],root));
   res.writeHead(200,{...headers,'Content-Type':mime[files[path].split('.').pop()]});
   res.end(req.method==='HEAD'?undefined:data);
  }catch(e){console.error('Request failed:',e.code||e.name);if(!res.headersSent)json(503,{error:'Service temporarily unavailable.'});else res.end();}
 });
}
export async function start(){
 const cloud=Boolean(process.env.DATABASE_URL)||process.env.NODE_ENV==='production'||process.env.RENDER==='true';
 let store=null,user='',password='',origin='';
 const authMode=process.env.AUTH_MODE??'password';
 if(!['password','none'].includes(authMode))throw new Error('CONFIG_AUTH_MODE_INVALID');
 const publicMode=cloud&&authMode==='none';
 if(cloud){
  user=process.env.APP_USERNAME||'owner';password=process.env.APP_PASSWORD||'';
  if(!process.env.DATABASE_URL?.trim())throw new Error('CONFIG_DATABASE_URL_MISSING');
  if(!publicMode&&(password.length<24||password.length>512))throw new Error('CONFIG_APP_PASSWORD_LENGTH');
  if(!publicMode&&(user.includes(':')||user.length>128))throw new Error('CONFIG_APP_USERNAME_INVALID');
  let db;
  try{db=new URL(process.env.DATABASE_URL.trim());}catch{throw new Error('CONFIG_DATABASE_URL_INVALID');}
  if(!['postgres:','postgresql:'].includes(db.protocol)||!db.hostname||!db.username||db.pathname.length<2)throw new Error('CONFIG_DATABASE_URL_INVALID');
  let u;
  try{u=new URL(process.env.APP_ORIGIN||process.env.RENDER_EXTERNAL_URL||'');}catch{throw new Error('CONFIG_APP_ORIGIN_INVALID');}
  if(u.protocol!=='https:'||u.username||u.password)throw new Error('CONFIG_APP_ORIGIN_INVALID');
  origin=u.origin;
  if(publicMode)console.warn('PUBLIC MODE: anonymous visitors can read and change all workspaces. Use synthetic or non-sensitive data only.');
  console.log('Cloud configuration validated; connecting to PostgreSQL.');
  try{store=await createStore(process.env.DATABASE_URL.trim());}catch(e){
   const known=new Set(['28P01','28000','3D000','42501','53300','57P03','ECONNREFUSED','ETIMEDOUT','ENOTFOUND','EAI_AGAIN','ECONNRESET','CERT_HAS_EXPIRED','SELF_SIGNED_CERT_IN_CHAIN','UNABLE_TO_VERIFY_LEAF_SIGNATURE','ERR_TLS_CERT_ALTNAME_INVALID','ERR_MODULE_NOT_FOUND']);
   const code=known.has(e?.code)?e.code:'UNKNOWN';
   throw new Error('DATABASE_STARTUP_'+code);
  }
  console.log('PostgreSQL initialization complete.');
 }
 const server=buildServer({store,user,password,origin,sessionMode:cloud&&!publicMode,publicMode});
 const port=Number(process.env.PORT||4173);
 server.listen(port,cloud?'0.0.0.0':'127.0.0.1',()=>console.log('Requirement Studio listening on port '+port+' ('+(cloud?'cloud':'local')+')'));
 for(const sig of ['SIGINT','SIGTERM'])process.once(sig,()=>{server.close(async()=>{if(store)await store.close();process.exit(0);});});
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))start().catch(e=>{const msg=typeof e?.message==='string'&&/^(CONFIG_|DATABASE_STARTUP_)[A-Z0-9_]+$/.test(e.message)?e.message:'UNEXPECTED_STARTUP_ERROR';console.error('Startup failed:',msg);process.exitCode=1;});
