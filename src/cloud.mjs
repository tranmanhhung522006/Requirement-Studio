import {createHash,timingSafeEqual} from 'node:crypto';
import {empty,validateWorkspace,inspect,upgrade,saveItem,governance} from './core.mjs';
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
 const w=upgrade(validateWorkspace(body.workspace));
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
  await pool.query('CREATE TABLE IF NOT EXISTS rs_projects (id text PRIMARY KEY, revision bigint NOT NULL DEFAULT 0, document jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())');
  await pool.query("INSERT INTO rs_projects (id,revision,document) SELECT 'default',revision,document FROM requirement_studio_workspace WHERE id=1 ON CONFLICT (id) DO NOTHING");
  await pool.query('CREATE TABLE IF NOT EXISTS rs_project_events (seq bigserial PRIMARY KEY, project_id text NOT NULL REFERENCES rs_projects(id), revision bigint NOT NULL, operation text NOT NULL, at timestamptz NOT NULL DEFAULT now())');
 }catch(e){await pool.end();throw e;}
 return {
  async list(){const {rows}=await pool.query("SELECT id,document->>'name' AS name FROM rs_projects ORDER BY updated_at DESC,id");return rows;},
  async create(id,name){await pool.query('INSERT INTO rs_projects(id,document) VALUES($1,$2::jsonb)',[id,JSON.stringify(empty(name))]);},
  async read(id='default'){const {rows}=await pool.query('SELECT revision,document FROM rs_projects WHERE id=$1',[id]);return rows.length?{revision:Number(rows[0].revision),workspace:upgrade(rows[0].document)}:null;},
  async write(revision,workspace,id='default',operation='import'){
   const {rows}=await pool.query('WITH changed AS (UPDATE rs_projects SET document=$1::jsonb,revision=revision+1,updated_at=now() WHERE id=$3 AND revision=$2 RETURNING id,revision), logged AS (INSERT INTO rs_project_events(project_id,revision,operation) SELECT id,revision,$4 FROM changed) SELECT revision FROM changed',[JSON.stringify(workspace),revision,id,operation]);return rows.length?Number(rows[0].revision):null;
  },
  async health(){await pool.query('SELECT 1');},
  close:()=>pool.end()
 };
}

export function applyOperation(current,op){
 if(!op||typeof op.kind!=='string')throw Error('Invalid operation.');
 if(op.kind==='save'){
  const old=current.items.find(x=>x.id===op.record?.id);
  if(old?.status==='Approved')throw Error('Use an accepted change request to reopen an approved artifact.');
  return saveItem(current,op.record);
 }
 if(op.kind==='rename'){
  if(typeof op.name!=='string'||!op.name.trim()||op.name.length>120)throw Error('Invalid project name.');
  return {...current,name:op.name.trim()};
 }
 return governance(current,op);
}
