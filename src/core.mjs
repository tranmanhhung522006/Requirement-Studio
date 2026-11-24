export const TYPES = {
 BO: 'Business objective', BR: 'Business requirement', FR: 'Functional requirement',
 NFR: 'Non-functional requirement', RULE: 'Business rule', US: 'User story',
 AC: 'Acceptance criterion', TC: 'Test case', UC: 'Use case', EP: 'Epic', FE: 'Feature', AS: 'Assumption', CO: 'Constraint'
};
export const PARENTS = { BO: [], BR: ['BO'], FR: ['BR'], NFR: ['BR'], RULE: ['BR'], US: ['FR','NFR','RULE','FE'], UC: ['FR','RULE'], AC: ['US','FR','NFR','RULE','UC'], TC: ['AC','FR','NFR','RULE','UC'], EP:['BO','BR'], FE:['EP','BR'], AS:[], CO:[] };
export const STATUS = ['Draft','In review','Approved','Retired'];
export const SOURCES = ['Unverified','Stakeholder','Document','Assumption','AI suggestion'];
export const PRIORITIES = ['Must','Should','Could','Won’t'];
export const FIELDS={
 BO:[['metric','Metric'],['target','Target'],['deadline','Deadline']],
 BR:[['rationale','Business rationale'],['scope','Scope']],
 FR:[['actor','Actor'],['trigger','Trigger'],['preconditions','Preconditions'],['exceptions','Exceptions']],
 NFR:[['metric','Metric'],['threshold','Threshold'],['condition','Operating condition']],
 RULE:[['condition','Condition'],['constraint','Constraint'],['action','Action']],
 US:[['actor','Actor'],['goal','Goal'],['benefit','Benefit']],
 AC:[['given','Given'],['when','When'],['then','Then']],
 UC:[['actor','Actor'],['preconditions','Preconditions'],['mainFlow','Main flow'],['alternativeFlow','Alternative flow'],['exceptionFlow','Exception flow'],['postconditions','Postconditions']],
 TC:[['preconditions','Preconditions'],['steps','Test steps'],['expected','Expected result']],
 EP:[['outcome','Desired outcome']], FE:[['outcome','Desired outcome']],
 AS:[['validation','Validation plan']], CO:[['constraint','Constraint'],['rationale','Business rationale']]
};
export const empty = name => ({schema:1, name, items:[], history:[], counters:{}, stakeholders:[], scope:'', baselines:[], changes:[], runs:[]});
export function upgrade(w){return {...w,stakeholders:w.stakeholders??[],scope:w.scope??'',baselines:w.baselines??[],changes:w.changes??[],runs:w.runs??[]};}
export function validateWorkspace(w) {
 const str = v => typeof v === 'string';
 if (!w || w.schema !== 1 || !str(w.name) || !w.name.trim() || !Array.isArray(w.items) || !Array.isArray(w.history) || !w.counters || typeof w.counters !== 'object' || Array.isArray(w.counters)) throw Error('Invalid workspace schema.');
 const ids = new Set();
 for (const x of w.items) {
   if (!x || !Object.hasOwn(TYPES,x.type) || !str(x.id) || !new RegExp('^'+x.type+'-[0-9]{3,}$').test(x.id) || ids.has(x.id) || !Number.isSafeInteger(+x.id.split('-')[1])) throw Error('Invalid or duplicate ID.');
   ids.add(x.id);
   if(x.details!==undefined&&(!x.details||typeof x.details!=='object'||Array.isArray(x.details)||Object.entries(x.details).some(([k,v])=>!FIELDS[x.type].some(f=>f[0]===k)||!str(v)||v.length>20000)))throw Error('Invalid structured fields.');
   for (const k of ['title','description','owner','sourceRef','verification','updatedAt']) if (!str(x[k])) throw Error('Invalid field: '+k);
   if (!STATUS.includes(x.status) || !SOURCES.includes(x.source) || !PRIORITIES.includes(x.priority) || !Number.isSafeInteger(x.version) || x.version < 1 || !Array.isArray(x.parents) || !x.parents.every(str) || new Set(x.parents).size !== x.parents.length) throw Error('Invalid record: '+x.id);
 }
 for (const x of w.items) for (const id of x.parents) {
   const parent = w.items.find(y=>y.id===id);
   if (!parent || !PARENTS[x.type].includes(parent.type)) throw Error('Invalid upstream link: '+x.id+' → '+id);
 }
 for (const [k,v] of Object.entries(w.counters)) if (!Object.hasOwn(TYPES,k) || !Number.isSafeInteger(v) || v < 0) throw Error('Invalid counter.');
 for (const h of w.history) if (!h || !str(h.id) || !str(h.at) || !str(h.action) || !h.snapshot || h.snapshot.id !== h.id || !Number.isSafeInteger(h.snapshot.version)) throw Error('Invalid history.');
 for(const k of ['stakeholders','baselines','changes','runs']) if(w[k]!==undefined&&!Array.isArray(w[k]))throw Error('Invalid '+k);
 if(w.scope!==undefined&&!str(w.scope))throw Error('Invalid scope.');
 for(const s of w.stakeholders??[])if(!s||!str(s.id)||!str(s.name)||!str(s.role)||!str(s.interest)||!s.name.trim())throw Error('Invalid stakeholder.');
 for(const b of w.baselines??[])if(!b||!str(b.id)||!str(b.name)||!str(b.at)||!Array.isArray(b.items)||!b.items.every(x=>x&&str(x.id)&&Number.isSafeInteger(x.version)))throw Error('Invalid baseline.');
 for(const c of w.changes??[])if(!c||!str(c.id)||!str(c.target)||!ids.has(c.target)||!str(c.reason)||!str(c.impact)||!['Submitted','Accepted','Rejected','Implemented'].includes(c.status)||!Number.isSafeInteger(c.version))throw Error('Invalid change request.');
 for(const r of w.runs??[])if(!r||!str(r.id)||!ids.has(r.target)||!Number.isSafeInteger(r.version)||!['Pass','Fail','Blocked'].includes(r.result)||!str(r.evidence)||!str(r.at))throw Error('Invalid test run.');
 for(const k of ['stakeholders','baselines','changes','runs'])if(new Set((w[k]??[]).map(x=>x.id)).size!==(w[k]??[]).length)throw Error('Duplicate record.');
 return w;
}
export function newItem(w,type) {
 if (!Object.hasOwn(TYPES,type)) throw Error('Unknown type');
 const max = Math.max(w.counters[type]||0,0,...w.items.filter(x=>x.type===type).map(x=>+x.id.split('-')[1]));
 if (max >= Number.MAX_SAFE_INTEGER) throw Error('ID limit reached.');
 return {id:type+'-'+String(max+1).padStart(3,'0'),type,title:'',description:'',owner:'',source:'Unverified',sourceRef:'',verification:'',priority:'Must',status:'Draft',parents:[],version:1,updatedAt:'',details:{}};
}
export function inspect(w,x) {
 const out = [];
 const add=(code,level,message)=>out.push({id:x.id,code,level,message});
 if (!x.title.trim()) add('R001','error','Title is required.');
 if (!x.description.trim()) add('R002','error','Specification is required.');
 if (!x.owner.trim()) add('R003','error','Assign an accountable owner.');
 if (!['Stakeholder','Document'].includes(x.source) || !x.sourceRef.trim()) add('R004','error','Record a confirmed source reference before approval.');
 if (PARENTS[x.type].length && !x.parents.length) add('R005','error','Link an upstream artifact.');
 for (const id of x.parents) {
   const p=w.items.find(y=>y.id===id);
   if (!p || !PARENTS[x.type].includes(p.type)) add('R006','error','Invalid upstream link: '+id);
   else if (p.status!=='Approved') add('R007','error','Upstream artifact is not approved: '+id);
 }
 if (['FR','NFR','RULE','US','AC','TC','UC'].includes(x.type) && !x.verification.trim()) add('R008','error','Define a verification method or observable expected result.');
 if (/\b(fast|easy|user.friendly|as needed|etc|appropriate|efficient|seamless)\b|nhanh chóng|dễ dàng|thân thiện|phù hợp|tối ưu/i.test(x.description)) add('R009','warning','Potentially ambiguous wording; specify measurable conditions.');
 if (x.title.trim() && w.items.some(y=>y.id!==x.id && y.type===x.type && y.status!=='Retired' && y.title.trim().toLowerCase()===x.title.trim().toLowerCase())) add('R010','warning','Possible duplicate title.');
 if (x.type==='NFR' && !/\d/.test(x.description+' '+x.verification)) add('R011','warning','Consider a measurable quality threshold.');
 const d=x.details??{};
 if(x.title.length>160)add('R012','warning','Title exceeds 160 characters.');
 if(x.description.trim()&&x.description.trim().length<15)add('R013','warning','Specification may be too short.');
 if(/\b(TBD|TBC|TODO|FIXME)\b|chưa xác định/i.test(x.description))add('R014','warning','Unresolved placeholder.');
 if(/\b(always|never|all users|every user)\b|mọi người dùng/i.test(x.description))add('R015','warning','Check absolute claims and exceptions.');
 if(/\b(and\/or)\b|và\/hoặc/i.test(x.description))add('R016','warning','Clarify combined conditions.');
 if(x.type==='FR'&&!/\b(shall|must)\b|phải/i.test(x.description))add('R017','warning','Consider an explicit obligation.');
 if(x.type==='US'&&!(d.actor&&d.goal&&d.benefit)&&!/\bas an?\b.*\bi want\b.*\bso that\b/i.test(x.description))add('R018','warning','Identify actor, goal and benefit.');
 if(x.type==='AC'&&!(d.given&&d.when&&d.then)&&!/\bgiven\b.*\bwhen\b.*\bthen\b/is.test(x.description))add('R019','warning','Define context, action and observable outcome.');
 if(x.type==='NFR'&&!(d.metric&&d.threshold&&d.condition))add('R020','warning','Specify metric, threshold and operating condition.');
 if(x.type==='UC'&&!(d.actor&&d.mainFlow))add('R021','warning','Specify actor and main flow.');
 if(x.type==='TC'&&!(d.steps&&d.expected))add('R022','warning','Specify test steps and expected result.');
 if(x.type==='RULE'&&!(d.condition&&d.action))add('R023','warning','Specify rule condition and action.');
 if(x.type==='BO'&&!(d.metric&&d.target&&d.deadline))add('R024','warning','Specify objective metric, target and deadline.');
 if(x.sourceRef.trim()&&/^(tbd|unknown|n\/a|chưa rõ)$/i.test(x.sourceRef.trim()))add('R025','warning','Source reference may be a placeholder.');
 if(x.description.trim()&&w.items.some(y=>y.id!==x.id&&y.status!=='Retired'&&y.description.trim().toLowerCase()===x.description.trim().toLowerCase()))add('R026','warning','Duplicate specification text.');
 if(['FR','NFR','RULE'].includes(x.type)&&!descendants(w,x.id).some(y=>y.type==='AC'&&y.status!=='Retired'))add('R027','warning','No downstream acceptance criterion.');
 if(['FR','NFR','RULE'].includes(x.type)&&!descendants(w,x.id).some(y=>y.type==='TC'&&y.status!=='Retired'))add('R028','warning','No downstream test case.');
 return out;
}
export function descendants(w,id) {
 const seen=new Set([id]), queue=[id], result=[];
 while(queue.length) {
   const p=queue.shift();
   for(const x of w.items) if(x.parents.includes(p)&&!seen.has(x.id)) {seen.add(x.id);queue.push(x.id);result.push(x);}
 }
 return result;
}
export function saveItem(w,record) {
 validateWorkspace(w);
 const old=w.items.find(x=>x.id===record.id);
 if (old && old.type!==record.type) throw Error('Artifact type is immutable.');
 if (!old && record.id!==newItem(w,record.type).id) throw Error('ID is no longer available.');
 const next={...record,parents:[...new Set(record.parents)],version:old?old.version+1:1,updatedAt:new Date().toISOString()};
 if (old?.status==='Approved' && next.status==='Approved') throw Error('Return approved artifacts to review before editing.');
 const result=structuredClone(w);
 result.items=old?result.items.map(x=>x.id===next.id?next:x):[...result.items,next];
 result.counters[next.type]=Math.max(result.counters[next.type]||0,+next.id.split('-')[1]);
 validateWorkspace(result);
 if(next.status==='Approved') {
   const errors=inspect(result,next).filter(i=>i.level==='error');
   if(errors.length) throw Error(errors.map(i=>i.message).join('\n'));
 }
 result.history.push({id:next.id,at:next.updatedAt,action:old?'Updated':'Created',snapshot:structuredClone(next)});
 if(old) for(const child of descendants(result,next.id)) {
   if(child.status==='Approved') {
     const revised={...child,status:'In review',version:child.version+1,updatedAt:next.updatedAt};
     result.items=result.items.map(x=>x.id===child.id?revised:x);
     result.history.push({id:child.id,at:next.updatedAt,action:'Upstream changed: '+next.id,snapshot:structuredClone(revised)});
   }
 }
 return result;
}
export function matrix(w) {
 return w.items.filter(x=>['FR','NFR','RULE'].includes(x.type)&&x.status!=='Retired').map(x=>{
 const downstream=descendants(w,x.id).filter(y=>y.status!=='Retired');
 const criteria=downstream.filter(y=>y.type==='AC'), tests=downstream.filter(y=>y.type==='TC');
 return {id:x.id,title:x.title,upstream:x.parents,stories:downstream.filter(y=>y.type==='US').map(y=>y.id),criteria:criteria.map(y=>y.id),tests:tests.map(y=>y.id),covered:criteria.some(c=>c.status==='Approved'&&descendants(w,c.id).some(t=>t.type==='TC'&&t.status==='Approved')), passed:tests.filter(t=>t.status==='Approved'&&latestRun(w,t)?.result==='Pass').map(t=>t.id)};
 });
}
export function issues(w) { return w.items.filter(x=>x.status!=='Retired').flatMap(x=>inspect(w,x)); }
export function csv(rows) {
 return rows.map(row=>row.map(value=>{
 let v=String(value??'');
 if (/^[\s\u0000-\u001f]*[=+@-]/.test(v)||/^[\t\r\n]/.test(v)) v="'"+v;
 return '"'+v.replaceAll('"','""')+'"';
 }).join(',')).join('\r\n');
}
export function demo() {
 let w=empty('Order approval — sample');
 const add=(type,title,description,parents,verification='')=>{
  const x={...newItem(w,type),title,description,parents,verification,owner:'Process owner',source:'Document',sourceRef:'Illustrative scenario (not real stakeholder evidence)',status:'Approved'};
  w=saveItem(w,x);return x.id;
 };
 const bo=add('BO','Reduce approval delays','Reduce median approval turnaround from 48 to 24 hours.',[]);
 const br=add('BR','Controlled approvals','Every order above 5,000,000 VND requires manager approval.',[bo]);
 const fr=add('FR','Route high-value orders','The system shall route orders above 5,000,000 VND to the assigned manager before fulfilment.',[br],'Inspect approval queue and order status.');
 const us=add('US','Review pending orders','As a manager, I want to review high-value orders so that spending is controlled.',[fr],'Manager can approve or reject a pending order.');
 const ac=add('AC','Prevent premature fulfilment','Given an order worth 5,000,001 VND, when submitted, then its status becomes Pending approval.',[us],'Expected status: Pending approval.');
 add('TC','Verify threshold routing','Submit an order worth 5,000,001 VND using a standard account.',[ac],'Order is pending and cannot be fulfilled.');
 return w;
}

export function latestRun(w,t){return (w.runs??[]).filter(r=>r.target===t.id&&r.version===t.version).at(-1);}
export function compareVersions(w,id,from,to){
 const a=w.history.find(h=>h.id===id&&h.snapshot.version===from)?.snapshot;
 const b=w.history.find(h=>h.id===id&&h.snapshot.version===to)?.snapshot;
 if(!a||!b)throw Error('Version not found.');
 return [...new Set([...Object.keys(a),...Object.keys(b)])].filter(k=>!['version','updatedAt'].includes(k)&&JSON.stringify(a[k])!==JSON.stringify(b[k])).map(k=>({field:k,before:a[k],after:b[k]}));
}
export function governance(w,op){
 const next=structuredClone(upgrade(w)), text=v=>typeof v==='string'?v.trim():'', at=new Date().toISOString();
 const id=()=>crypto.randomUUID();
 switch(op.kind){
 case 'scope':next.scope=text(op.value);break;
 case 'stakeholder':if(!text(op.name))throw Error('Stakeholder name required.');next.stakeholders.push({id:id(),name:text(op.name),role:text(op.role),interest:text(op.interest)});break;
 case 'baseline':{
  const active=next.items.filter(x=>x.status!=='Retired');
  if(!text(op.name)||!active.length||active.some(x=>x.status!=='Approved'||inspect(next,x).some(i=>i.level==='error')))throw Error('Baseline requires a name and all active artifacts approved.');
  next.baselines.push({id:id(),name:text(op.name),at,items:structuredClone(active)});break;}
 case 'change':{
  const x=next.items.find(x=>x.id===op.target);
  if(!x||x.status!=='Approved'||!text(op.reason)||!text(op.impact))throw Error('Select an approved artifact and specify reason and impact.');
  next.changes.push({id:id(),target:x.id,version:x.version,reason:text(op.reason),impact:text(op.impact),status:'Submitted',at});break;}
 case 'decision':{
  const c=next.changes.find(c=>c.id===op.id);
  if(!c||c.status!=='Submitted'||!['Accepted','Rejected'].includes(op.status))throw Error('Invalid change decision.');
  c.status=op.status;c.decidedAt=at;break;}
 case 'implement':{
  const c=next.changes.find(c=>c.id===op.id),x=next.items.find(x=>x.id===c?.target);
  if(!c||c.status!=='Accepted'||!x||x.version!==c.version||x.status!=='Approved')throw Error('Change is stale or not accepted.');
  c.status='Implemented';c.implementedAt=at;return saveItem(next,{...x,status:'In review'});}
 case 'run':{
  const x=next.items.find(x=>x.id===op.target&&x.type==='TC'&&x.status==='Approved');
  if(!x||!['Pass','Fail','Blocked'].includes(op.result)||!text(op.evidence))throw Error('Approved test case and execution evidence required.');
  next.runs.push({id:id(),target:x.id,version:x.version,result:op.result,evidence:text(op.evidence),at});break;}
 default:throw Error('Unknown operation.');
 }
 return validateWorkspace(next);
}
