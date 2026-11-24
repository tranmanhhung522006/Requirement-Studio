import {inspect,descendants} from './core.mjs';
export function rice({reach,impact,confidence,effort}){if(![reach,impact,confidence,effort].every(Number.isFinite)||reach<0||impact<0||confidence<0||confidence>100||effort<=0)throw Error('Invalid RICE values.');return reach*impact*confidence/100/effort;}
export function ice({impact,confidence,ease}){if(![impact,confidence,ease].every(v=>Number.isFinite(v)&&v>=1&&v<=10))throw Error('ICE uses 1–10 ratings.');return impact*confidence*ease;}
export function reviewSuggestions(w){
 return w.items.filter(x=>x.status!=='Retired').flatMap(x=>inspect(w,x).map(f=>({artifact:x.id,code:f.code,message:f.message,level:f.level,action:'Review with the accountable owner; record evidence before changing the requirement.'})));
}
export function uatSummary(w){const tests=w.items.filter(x=>x.type==='TC'&&x.status==='Approved');const rows=tests.map(x=>({id:x.id,title:x.title,version:x.version,result:(w.runs??[]).filter(r=>r.target===x.id&&r.version===x.version).at(-1)?.result??'Not run'}));return {rows,passed:rows.filter(r=>r.result==='Pass').length,total:rows.length};}
