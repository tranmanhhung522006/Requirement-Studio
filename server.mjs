import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {authorize,allowedWrite,validateSave,createStore} from './src/cloud.mjs';
const root=new URL('.',import.meta.url);
const files={'/':'index.html','/index.html':'index.html','/src/app.mjs':'src/app.mjs','/src/core.mjs':'src/core.mjs','/src/styles.css':'src/styles.css'};
const mime={html:'text/html; charset=utf-8',mjs:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8'};
const MAX=10*1024*1024;
export function buildServer({store=null,user='',password='',origin=''}={}){
 return createServer(async(req,res)=>{
  const path=String(req.url).split('?')[0];
  const headers={'X-Content-Type-Options':'nosniff','Cache-Control':'no-store','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"};
  if(store)headers['Strict-Transport-Security']='max-age=31536000';
  const json=(status,data,extra={})=>{res.writeHead(status,{...headers,'Content-Type':'application/json; charset=utf-8',...extra});res.end(JSON.stringify(data));};
  try{
   if(path==='/healthz'&&req.method==='GET'){
    if(store)await store.health();
    return json(200,{ok:true});
   }
   if(store&&!authorize(req.headers.authorization,user,password))return json(401,{error:'Authentication required.'},{'WWW-Authenticate':'Basic realm="Requirement Studio", charset="UTF-8"'});
   if(path==='/api/workspace'){
    if(req.method==='GET')return json(200,store?{mode:'cloud',...await store.read()}:{mode:'local'});
    if(!store||req.method!=='PUT')return json(405,{error:'Method not allowed.'});
    if(!allowedWrite(req.headers,origin))return json(403,{error:'Invalid request origin or content type.'});
    if(Number(req.headers['content-length'])>MAX){res.setHeader('Connection','close');return json(413,{error:'Workspace exceeds 10 MB.'});}
    let n=0;const chunks=[];
    for await(const chunk of req){n+=chunk.length;if(n>MAX){res.destroy();return;}chunks.push(chunk);}
    let body,workspace;
    try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));workspace=validateSave(body);}catch(e){return json(400,{error:e.message});}
    const revision=await store.write(body.revision,workspace);
    if(revision===null)return json(409,{error:'Workspace changed on another device. Back up unsaved work if needed, reload and retry.'});
    return json(200,{revision});
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
 if(cloud){
  user=process.env.APP_USERNAME||'owner';password=process.env.APP_PASSWORD||'';
  if(!process.env.DATABASE_URL||password.length<24||user.includes(':'))throw Error('Cloud mode requires DATABASE_URL and APP_PASSWORD (24+ characters).');
  const u=new URL(process.env.APP_ORIGIN||process.env.RENDER_EXTERNAL_URL||'');
  if(u.protocol!=='https:')throw Error('Cloud mode requires an HTTPS origin.');
  origin=u.origin;store=await createStore(process.env.DATABASE_URL);
 }
 const server=buildServer({store,user,password,origin});
 const port=Number(process.env.PORT||4173);
 server.listen(port,cloud?'0.0.0.0':'127.0.0.1',()=>console.log('Requirement Studio listening on port '+port+' ('+(cloud?'cloud':'local')+')'));
 for(const sig of ['SIGINT','SIGTERM'])process.once(sig,()=>{server.close(async()=>{if(store)await store.close();process.exit(0);});});
}
if(process.argv[1]&&new URL('file://'+process.argv[1]).href===import.meta.url)start().catch(e=>{console.error('Startup failed:',e.code||e.name);process.exitCode=1;});
