export const TYPES = {
 BO: 'Business objective', BR: 'Business requirement', FR: 'Functional requirement',
 NFR: 'Non-functional requirement', RULE: 'Business rule', US: 'User story',
 AC: 'Acceptance criterion', TC: 'Test case', UC: 'Use case'
};
export const PARENTS = { BO: [], BR: ['BO'], FR: ['BR'], NFR: ['BR'], RULE: ['BR'], US: ['FR','NFR','RULE'], UC: ['FR','RULE'], AC: ['US','FR','NFR','RULE','UC'], TC: ['AC','FR','NFR','RULE','UC'] };
export const STATUS = ['Draft','In review','Approved','Retired'];
export const SOURCES = ['Unverified','Stakeholder','Document','Assumption','AI suggestion'];
export const PRIORITIES = ['Must','Should','Could','Won’t'];
export const empty = name => ({schema:1, name, items:[], history:[], counters:{}});
export function validateWorkspace(w) {
 const str = v => typeof v === 'string';
 if (!w || w.schema !== 1 || !str(w.name) || !w.name.trim() || !Array.isArray(w.items) || !Array.isArray(w.history) || !w.counters || typeof w.counters !== 'object' || Array.isArray(w.counters)) throw Error('Invalid workspace schema.');
 const ids = new Set();
 for (const x of w.items) {
   if (!x || !Object.hasOwn(TYPES,x.type) || !str(x.id) || !new RegExp('^'+x.type+'-[0-9]{3,}$').test(x.id) || ids.has(x.id) || !Number.isSafeInteger(+x.id.split('-')[1])) throw Error('Invalid or duplicate ID.');
   ids.add(x.id);
   for (const k of ['title','description','owner','sourceRef','verification','updatedAt']) if (!str(x[k])) throw Error('Invalid field: '+k);
   if (!STATUS.includes(x.status) || !SOURCES.includes(x.source) || !PRIORITIES.includes(x.priority) || !Number.isSafeInteger(x.version) || x.version < 1 || !Array.isArray(x.parents) || !x.parents.every(str) || new Set(x.parents).size !== x.parents.length) throw Error('Invalid record: '+x.id);
 }
 for (const x of w.items) for (const id of x.parents) {
   const parent = w.items.find(y=>y.id===id);
   if (!parent || !PARENTS[x.type].includes(parent.type)) throw Error('Invalid upstream link: '+x.id+' → '+id);
 }
 for (const [k,v] of Object.entries(w.counters)) if (!Object.hasOwn(TYPES,k) || !Number.isSafeInteger(v) || v < 0) throw Error('Invalid counter.');
 for (const h of w.history) if (!h || !str(h.id) || !str(h.at) || !str(h.action) || !h.snapshot || h.snapshot.id !== h.id || !Number.isSafeInteger(h.snapshot.version)) throw Error('Invalid history.');
 return w;
}
export function newItem(w,type) {
 if (!Object.hasOwn(TYPES,type)) throw Error('Unknown type');
 const max = Math.max(w.counters[type]||0,0,...w.items.filter(x=>x.type===type).map(x=>+x.id.split('-')[1]));
 if (max >= Number.MAX_SAFE_INTEGER) throw Error('ID limit reached.');
 return {id:type+'-'+String(max+1).padStart(3,'0'),type,title:'',description:'',owner:'',source:'Unverified',sourceRef:'',verification:'',priority:'Must',status:'Draft',parents:[],version:1,updatedAt:''};
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
 return {id:x.id,title:x.title,upstream:x.parents,stories:downstream.filter(y=>y.type==='US').map(y=>y.id),criteria:criteria.map(y=>y.id),tests:tests.map(y=>y.id),covered:tests.some(y=>y.status==='Approved') && criteria.some(y=>y.status==='Approved')};
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
