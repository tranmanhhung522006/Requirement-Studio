import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
const root=new URL('.',import.meta.url);
const files={'/':'index.html','/index.html':'index.html','/src/app.mjs':'src/app.mjs','/src/core.mjs':'src/core.mjs','/src/styles.css':'src/styles.css'};
const mime={html:'text/html; charset=utf-8',mjs:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8'};
createServer(async(req,res)=>{
 const path=String(req.url).split('?')[0];
 if (!['GET','HEAD'].includes(req.method)||!Object.hasOwn(files,path)) {res.writeHead(404);res.end('Not found');return;}
 try {const data=await readFile(new URL(files[path],root));res.writeHead(200,{'Content-Type':mime[files[path].split('.').pop()],'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:data);}
 catch {res.writeHead(500);res.end('Unable to read file');}
}).listen(4173,'127.0.0.1',()=>console.log('Requirement Studio: http://127.0.0.1:4173'));
