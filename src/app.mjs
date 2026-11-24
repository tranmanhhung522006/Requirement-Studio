import {TYPES,PARENTS,STATUS,SOURCES,PRIORITIES,empty,validateWorkspace,newItem,saveItem,inspect,issues,matrix,descendants,csv,demo} from './core.mjs';
const $=id=>document.getElementById(id);
const KEY='requirement-studio:v1';
let w=empty('Untitled workspace'), view='register', query='', typeFilter='', statusFilter='', editing=null, storageReady=true;
function notice(t=''){ $('notice').textContent=t; }
let cloud=false, revision=0, busy=false;
async function api(method='GET',body){
 const response=await fetch('/api/workspace',{method,cache:'no-store',credentials:'same-origin',headers:body?{'Content-Type':'application/json','X-Workspace-Request':'1'}:{},body:body?JSON.stringify(body):undefined});
 if(!response.ok){let message='Server request failed ('+response.status+').';try{message=(await response.json()).error||message;}catch{}throw Error(message);}
 return response.json();
}
try {
 const initial=await api();
 if(initial.mode==='cloud'){
  cloud=true;w=validateWorkspace(initial.workspace);revision=initial.revision;
  document.querySelector('.sidefoot').textContent='Cloud workspace · Neon PostgreSQL';
 } else if(initial.mode==='local'){
  try{const raw=localStorage.getItem(KEY);if(raw)w=validateWorkspace(JSON.parse(raw));}
  catch(e){storageReady=false;notice('Could not read local data. Recover your backup before replacing it. '+e.message);}
 } else throw Error('Unknown storage mode.');
}catch(e){
 notice('Workspace could not load. Reload to retry. No changes were made. '+e.message);
 document.querySelectorAll('button,input,select').forEach(el=>el.disabled=true);
 throw e;
}
async function commit(next,{replace=false}={}) {
 validateWorkspace(next);
 if(busy)throw Error('A save is already in progress.');
 if(!storageReady&&!replace) throw Error('Storage recovery required. Reload or import a valid backup.');
 busy=true;
 try{
  if(cloud){
   const result=await api('PUT',{workspace:next,revision});
   revision=result.revision;
  }else localStorage.setItem(KEY,JSON.stringify(next));
  storageReady=true;w=next;
  $('project').value=w.name;
  render();
 }finally{busy=false;}
}
async function run(fn){try{await fn();}catch(e){notice(e.message);}}
function node(tag,text='',cls=''){const el=document.createElement(tag);if(text!=='')el.textContent=text;if(cls)el.className=cls;return el;}
function button(label,action,cls=''){const b=node('button',label,cls);b.type='button';b.addEventListener('click',action);return b;}
function select(values,selected=''){const s=node('select');for(const [value,label] of values){const o=node('option',label);o.value=value;o.selected=value===selected;s.append(o);}return s;}
const pairs=arr=>arr.map(x=>[x,x]);
function heading(title,subtitle){const c=$('content');c.replaceChildren(node('h1',title),node('p',subtitle,'muted'));return c;}
function table(headers,rows,emptyText='No records.'){const wrap=node('div','','table-wrap');const t=node('table'),head=node('thead'),tr=node('tr');for(const h of headers){const th=node('th',h);th.scope='col';tr.append(th);}head.append(tr);t.append(head);const body=node('tbody');for(const row of rows){const r=node('tr');for(const v of row){const d=node('td');if(v instanceof Node)d.append(v);else d.textContent=String(v??'');r.append(d);}body.append(r);}if(!rows.length){const r=node('tr'),d=node('td',emptyText,'empty');d.colSpan=headers.length;r.append(d);body.append(r);}t.append(body);wrap.append(t);return wrap;}
function ref(id,label=id){return button(label,()=>openEditor(id),'link');}
function refs(ids){const d=node('div');if(!ids.length)d.textContent='—';ids.forEach((id,i)=>{if(i)d.append(document.createTextNode(', '));d.append(ref(id));});return d;}
function status(x){return node('span',x.status,'status '+x.status);}
function download(name,text,mime){const url=URL.createObjectURL(new Blob([text],{type:mime}));const a=node('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function exportRegister(){download('requirements.csv','\uFEFF'+csv([['ID','Type','Title','Specification','Owner','Source','Source reference','Verification','Priority','Status','Upstream','Version'],...w.items.map(x=>[x.id,TYPES[x.type],x.title,x.description,x.owner,x.source,x.sourceRef,x.verification,x.priority,x.status,x.parents.join('; '),x.version])]),'text/csv;charset=utf-8');}
function exportMatrix(){download('traceability.csv','\uFEFF'+csv([['ID','Title','Upstream','Stories','Criteria','Tests','Approved AC and TC linked'],...matrix(w).map(x=>[x.id,x.title,x.upstream.join('; '),x.stories.join('; '),x.criteria.join('; '),x.tests.join('; '),x.covered?'Yes':'No'])]),'text/csv;charset=utf-8');}
function register(){
 const c=heading('Requirements','Maintain a structured register of business needs, specifications and verification artifacts.');
 const active=w.items.filter(x=>x.status!=='Retired'),m=matrix(w),q=issues(w);
 const metrics=node('div','','metrics');
 for(const [n,v] of [['Active artifacts',active.length],['Approved',active.filter(x=>x.status==='Approved').length],['Quality errors',q.filter(x=>x.level==='error').length],['Approved AC & TC linked',m.length?Math.round(m.filter(x=>x.covered).length/m.length*100)+'%':'—']]){const d=node('div','','metric');d.append(node('strong',String(v)),node('span',n));metrics.append(d);}c.append(metrics);
 const bar=node('div','','toolbar no-print'), search=node('input');search.type='search';search.placeholder='Search ID, title, description or owner';search.setAttribute('aria-label','Search requirements');search.value=query;
 const types=select([['','All types'],...Object.entries(TYPES)],typeFilter);types.setAttribute('aria-label','Filter type');
 const states=select([['','All statuses'],...pairs(STATUS)],statusFilter);states.setAttribute('aria-label','Filter status');
 const create=select(Object.entries(TYPES),'FR');create.setAttribute('aria-label','New artifact type');
 bar.append(search,types,states,button('Export CSV',exportRegister),create,button('New artifact',()=>openEditor(null,create.value),'primary'));c.append(bar);
 const area=node('div');c.append(area);
 function update(){const items=w.items.filter(x=>(!typeFilter||x.type===typeFilter)&&(!statusFilter||x.status===statusFilter)&&[x.id,x.title,x.description,x.owner].join(' ').toLowerCase().includes(query.toLowerCase()));
 area.replaceChildren(node('small',items.length+' of '+w.items.length+' artifacts'),table(['ID','Title','Priority','Status','Owner','Version','Upstream'],items.map(x=>[ref(x.id),x.title||'Untitled',x.priority,status(x),x.owner||'—','v'+x.version,refs(x.parents)]),'No matching artifacts.'));}
 search.addEventListener('input',()=>{query=search.value;update();});types.addEventListener('change',()=>{typeFilter=types.value;update();});states.addEventListener('change',()=>{statusFilter=states.value;update();});update();
}
function trace(){
 const c=heading('Traceability matrix','Inspect downstream coverage and follow links to the source artifacts.');
 const bar=node('div','','toolbar no-print');bar.append(button('Export RTM CSV',exportMatrix));c.append(bar);
 const rows=matrix(w);c.append(table(['Requirement','Title','Upstream','User stories','Acceptance criteria','Test cases','Approved AC & TC linked'],rows.map(x=>[ref(x.id),x.title,refs(x.upstream),refs(x.stories),refs(x.criteria),refs(x.tests),x.covered?'Yes':'Gap'])));
 c.append(node('p','Coverage indicates the existence of at least one approved acceptance criterion and one approved test case downstream. It does not indicate test execution, complete coverage or UAT success.','muted'));
}
function quality(){
 const c=heading('Quality review','Deterministic checks for completeness, source evidence, traceability and potentially ambiguous wording.');
 const all=issues(w);c.append(table(['Artifact','Rule','Severity','Finding'],all.map(x=>[ref(x.id),x.code,node('span',x.level,x.level),x.message]),'No findings in the current register.'));
 c.append(node('p','Errors block approval. Warnings require analyst judgment. These local rules are not a certification of compliance or a substitute for stakeholder review.','muted'));
}
function history(){
 const c=heading('Version history','Review recorded snapshots and changes, including automatic downstream review resets.');
 const rows=[...w.history].reverse().map(h=>{const d=node('details'),s=node('summary','View snapshot'),p=node('pre',JSON.stringify(h.snapshot,null,2));d.append(s,p);return [h.id,'v'+h.snapshot.version,new Date(h.at).toLocaleString(),h.action,d];});
 c.append(table(['Artifact','Version','Recorded at','Change','Snapshot'],rows,'No changes recorded.'));
}
function report(){
 const c=heading('Specification','Print a clean A4 specification using Times New Roman. Final output contains approved artifacts only.');
 const active=w.items.filter(x=>x.status!=='Retired'), blockers=active.filter(x=>x.status!=='Approved'||inspect(w,x).some(i=>i.level==='error'));
 const tools=node('div','','toolbar no-print');const print=button('Print / Save PDF',()=>window.print(),'primary');const final=button('Export approved Markdown',()=>download('specification.md',markdown(),'text/markdown;charset=utf-8'));
 print.disabled=final.disabled=Boolean(blockers.length)||!active.length;
 tools.append(print,final);c.append(tools);
 if(blockers.length)c.append(node('p',blockers.length+' active artifact(s) need approval or correction before final export. Preview below is not final.','warning no-print'));
 const doc=node('div','','document');doc.append(node('h2',w.name+' — Requirements specification'),node('p',blockers.length?'DRAFT — Not approved for final export':'Approved artifact register'));
 for(const [type,label] of Object.entries(TYPES)){const arr=active.filter(x=>x.type===type);if(!arr.length)continue;doc.append(node('h3',label));for(const x of arr){const art=node('article');art.append(node('h3',x.id+' — '+x.title),node('p',x.description),node('p','Owner: '+x.owner+' | Priority: '+x.priority+' | Status: '+x.status+' | v'+x.version),node('p','Source: '+x.source+' — '+x.sourceRef),node('p','Upstream: '+(x.parents.join(', ')||'—')),node('p','Verification: '+(x.verification||'—')));doc.append(art);}}
 c.append(doc);
}
function markdown(){const safe=s=>String(s).replace(/[\\`*_{}\[\]<>#|]/g,'\\$&');return '# '+safe(w.name)+' — Requirements specification\n\n'+w.items.filter(x=>x.status==='Approved').map(x=>'## '+x.id+' — '+safe(x.title)+'\n\n'+safe(x.description)+'\n\nOwner: '+safe(x.owner)+'  \nPriority: '+x.priority+'  \nVersion: '+x.version+'  \nSource: '+safe(x.sourceRef)+'  \nUpstream: '+x.parents.join(', ')+'  \nVerification: '+safe(x.verification)).join('\n\n');}
function render(){({register,trace,quality,history,report}[view])();}
function openEditor(id,type='FR'){
 if(busy){notice('A save is in progress.');return;}
 editing=id?w.items.find(x=>x.id===id):newItem(w,type);if(!editing)return;
 const x=editing;const isExisting=!!id;
 $('record-id').textContent=x.id+' · '+TYPES[x.type]+' · v'+x.version;$('editor-title').textContent=isExisting?'Edit artifact':'New artifact';$('form-error').textContent='';
 const fields=node('div','','fields');
 function field(key,label,control,wide=false){const l=node('label','','field'+(wide?' wide':''));l.append(node('span',label),control);control.name=key;fields.append(l);return control;}
 function input(key,label,wide=false){const el=node('input');el.value=x[key];return field(key,label,el,wide);}
 function area(key,label){const el=node('textarea');el.value=x[key];return field(key,label,el,true);}
 input('title','Title',true);area('description','Specification / expected behavior');input('owner','Accountable owner');
 field('priority','MoSCoW priority',select(pairs(PRIORITIES),x.priority));
 field('source','Source classification',select(pairs(SOURCES),x.source));
 input('sourceRef','Evidence reference (document / stakeholder)');
 area('verification','Verification method / observable result');
 field('status','Lifecycle status',select(pairs(STATUS),x.status==='Approved'?'In review':x.status));
 const up=node('div','','field wide');up.append(node('span','Upstream artifacts'));const group=node('div','','upstream');
 for(const p of w.items.filter(y=>PARENTS[x.type].includes(y.type))){const l=node('label'),check=node('input');check.type='checkbox';check.name='parents';check.value=p.id;check.checked=x.parents.includes(p.id);l.append(check,node('span',p.id+' — '+p.title+' ('+p.status+')'));group.append(l);}
 if(!group.children.length)group.append(node('small',PARENTS[x.type].length?'Create an upstream '+PARENTS[x.type].join(' / ')+' first.':'No upstream required.'));
 up.append(group);fields.append(up);
 if(isExisting){const affected=descendants(w,x.id);fields.append(node('p',affected.length+' downstream artifact(s) may be affected. Saving changes returns approved descendants to In review.','muted wide'));}
 $('form-fields').replaceChildren(fields);$('editor').showModal();
}
$('form').addEventListener('submit',async e=>{e.preventDefault();const d=new FormData(e.target);const x={...editing};for(const key of ['title','description','owner','priority','source','sourceRef','verification','status'])x[key]=String(d.get(key)||'').trim();x.parents=d.getAll('parents');try{await commit(saveItem(w,x));$('editor').close();notice(x.id+' saved.');}catch(err){$('form-error').textContent=err.message;}});
for(const id of ['close','cancel'])$(id).addEventListener('click',()=>$('editor').close());
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{view=b.dataset.view;document.querySelectorAll('[data-view]').forEach(y=>y.removeAttribute('aria-current'));b.setAttribute('aria-current','page');render();}));
$('project').value=w.name;
$('project').addEventListener('change',()=>run(async()=>{const name=$('project').value.trim();if(!name)throw Error('Workspace name cannot be empty.');await commit({...w,name});notice('Workspace renamed.');}));
$('sample').addEventListener('click',()=>run(async()=>{if(!confirm('Replace this workspace with synthetic sample data? Export a backup first if needed.'))return;await commit(demo(),{replace:true});notice('Synthetic sample loaded. This is not real stakeholder evidence.');}));
$('reset').addEventListener('click',()=>run(async()=>{if(!confirm('Replace this workspace with an empty workspace? Back up your current data first.'))return;await commit(empty('Untitled workspace'),{replace:true});notice('New workspace created.');}));
$('backup').addEventListener('click',()=>run(async()=>{const raw=storageReady?JSON.stringify(w,null,2):localStorage.getItem(KEY);download('requirement-studio-backup.json',raw||JSON.stringify(w,null,2),'application/json');}));
$('import').addEventListener('click',()=>$('file').click());
$('file').addEventListener('change',async()=>{const f=$('file').files[0];$('file').value='';if(!f)return;try{if(f.size>10*1024*1024)throw Error('Backup exceeds 10 MB.');const next=validateWorkspace(JSON.parse(await f.text()));if(!confirm('Replace this workspace with '+next.name+'?'))return;await commit(next,{replace:true});notice('Backup imported.');}catch(e){notice('Import failed: '+e.message);}});
window.addEventListener('storage',e=>{if(!cloud&&e.key===KEY){storageReady=false;notice('This workspace changed in another tab. Reload before making changes to avoid overwriting data.');}});
render();
