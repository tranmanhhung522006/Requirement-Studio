import {createHash,timingSafeEqual} from 'node:crypto';
import {empty,validateWorkspace,inspect} from './core.mjs';
const digest=s=>createHash('sha256').update(s).digest();
export function authorize(header,user,password){
 if(typeof header!=='string'||!header.startsWith('Basic ')||header.length>4096)return false;
 const encoded=header.slice(6);
 if(!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))return false;
 return timingSafeEqual(digest(Buffer.from(encoded,'base64')),digest(user+':'+password));
}
export function allowedWrite(headers,origin){
 return headers.origin===origin&&headers['x-workspace-request']==='1'&&/^application\/json(?:\s*;|$)/i.test(headers['content-type']||'');
}
export function validateSave(body){
 if(!body||!Number.isSafeInteger(body.revision)||body.revision<0||body.revision>=Number.MAX_SAFE_INTEGER)throw Error('Invalid revision.');
 const w=validateWorkspace(body.workspace);
 if(w.items.length>5000||w.history.length>30000)throw Error('Workspace exceeds personal deployment limits.');
 if(w.items.some(x=>x.status==='Approved'&&inspect(w,x).some(i=>i.level==='error')))throw Error('Approved records contain validation errors.');
 return w;
}
export async function createStore(connectionString){
 const url=new URL(connectionString);
 if(!['postgres:','postgresql:'].includes(url.protocol))throw Error('Invalid DATABASE_URL protocol.');
 // Force certificate and hostname verification; discard URL SSL options that override the explicit TLS configuration.
 for(const k of ['sslmode','sslcert','sslkey','sslrootcert','ssl','uselibpqcompat'])url.searchParams.delete(k);
 const {default:pg}=await import('pg');
 const pool=new pg.Pool({connectionString:url.toString(),ssl:{rejectUnauthorized:true},max:3,connectionTimeoutMillis:10000,idleTimeoutMillis:10000,statement_timeout:15000});
 pool.on('error',()=>console.error('Idle database connection failed.'));
 try{
  await pool.query('CREATE TABLE IF NOT EXISTS requirement_studio_workspace (id integer PRIMARY KEY CHECK (id=1), revision bigint NOT NULL DEFAULT 0, document jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())');
  await pool.query('INSERT INTO requirement_studio_workspace (id,document) VALUES (1,$1::jsonb) ON CONFLICT (id) DO NOTHING',[JSON.stringify(empty('Untitled workspace'))]);
 }catch(e){await pool.end();throw e;}
 return {
  async read(){const {rows}=await pool.query('SELECT revision,document FROM requirement_studio_workspace WHERE id=1');return {revision:Number(rows[0].revision),workspace:rows[0].document};},
  async write(revision,workspace){const {rows}=await pool.query('UPDATE requirement_studio_workspace SET document=$1::jsonb, revision=revision+1,updated_at=now() WHERE id=1 AND revision=$2 RETURNING revision',[JSON.stringify(workspace),revision]);return rows.length?Number(rows[0].revision):null;},
  async health(){await pool.query('SELECT 1');},
  close:()=>pool.end()
 };
}
