import {rice,ice,reviewSuggestions,uatSummary} from './analysis-tools.mjs';
import {diagramView} from './diagram-ui.mjs';
import {t,setLanguage,language,translateStatic,qualityMessage} from './i18n.mjs';
import {professionalView,structuredFields} from './professional.mjs';
import {exportDocument} from './export.mjs';
import {upgrade,governance,FIELDS,latestRun,compareVersions,TYPES,PARENTS,STATUS,SOURCES,PRIORITIES,empty,validateWorkspace,newItem,saveItem,inspect,issues,matrix,descendants,csv,demo} from './core.mjs';
const $=id=>document.getElementById(id);
const KEY='requirement-studio:v1';
let w=empty('Untitled workspace'), view='register', query='', typeFilter='', statusFilter='', editing=null, storageReady=true;
function notice(message=''){ $('notice').textContent=t(message); }
let cloud=false, revision=0, busy=false, projectId='default', projects=[];
const PROJECTS='requirement-studio:projects:v1';
const localKey=()=>projectId==='default'?KEY:KEY+':'+projectId;
const projectUrl=()=>'/api/workspace?project='+encodeURIComponent(projectId);
function readLocalProjects(){return JSON.parse(localStorage.getItem(PROJECTS)||'[{"id":"default","name":"Default project"}]');}

async function api(method='GET',body,path=projectUrl()){
 const response=await fetch(path,{method,cache:'no-store',credentials:'same-origin',headers:body?{'Content-Type':'application/json','X-Workspace-Request':'1'}:{},body:body?JSON.stringify(body):undefined});
 if(response.status===401&&cloud){location.assign('/login.html');throw Error('Session expired.');}
 if(!response.ok){let message='Server request failed ('+response.status+').';try{message=(await response.json()).error||message;}catch{}throw Error(message);}
 return response.json();
}
try {
 const initial=await api();
 if(initial.mode==='cloud'){
  cloud=true;$('logout').hidden=false;w=upgrade(validateWorkspace(initial.workspace));revision=initial.revision;projects=(await api('GET',undefined,'/api/projects')).projects;
  document.querySelector('.sidefoot').textContent='Cloud workspace · Neon PostgreSQL';
 } else if(initial.mode==='local'){
  try{const raw=localStorage.getItem(KEY);if(raw)w=upgrade(validateWorkspace(JSON.parse(raw)));projects=readLocalProjects();projects=projects.map(p=>p.id==='default'?{...p,name:w.name}:p);}
  catch(e){storageReady=false;notice('Could not read local data. Recover your backup before replacing it. '+e.message);}
 } else throw Error('Unknown storage mode.');
}catch(e){
 notice('Workspace could not load. Reload to retry. No changes were made. '+e.message);
 document.querySelectorAll('button,input,select').forEach(el=>el.disabled=true);
 throw e;
}
async function commit(next,{replace=false,operation=null}={}) {
 validateWorkspace(next);
 if(busy)throw Error('A save is already in progress.');
 if(!storageReady&&!replace) throw Error('Storage recovery required. Reload or import a valid backup.');
 busy=true;
 try{
  if(cloud){
   const result=await api('PUT',operation?{operation,revision}:{workspace:next,revision});
   revision=result.revision;next=upgrade(result.workspace);
  }else localStorage.setItem(localKey(),JSON.stringify(next));
  storageReady=true;w=upgrade(next);projects=projects.map(p=>p.id===projectId?{...p,name:w.name}:p);if(!cloud){try{localStorage.setItem(PROJECTS,JSON.stringify(projects));}catch{notice('Project saved; project list metadata could not be updated.');}}refreshProjects();
  $('project').value=w.name;
  render();
 }finally{busy=false;}
}
async function run(fn){try{await fn();}catch(e){notice(e.message);}}
function node(tag,text='',cls=''){const el=document.createElement(tag);if(text!=='')el.textContent=text;if(cls)el.className=cls;return el;}
function button(label,action,cls=''){const b=node('button',cls==='link'?label:t(label),cls);b.type='button';b.addEventListener('click',action);return b;}
function select(values,selected=''){const s=node('select');for(const [value,label] of values){const o=node('option',t(label));o.value=value;o.selected=value===selected;s.append(o);}return s;}
const pairs=arr=>arr.map(x=>[x,x]);
function heading(title,subtitle){const c=$('content');c.replaceChildren(node('h1',t(title)),node('p',t(subtitle),'muted'));return c;}
function table(headers,rows,emptyText='No records.'){const wrap=node('div','','table-wrap');const t=node('table'),head=node('thead'),tr=node('tr');for(const h of headers){const th=node('th',t(h));th.scope='col';tr.append(th);}head.append(tr);t.append(head);const body=node('tbody');for(const row of rows){const r=node('tr');for(const v of row){const d=node('td');if(v instanceof Node)d.append(v);else d.textContent=String(v??'');r.append(d);}body.append(r);}if(!rows.length){const r=node('tr'),d=node('td',t(emptyText),'empty');d.colSpan=headers.length;r.append(d);body.append(r);}t.append(body);wrap.append(t);return wrap;}
function ref(id,label=id){return button(label,()=>openEditor(id),'link');}
function refs(ids){const d=node('div');if(!ids.length)d.textContent='—';ids.forEach((id,i)=>{if(i)d.append(document.createTextNode(', '));d.append(ref(id));});return d;}
function status(x){return node('span',t(x.status),'status '+x.status);}
function download(name,text,mime){const url=URL.createObjectURL(new Blob([text],{type:mime}));const a=node('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function exportRegister(){download('requirements.csv','\uFEFF'+csv([['ID','Type','Title','Specification','Owner','Source','Source reference','Verification','Priority','Status','Upstream','Version'],...w.items.map(x=>[x.id,TYPES[x.type],x.title,x.description,x.owner,x.source,x.sourceRef,x.verification,x.priority,x.status,x.parents.join('; '),x.version])]),'text/csv;charset=utf-8');}
function exportMatrix(){download('traceability.csv','\uFEFF'+csv([['ID','Title','Upstream','Stories','Criteria','Tests','Approved AC and TC linked'],...matrix(w).map(x=>[x.id,x.title,x.upstream.join('; '),x.stories.join('; '),x.criteria.join('; '),x.tests.join('; '),x.covered?'Yes':'No'])]),'text/csv;charset=utf-8');}
function register(){
 const c=heading('Requirements','Maintain a structured register of business needs, specifications and verification artifacts.');
 const active=w.items.filter(x=>x.status!=='Retired'),m=matrix(w),q=issues(w);
 const metrics=node('div','','metrics');
 for(const [n,v] of [['Active artifacts',active.length],['Approved',active.filter(x=>x.status==='Approved').length],['Quality errors',q.filter(x=>x.level==='error').length],['Approved AC & TC linked',m.length?Math.round(m.filter(x=>x.covered).length/m.length*100)+'%':'—']]){const d=node('div','','metric');d.append(node('strong',String(v)),node('span',t(n)));metrics.append(d);}c.append(metrics);
 const bar=node('div','','toolbar no-print'), search=node('input');search.type='search';search.placeholder=t('Search ID, title, description or owner');search.setAttribute('aria-label',t('Search requirements'));search.value=query;
 const types=select([['','All types'],...Object.entries(TYPES)],typeFilter);types.setAttribute('aria-label',t('Filter type'));
 const states=select([['','All statuses'],...pairs(STATUS)],statusFilter);states.setAttribute('aria-label',t('Filter status'));
 const create=select(Object.entries(TYPES),'FR');create.setAttribute('aria-label',t('New artifact type'));
 bar.append(search,types,states,button('Export CSV',exportRegister),create,button('New artifact',()=>openEditor(null,create.value),'primary'));c.append(bar);
 const area=node('div');c.append(area);
 function update(){const items=w.items.filter(x=>(!typeFilter||x.type===typeFilter)&&(!statusFilter||x.status===statusFilter)&&[x.id,x.title,x.description,x.owner].join(' ').toLowerCase().includes(query.toLowerCase()));
 area.replaceChildren(node('small',items.length+' / '+w.items.length+' '+t('artifacts')),table(['ID','Title','Priority','Status','Owner','Version','Upstream'],items.map(x=>[ref(x.id),x.title||t('Untitled'),t(x.priority),status(x),x.owner||'—','v'+x.version,refs(x.parents)]),'No matching artifacts.'));}
 search.addEventListener('input',()=>{query=search.value;update();});types.addEventListener('change',()=>{typeFilter=types.value;update();});states.addEventListener('change',()=>{statusFilter=states.value;update();});update();
}
function trace(){
 const c=heading('Traceability matrix','Inspect downstream coverage and follow links to the source artifacts.');
 const bar=node('div','','toolbar no-print');bar.append(button('Export RTM CSV',exportMatrix));c.append(bar);
 const rows=matrix(w);c.append(table(['Requirement','Title','Upstream','User stories','Acceptance criteria','Test cases','Approved AC & TC linked','Passed current tests'],rows.map(x=>[ref(x.id),x.title,refs(x.upstream),refs(x.stories),refs(x.criteria),refs(x.tests),t(x.covered?'Yes':'Gap'),refs(x.passed)])));
 c.append(node('p',t('Coverage requires an approved acceptance criterion linked to an approved test case. Passed tests are version-specific; this is not complete coverage or UAT success.'),'muted'));
}
function quality(){
 const c=heading('Quality review','Deterministic checks for completeness, source evidence, traceability and potentially ambiguous wording.');
 const all=issues(w);c.append(table(['Artifact','Rule','Severity','Finding'],all.map(x=>[ref(x.id),x.code,node('span',t(x.level),x.level),qualityMessage(x)]),'No findings in the current register.'));
 c.append(node('p',t('Errors block approval. Warnings require analyst judgment. These local rules are not a certification of compliance or a substitute for stakeholder review.'),'muted'));
}
function history(){
 const c=heading('Version history','Review recorded snapshots and changes, including automatic downstream review resets.');
 const rows=[...w.history].reverse().map(h=>{const d=node('details'),s=node('summary',t('View snapshot')),p=node('pre',JSON.stringify(h.snapshot,null,2));d.append(s,p);return [h.id,'v'+h.snapshot.version,new Date(h.at).toLocaleString(language()==='vi'?'vi-VN':'en-GB'),t(h.action),d];});
 c.append(table(['Artifact','Version','Recorded at','Change','Snapshot'],rows,'No changes recorded.'));
}
function report(){
 const c=heading('Specification','Print a clean A4 specification using Times New Roman. Final output contains approved artifacts only.');
 const active=w.items.filter(x=>x.status!=='Retired'), blockers=active.filter(x=>x.status!=='Approved'||inspect(w,x).some(i=>i.level==='error'));
 const tools=node('div','','toolbar no-print');const print=button('Print / Save PDF',()=>window.print(),'primary');const final=button('Export approved Markdown',()=>download('specification.md',markdown(),'text/markdown;charset=utf-8'));
 print.disabled=final.disabled=Boolean(blockers.length)||!active.length;
 const template=select([['BRD','BRD'],['FRD','FRD'],['SRS','SRS']],'SRS');template.setAttribute('aria-label','Document template');const word=button('Export DOCX',()=>run(async()=>exportDocument(w,'docx',language(),template.value)));const excel=button('Export XLSX',()=>run(async()=>exportDocument(w,'xlsx',language())));word.disabled=!active.length;tools.append(print,final,template,word,excel);c.append(tools);
 if(blockers.length)c.append(node('p',blockers.length+' '+t('active artifact(s) need approval or correction before final export. Preview below is not final.'),'warning no-print'));
 const doc=node('div','','document');doc.append(node('h2',w.name+' — '+t('Requirements specification')),node('p',t(blockers.length?'DRAFT — Not approved for final export':'Approved artifact register')));
 for(const [type,label] of Object.entries(TYPES)){const arr=active.filter(x=>x.type===type);if(!arr.length)continue;doc.append(node('h3',t(label)));for(const x of arr){const art=node('article');art.append(node('h3',x.id+' — '+x.title),node('p',x.description),node('p',t('Owner')+': '+x.owner+' | Priority: '+x.priority+' | Status: '+x.status+' | v'+x.version),node('p',t('Source')+': '+x.source+' — '+x.sourceRef),node('p',t('Upstream')+': '+(x.parents.join(', ')||'—')),node('p',t('Verification')+': '+(x.verification||'—')));doc.append(art);}}
 c.append(doc);
}
function markdown(){const safe=s=>String(s).replace(/[\\`*_{}\[\]<>#|]/g,'\\$&');return '# '+safe(w.name)+' — Requirements specification\n\n'+w.items.filter(x=>x.status==='Approved').map(x=>'## '+x.id+' — '+safe(x.title)+'\n\n'+safe(x.description)+'\n\nOwner: '+safe(x.owner)+'  \nPriority: '+x.priority+'  \nVersion: '+x.version+'  \nSource: '+safe(x.sourceRef)+'  \nUpstream: '+x.parents.join(', ')+'  \nVerification: '+safe(x.verification)).join('\n\n');}
function render(){
 translateStatic(cloud);$('logout').textContent=t('Sign out');
 const handlers={register,trace,quality,history,report,analysis:analysisView};
 if(handlers[view])handlers[view]();
 else if(view==='diagrams')diagramView(w,{heading,node,table,button,select,projectId,commit:async op=>{try{await commit(governance(w,op),{operation:op});notice('Saved.');return true;}catch(e){notice(e.message);return false;}}});
 else professionalView(view,w,{heading,node,table,button,select,refs,ref,commit:async op=>run(async()=>{await commit(governance(w,op),{operation:op});notice(t('Saved.'));})});
}
function refreshProjects(){
 $('projects').replaceChildren(...projects.map(p=>{const o=node('option',p.name);o.value=p.id;o.selected=p.id===projectId;return o;}));
}
async function switchProject(id){
 if(busy)throw Error('A save is in progress.');
 if($('editor').open)throw Error('Close the editor before switching projects.');
 busy=true;
 try{
  let next,rev=0;
  if(cloud){const result=await api('GET',undefined,'/api/workspace?project='+encodeURIComponent(id));next=upgrade(validateWorkspace(result.workspace));rev=result.revision;}
  else{const raw=localStorage.getItem(id==='default'?KEY:KEY+':'+id);next=raw?upgrade(validateWorkspace(JSON.parse(raw))):empty(projects.find(p=>p.id===id)?.name||'Untitled workspace');}
  projectId=id;w=next;revision=rev;storageReady=true;editing=null;query='';typeFilter='';statusFilter='';
  $('project').value=w.name;refreshProjects();render();notice('');
 }finally{busy=false;}
}
$('projects').addEventListener('change',()=>run(async()=>{try{await switchProject($('projects').value);}finally{refreshProjects();}}));
$('new-project').addEventListener('click',()=>run(async()=>{
 if(busy)throw Error('A save is in progress.');
 const name=prompt(t('Project name'));if(!name?.trim())return;if(name.trim().length>120)throw Error('Invalid project name.');
 let id;if(cloud){id=(await api('POST',{name:name.trim()},'/api/projects')).id;projects=(await api('GET',undefined,'/api/projects')).projects;}
 else{id=crypto.randomUUID();localStorage.setItem(KEY+':'+id,JSON.stringify(empty(name.trim())));projects=[...projects,{id,name:name.trim()}];localStorage.setItem(PROJECTS,JSON.stringify(projects));}
 await switchProject(id);
}));
$('language').value=language();
$('language').addEventListener('change',()=>{setLanguage($('language').value);render();});
refreshProjects();
$('logout').addEventListener('click',()=>run(async()=>{await api('POST',{},'/api/logout');location.assign('/login.html');}));

function openEditor(id,type='FR'){
 if(busy){notice('A save is in progress.');return;}
 editing=id?w.items.find(x=>x.id===id):newItem(w,type);if(!editing)return;
 const x=editing;const isExisting=!!id;
 $('record-id').textContent=x.id+' · '+t(TYPES[x.type])+' · v'+x.version;$('editor-title').textContent=t(isExisting?'Edit artifact':'New artifact');$('form-error').textContent='';
 const fields=node('div','','fields');
 function field(key,label,control,wide=false){const l=node('label','','field'+(wide?' wide':''));l.append(node('span',t(label)),control);control.name=key;fields.append(l);return control;}
 function input(key,label,wide=false){const el=node('input');el.value=x[key];return field(key,label,el,wide);}
 function area(key,label){const el=node('textarea');el.value=x[key];return field(key,label,el,true);}
 input('title','Title',true);area('description','Specification / expected behavior');structuredFields(x,field,node);input('owner','Accountable owner');
 field('priority','MoSCoW priority',select(pairs(PRIORITIES),x.priority));
 field('source','Source classification',select(pairs(SOURCES),x.source));
 input('sourceRef','Evidence reference (document / stakeholder)');
 area('verification','Verification method / observable result');
 field('status','Lifecycle status',select(pairs(STATUS),x.status==='Approved'?'In review':x.status));
 const up=node('div','','field wide');up.append(node('span',t('Upstream artifacts')));const group=node('div','','upstream');
 for(const p of w.items.filter(y=>PARENTS[x.type].includes(y.type))){const l=node('label'),check=node('input');check.type='checkbox';check.name='parents';check.value=p.id;check.checked=x.parents.includes(p.id);l.append(check,node('span',p.id+' — '+p.title+' ('+t(p.status)+')'));group.append(l);}
 if(!group.children.length)group.append(node('small',PARENTS[x.type].length?'Create an upstream '+PARENTS[x.type].join(' / ')+' first.':'No upstream required.'));
 up.append(group);fields.append(up);
 if(isExisting){if(x.status==='Approved')fields.append(node('p',t('Approved artifacts must be reopened through Change control.'),'warning wide'));const affected=descendants(w,x.id);fields.append(node('p',affected.length+' downstream artifact(s) may be affected. Saving changes returns approved descendants to In review.','muted wide'));}
 $('form-fields').replaceChildren(fields);$('editor').showModal();
}
$('form').addEventListener('submit',async e=>{e.preventDefault();const d=new FormData(e.target);const x={...editing};for(const key of ['title','description','owner','priority','source','sourceRef','verification','status'])x[key]=String(d.get(key)||'').trim();x.parents=d.getAll('parents');x.details=Object.fromEntries((FIELDS[x.type]||[]).map(([key])=>[key,String(d.get('detail:'+key)||'').trim()]));try{if(editing.status==='Approved')throw Error(t('Approved artifacts must be reopened through Change control.'));await commit(saveItem(w,x),{operation:{kind:'save',record:x}});$('editor').close();notice(x.id+' saved.');}catch(err){$('form-error').textContent=err.message;}});
for(const id of ['close','cancel'])$(id).addEventListener('click',()=>$('editor').close());
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{view=b.dataset.view;document.querySelectorAll('[data-view]').forEach(y=>y.removeAttribute('aria-current'));b.setAttribute('aria-current','page');render();}));
$('project').value=w.name;
$('project').addEventListener('change',()=>run(async()=>{const name=$('project').value.trim();if(!name)throw Error('Workspace name cannot be empty.');await commit({...w,name},{operation:{kind:'rename',name}});notice('Workspace renamed.');}));
$('sample').addEventListener('click',()=>run(async()=>{if(!confirm(t('Replace this workspace with synthetic sample data? Export a backup first if needed.')))return;await commit(demo(),{replace:true});notice('Synthetic sample loaded. This is not real stakeholder evidence.');}));
$('reset').addEventListener('click',()=>run(async()=>{if(!confirm(t('Replace this workspace with an empty workspace? Back up your current data first.')))return;await commit(empty('Untitled workspace'),{replace:true});notice('New workspace created.');}));
$('backup').addEventListener('click',()=>run(async()=>{const raw=storageReady?JSON.stringify(w,null,2):localStorage.getItem(localKey());download('requirement-studio-backup.json',raw||JSON.stringify(w,null,2),'application/json');}));
$('import').addEventListener('click',()=>$('file').click());
$('file').addEventListener('change',async()=>{const f=$('file').files[0];$('file').value='';if(!f)return;try{if(f.size>10*1024*1024)throw Error('Backup exceeds 10 MB.');const next=validateWorkspace(JSON.parse(await f.text()));if(!confirm('Replace this workspace with '+next.name+'?'))return;await commit(next,{replace:true});notice('Backup imported.');}catch(e){notice('Import failed: '+e.message);}});
window.addEventListener('storage',e=>{if(!cloud&&(e.key===localKey()||e.key===PROJECTS)){storageReady=false;notice('This workspace changed in another tab. Reload before making changes to avoid overwriting data.');}});
render();

function analysisView(){
 const c=heading('Product analysis','Deterministic prioritization and evidence-based review.');
 const make=(label,value)=>{const l=node('label','','field'),i=node('input');i.type='number';i.value=value;l.append(node('span',t(label)),i);return [l,i];};
 const box=node('section','','document'),out=node('p'),a=make('Reach',100),b=make('Impact',2),d=make('Confidence (%)',80),e=make('Effort',4);box.append(node('h2','RICE'),a[0],b[0],d[0],e[0],button('Calculate',()=>run(async()=>{out.textContent='RICE: '+rice({reach:Number(a[1].value),impact:Number(b[1].value),confidence:Number(d[1].value),effort:Number(e[1].value)}).toFixed(2);})),out);c.append(box);
 const ib=node('section','','document'),io=node('p'),ia=make('Impact',5),ic=make('Confidence',5),ie=make('Ease',5);ib.append(node('h2','ICE'),ia[0],ic[0],ie[0],button('Calculate',()=>run(async()=>{io.textContent='ICE: '+ice({impact:Number(ia[1].value),confidence:Number(ic[1].value),ease:Number(ie[1].value)}).toFixed(2);})),io);c.append(ib);
 const u=uatSummary(w);c.append(node('h2',t('Test readiness')),node('p',u.passed+' / '+u.total+' '+t('Passed current tests')),table(['ID','Title','Version','Result'],u.rows.map(r=>[ref(r.id),r.title,r.version,t(r.result)])));
 c.append(node('h2',t('Review suggestions')),table(['Artifact','Rule','Finding'],reviewSuggestions(w).map(r=>[ref(r.artifact),r.code,qualityMessage(r)])));
}
