import {FIELDS,descendants,compareVersions,latestRun} from './core.mjs';
import {t} from './i18n.mjs';
export function structuredFields(x,field,node){
 for(const [key,label] of FIELDS[x.type]??[]){const el=node('textarea');el.rows=2;el.value=x.details?.[key]??'';field('detail:'+key,label,el,true);}
}
export function professionalView(view,w,ui){
 const {heading,node,table,button,select,ref,refs,commit}=ui;
 const control=(label,el)=>{const l=node('label','','field');l.append(node('span',t(label)),el);return l;};
 const input=(value='')=>{const el=node('input');el.value=value;return el;};
 const area=(value='')=>{const el=node('textarea');el.value=value;return el;};
 const group=(c,title)=>{const box=node('section','','document');box.append(node('h2',t(title)));c.append(box);return box;};
 const selectItems=items=>select(items.map(x=>[x.id,x.id+' — '+x.title]),items[0]?.id);
 if(view==='scope'){
  const c=heading('Scope & stakeholders','Define project scope and register stakeholders.');
  const s=group(c,'Scope statement'),scope=area(w.scope);s.append(control('Scope',scope),button('Save scope',()=>commit({kind:'scope',value:scope.value}),'primary'));
  const b=group(c,'Stakeholder'),name=input(),role=input(),interest=area();
  b.append(control('Name',name),control('Role',role),control('Interest',interest),button('Add stakeholder',()=>commit({kind:'stakeholder',name:name.value,role:role.value,interest:interest.value}),'primary'));
  c.append(table(['Name','Role','Interest'],w.stakeholders.map(x=>[x.name,x.role,x.interest])));return;
 }
 if(view==='governance'){
  const c=heading('Change control','Control approved changes and preserve immutable snapshots.');
  const b=group(c,'Baseline'),name=input();b.append(control('Baseline name',name),button('Create baseline',()=>commit({kind:'baseline',name:name.value}),'primary'));
  c.append(table(['Name','Date','Snapshot'],w.baselines.map(x=>{const d=node('details');d.append(node('summary',t('View baseline')),node('pre',JSON.stringify(x.items,null,2)));return [x.name,new Date(x.at).toLocaleString(),d];})));
  const cr=group(c,'Change request'),approved=w.items.filter(x=>x.status==='Approved'),target=selectItems(approved),reason=area(),impact=area(),affected=node('p','','muted');
  const refresh=()=>affected.textContent=t('Affected artifacts')+': '+descendants(w,target.value).map(x=>x.id).join(', ');target.addEventListener('change',refresh);refresh();
  const submit=button('Submit change',()=>commit({kind:'change',target:target.value,reason:reason.value,impact:impact.value}),'primary');submit.disabled=!approved.length;
  cr.append(control('Requirement',target),control('Reason',reason),control('Impact',impact),affected,submit);
  c.append(table(['Requirement','Version','Reason','Impact','Status','Action'],w.changes.map(x=>{const a=node('div','','actions');if(x.status==='Submitted')a.append(button('Accept',()=>commit({kind:'decision',id:x.id,status:'Accepted'})),button('Reject',()=>commit({kind:'decision',id:x.id,status:'Rejected'})));if(x.status==='Accepted')a.append(button('Reopen for review',()=>commit({kind:'implement',id:x.id})));return [ref(x.target),x.version,x.reason,x.impact,t(x.status),a];})));
  const cmp=group(c,'Compare versions'),artifact=selectItems(w.items),from=input('1'),to=input('2'),out=node('div');
  cmp.append(control('Artifact',artifact),control('From version',from),control('To version',to),button('Compare',()=>{try{out.replaceChildren(table(['Field','Before','After'],compareVersions(w,artifact.value,Number(from.value),Number(to.value)).map(x=>[x.field,JSON.stringify(x.before)??'—',JSON.stringify(x.after)??'—']),'No changes.'));}catch(e){out.textContent=e.message;}}),out);return;
 }
 const c=heading('Test execution','Record evidence against the current approved test case version.'),b=group(c,'Test result');
 const tests=w.items.filter(x=>x.type==='TC'&&x.status==='Approved'),target=selectItems(tests),result=select(['Pass','Fail','Blocked'].map(v=>[v,v]),'Pass'),evidence=area();
 const save=button('Record execution',()=>commit({kind:'run',target:target.value,result:result.value,evidence:evidence.value}),'primary');save.disabled=!tests.length;
 b.append(control('Test case ID',target),control('Result',result),control('Evidence',evidence),save);
 c.append(table(['Test case ID','Version','Result','Evidence','Date'],[...w.runs].reverse().map(x=>[ref(x.target),x.version,t(x.result),x.evidence,new Date(x.at).toLocaleString()])));
}
