import {sampleDiagram,fromUseCases,validateDiagram,layoutDiagram,renderSvg,exportBpmn} from './diagram.mjs';
import {t,language} from './i18n.mjs';
const $=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
const list=(pairs,value)=>{const e=$('select');for(const [v,label] of pairs){const o=$('option',label);o.value=v;e.append(o);}e.value=value??pairs[0]?.[0]??'';return e;};
const input=(value='',type='text')=>{const e=$('input');e.type=type;e.value=value;return e;};
const field=(label,e)=>{const l=$('label');l.className='field';l.append($('span',t(label)),e);return l;};
const types={uml:[['actor','Actor'],['usecase','Use case']],bpmn:[['start','Start event'],['end','End event'],['task','Task'],['exclusive','Exclusive gateway'],['parallel','Parallel gateway']]};
const relations={uml:[['association','Association'],['include','Include'],['extend','Extend'],['generalization','Generalization']],bpmn:[['sequence','Sequence flow']]};
const name=(k,v)=>t((k.find(x=>x[0]===v)||[v,v])[1]);
const nextId=(arr,prefix)=>{let i=1;while(arr.some(x=>x.id===prefix+i))i++;return prefix+i;};
const state=new Map();
const clone=x=>structuredClone(x);
function download(filename,value,type){const blob=value instanceof Blob?value:new Blob([value],{type});const url=URL.createObjectURL(blob),a=$('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
const crc32=bytes=>{let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;};
// PNG pHYs is pixels per metre. Canvas normally supplies 96 DPI; replace with 300 DPI.
export async function png300(blob){
 const raw=new Uint8Array(await blob.arrayBuffer()),parts=[raw.slice(0,8)];let pos=8;
 const chunk=new Uint8Array(21),v=new DataView(chunk.buffer);v.setUint32(0,9);chunk.set([112,72,89,115],4);v.setUint32(8,11811);v.setUint32(12,11811);chunk[16]=1;v.setUint32(17,crc32(chunk.subarray(4,17)));
 while(pos+12<=raw.length){const len=new DataView(raw.buffer,pos,4).getUint32(0),end=pos+12+len;if(end>raw.length)throw Error('Invalid PNG.');const type=String.fromCharCode(...raw.slice(pos+4,pos+8));if(type!=='pHYs')parts.push(raw.slice(pos,end));if(type==='IHDR')parts.push(chunk);pos=end;}
 return new Blob(parts,{type:'image/png'});
}
async function exportPng(svg,l,orientation){
 const landscape=orientation==='landscape',maxW=landscape?3508:2480,maxH=landscape?2480:3508,s=Math.min(maxW/l.width,maxH/l.height);
 const canvas=$('canvas');canvas.width=Math.max(1,Math.round(l.width*s));canvas.height=Math.max(1,Math.round(l.height*s));const ctx=canvas.getContext('2d');if(!ctx)throw Error('PNG export failed.');
 const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));
 try{const image=new Image();image.src=url;await image.decode();ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('PNG export failed.');download('diagram.png',await png300(blob),'image/png');}finally{URL.revokeObjectURL(url);}
}
export function diagramView(w,ui){
 const {heading,button,table,projectId,commit}=ui;
 const c=heading('Diagram Studio','Structured model, deterministic layout and geometry checks.');
 let s=state.get(projectId);if(!s){s={id:'',model:sampleDiagram('uml',language()),dirty:false,zoom:0.7,orientation:'portrait'};state.set(projectId,s);}
 // Reconcile a removed or replaced project record after import/reset.
 if(s.id&&!w.diagrams.some(d=>d.id===s.id)){s.id='';s.dirty=true;}
 const bar=$('div');bar.className='diagram-toolbar';c.append(bar);
 const saved=list([['',t('Select a saved diagram')],...w.diagrams.map(d=>[d.id,d.model.title])],s.id);
 const choose=()=>!s.dirty||confirm(t('Discard unsaved diagram changes?'));
 function replace(model,id=''){s.model=clone(model);s.id=id;s.dirty=!id;diagramView(w,ui);}
 saved.addEventListener('change',()=>{if(!choose()){saved.value=s.id;return;}const d=w.diagrams.find(x=>x.id===saved.value);if(d)replace(d.model,d.id);else saved.value=s.id;});
 const file=$('input');file.type='file';file.accept='.json,application/json';file.hidden=true;
 file.addEventListener('change',async()=>{const f=file.files[0];if(!f)return;try{if(f.size>1024*1024)throw Error('Model JSON is invalid.');const model=JSON.parse(await f.text());if(validateDiagram(model).some(x=>x.level==='error'))throw Error('Diagram has structural errors.');if(choose())replace(model);}catch(e){alert(t(e.message));}finally{file.value='';}});
 bar.append(saved,button('New UML sample',()=>{if(choose())replace(sampleDiagram('uml',language()));}),button('New BPMN sample',()=>{if(choose())replace(sampleDiagram('bpmn',language()));}),button('From use cases',()=>{const m=fromUseCases(w);if(!m.nodes.length){alert(t('No use cases with explicit actors found.'));return;}if(choose()){replace(m);alert(t('Use case relationships must be confirmed manually.'));}}),button('Import model JSON',()=>file.click()),file);
 const draft=$('p');draft.className='diagram-draft';draft.textContent=s.dirty?t('Draft not saved'):s.id?s.model.title:t('Unsaved model');c.append(draft);
 const grid=$('div');grid.className='diagram-grid';c.append(grid);const left=$('section'),right=$('section');left.className=right.className='diagram-panel';grid.append(left,right);
 left.append($('h2',t('Model editor')));right.append($('h2',t('Preview')));
 const err=$('p');err.className='error';err.setAttribute('role','alert');left.append(err);
 const title=input(s.model.title);title.maxLength=160;left.append(field('Model title',title));title.addEventListener('input',()=>{s.model.title=title.value;s.dirty=true;draft.textContent=t('Draft not saved');disableExports();});
 const editor=$('div');left.append(editor);const canvas=$('div');canvas.className='diagram-canvas';canvas.tabIndex=0;
 const toolbar=$('div');toolbar.className='diagram-toolbar';right.append(toolbar,canvas);
 const metrics=$('p');metrics.className='diagram-counts';const findings=$('div');findings.className='diagram-findings';findings.setAttribute('aria-live','polite');right.append(metrics,findings);
 const zoom=list([[.4,'40%'],[.55,'55%'],[.7,'70%'],[1,'100%'],[1.3,'130%'],[1.6,'160%']],String(s.zoom));zoom.setAttribute('aria-label',t('Layout zoom'));
 const orient=list([['portrait',t('Portrait')],['landscape',t('Landscape')]],s.orientation);orient.addEventListener('change',()=>s.orientation=orient.value);
 let result=null,svg='',currentSvg=null;
 const svgButton=button('Export SVG',()=>{if(svg&&!blocked())download('diagram.svg',svg,'image/svg+xml;charset=utf-8');});
 const pngButton=button('Export PNG (A4, 300 DPI)',async()=>{if(svg&&!blocked())try{await exportPng(svg,result.layout,s.orientation);}catch(e){err.textContent=t(e.message);}});
 const xmlButton=button('Export BPMN XML',()=>{if(!blocked())download('diagram.bpmn',exportBpmn(s.model,result),'application/xml');});
 const save=button('Save diagram',async()=>{if(blocked())return;save.disabled=true;const wasId=s.id;s.selectAfterSave=wasId?null:s.model;s.dirty=false;const ok=await commit({kind:'diagram-save',id:wasId||undefined,model:s.model});if(!ok){s.selectAfterSave=null;s.dirty=true;save.disabled=false;draft.textContent=t('Draft not saved');}},'primary');
 const remove=button('Delete diagram',async()=>{if(!s.id||!confirm(t('Delete this diagram?')))return;if(await commit({kind:'diagram-remove',id:s.id})){s.id='';s.dirty=false;}});
 if(s.selectAfterSave){const match=[...w.diagrams].reverse().find(d=>JSON.stringify(d.model)===JSON.stringify(s.selectAfterSave)||d.model.title===s.selectAfterSave.title&&d.model.kind===s.selectAfterSave.kind);if(match){s.id=match.id;saved.value=s.id;s.selectAfterSave=null;s.dirty=false;draft.textContent=s.model.title;}}
 // A successful project save triggers synchronous re-render; match before commit via pending content.
 toolbar.append(button('Render & validate',render),zoom,orient,svgButton,pngButton,xmlButton,button('Download model JSON',()=>download('diagram.json',JSON.stringify(s.model,null,2),'application/json')));
 left.append(save,remove,$('p',t('Layout controls are row and actor-side based; complex models may require splitting.')));
 function blocked(){return !result?.layout||result.findings.some(f=>f.level==='error')||!svg;}
 function disableExports(){svg='';for(const b of [svgButton,pngButton,xmlButton,save])b.disabled=true;}
 function setZoom(){if(!currentSvg||!result?.layout)return;currentSvg.setAttribute('width',String(Math.round(result.layout.width*s.zoom)));currentSvg.setAttribute('height',String(Math.round(result.layout.height*s.zoom)));}
 zoom.addEventListener('change',()=>{s.zoom=Number(zoom.value);setZoom();});
 function mark(){s.dirty=true;draft.textContent=t('Draft not saved');disableExports();rebuild();}
 function render(){
  err.textContent='';canvas.replaceChildren();findings.replaceChildren();disableExports();currentSvg=null;
  try{
   result=layoutDiagram(s.model);
   if(result.layout){svg=renderSvg(s.model,result);const parsed=new DOMParser().parseFromString(svg,'image/svg+xml');if(parsed.querySelector('parsererror'))throw Error('Diagram export blocked by validation errors.');currentSvg=document.importNode(parsed.documentElement,true);canvas.append(currentSvg);setZoom();
    // Browser font measurement in SVG user units. Do not rely on character count alone.
    const nodes=new Map(result.layout.nodes.map(n=>[n.id,n]));for(const text of currentSvg.querySelectorAll('text')){
      const b=text.getBBox(),id=text.getAttribute('data-node'),n=nodes.get(id);
      if(b.x<0||b.y<0||b.x+b.width>result.layout.width||b.y+b.height>result.layout.height)result.findings.push({code:'V007',level:'error',message:'Text exceeds canvas: '+text.textContent});
      if(n&&(b.x<n.x+3||b.x+b.width>n.x+n.w-3||b.y<n.y+2||b.y+b.height>n.y+n.h-2))result.findings.push({code:'V008',level:'error',message:'Text exceeds node: '+id});
      if(n?.type==='usecase'){const cx=n.x+n.w/2,cy=n.y+n.h/2;for(const x of [b.x,b.x+b.width])for(const y of [b.y,b.y+b.height])if(((x-cx)/(n.w/2-4))**2+((y-cy)/(n.h/2-4))**2>1){result.findings.push({code:'V009',level:'error',message:'Text exceeds ellipse: '+id});break;}}
    }
    metrics.textContent=t('Node count')+': '+result.layout.nodes.length+' · '+t('Connections')+': '+result.layout.edges.length+' · '+t('Crossings')+': '+result.layout.crossings+' · '+result.layout.width+' × '+result.layout.height;
   }else metrics.textContent='';
   for(const f of result.findings){const p=$('p',f.code+' · '+t(f.level)+' — '+t(f.message));p.className=f.level;findings.append(p);}
   if(!result.findings.length)findings.append($('p',t('No findings.')));
   svgButton.disabled=pngButton.disabled=save.disabled=blocked();xmlButton.disabled=blocked()||s.model.kind!=='bpmn';remove.disabled=!s.id;
  }catch(e){err.textContent=t(e.message);disableExports();}
 }
 function section(label){const d=$('details'),summary=$('summary',t(label));d.open=true;d.append(summary);editor.append(d);return d;}
 function rebuild(){
  editor.replaceChildren();const m=s.model;
  if(m.kind==='bpmn'){
   const d=section('Lane'),listBox=$('div');d.append(listBox);
   for(const lane of m.lanes){const row=$('div');row.className='diagram-toolbar';const label=input(lane.label);label.maxLength=80;label.addEventListener('change',()=>{lane.label=label.value;mark();});const del=button('Remove',()=>{if(m.nodes.some(n=>n.lane===lane.id)){err.textContent='D006 · '+t('Missing lane')+': '+lane.id;return;}m.lanes=m.lanes.filter(l=>l.id!==lane.id);mark();});row.append(label,del);listBox.append(row);}
   d.append(button('Add lane',()=>{m.lanes.push({id:nextId(m.lanes,'lane'),label:t('Lane')+' '+(m.lanes.length+1)});mark();}));
  }
  const d=section('Node'),picker=list([['',t('Add node')],...m.nodes.map(n=>[n.id,n.id+' — '+n.label])],s.nodeId||'');
  if(!m.nodes.some(n=>n.id===s.nodeId))picker.value='';
  const form=$('div');form.className='diagram-form';d.append(picker,form);
  function nodeForm(){
   form.replaceChildren();const n=m.nodes.find(n=>n.id===picker.value),type=list(types[m.kind].map(([v,l])=>[v,t(l)]),n?.type??(m.kind==='uml'?'usecase':'task')),label=input(n?.label??'');label.maxLength=160;
   const row=input(n?.row??'','number');row.min=0;row.max=59;const lane=list((m.lanes??[]).map(l=>[l.id,l.label]),n?.lane),side=list([['left',t('Left')],['right',t('Right')]],n?.side??'left'),ref=input(n?.ref??'');ref.maxLength=64;
   form.append(field('Node type',type),field('Node label',label),field('Row (optional)',row),field('Reference',ref));if(m.kind==='bpmn')form.append(field('Lane',lane));else form.append(field('Actor side',side));
   form.append(button(n?'Edit':'Add node',()=>{const record={id:n?.id??nextId(m.nodes,'node'),type:type.value,label:label.value.trim()};if(row.value!=='')record.row=Number(row.value);if(ref.value.trim())record.ref=ref.value.trim();if(m.kind==='bpmn')record.lane=lane.value;else if(type.value==='actor')record.side=side.value;if(n)m.nodes=m.nodes.map(x=>x.id===n.id?record:x);else m.nodes.push(record);s.nodeId=record.id;mark();}));
   if(n)form.append(button('Remove',()=>{m.nodes=m.nodes.filter(x=>x.id!==n.id);m.edges=m.edges.filter(e=>e.from!==n.id&&e.to!==n.id);s.nodeId='';mark();}));
  }
  picker.addEventListener('change',()=>{s.nodeId=picker.value;nodeForm();});nodeForm();
  const e=section('Connections'),ep=list([['',t('Add connection')],...m.edges.map(e=>[e.id,e.id+' · '+e.from+' → '+e.to+' · '+name(relations[m.kind],e.type)])],s.edgeId||'');if(!m.edges.some(x=>x.id===s.edgeId))ep.value='';
  const ef=$('div');ef.className='diagram-form';e.append(ep,ef);
  function edgeForm(){ef.replaceChildren();const old=m.edges.find(x=>x.id===ep.value),opts=m.nodes.map(n=>[n.id,n.label]),from=list(opts,old?.from),to=list(opts,old?.to??opts[1]?.[0]),type=list(relations[m.kind].map(([v,l])=>[v,t(l)]),old?.type),label=input(old?.label??'');label.maxLength=80;
   ef.append(field('From',from),field('To',to),field('Relationship',type),field('Connection label',label),button(old?'Edit':'Add connection',()=>{const r={id:old?.id??nextId(m.edges,'edge'),from:from.value,to:to.value,type:type.value,...(label.value.trim()?{label:label.value.trim()}: {})};if(old)m.edges=m.edges.map(x=>x.id===old.id?r:x);else m.edges.push(r);s.edgeId=r.id;mark();}));if(old)ef.append(button('Remove',()=>{m.edges=m.edges.filter(x=>x.id!==old.id);s.edgeId='';mark();}));}
  ep.addEventListener('change',()=>{s.edgeId=ep.value;edgeForm();});edgeForm();
  const raw=section('Model JSON');raw.open=false;const source=$('textarea');source.value=JSON.stringify(m,null,2);source.setAttribute('aria-label',t('Model JSON'));raw.append(source,button('Update preview',()=>{try{const parsed=JSON.parse(source.value);if(!parsed||validateDiagram(parsed).some(f=>f.level==='error'))throw Error('Model JSON is invalid.');s.model=parsed;title.value=parsed.title??'';mark();render();}catch(e){err.textContent=t(e.message);}}));
 }
 rebuild();render();
}
