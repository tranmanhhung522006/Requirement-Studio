import {sampleDiagram,fromUseCases,validateDiagram,layoutDiagram,renderSvg,exportBpmn} from './diagram.mjs';
import {t,language} from './i18n.mjs';
const $=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
const list=(pairs,value)=>{const e=$('select');for(const [v,label] of pairs){const o=$('option',label);o.value=v;e.append(o);}e.value=value??pairs[0]?.[0]??'';return e;};
const input=(value='',type='text')=>{const e=$('input');e.type=type;e.value=value;return e;};
const field=(label,e)=>{const l=$('label');l.className='field';l.append($('span',t(label)),e);return l;};
const types={uml:[['actor','Actor'],['usecase','Use case']],bpmn:[['start','Start event'],['end','End event'],['task','Task'],['exclusive','Exclusive gateway'],['parallel','Parallel gateway'],['inclusive','Inclusive gateway'],['intermediate','Intermediate event'],['userTask','User task'],['serviceTask','Service task'],['manualTask','Manual task'],['sendTask','Send task'],['receiveTask','Receive task']],activity:[['start','Start event'],['end','End event'],['task','Task'],['exclusive','Decision / merge'],['parallel','Fork / join']],erd:[['entity','Entity']],sequence:[['participant','Participant']]};
const relations={uml:[['association','Association'],['include','Include'],['extend','Extend'],['generalization','Generalization']],bpmn:[['sequence','Sequence flow']],activity:[['sequence','Control flow']],erd:[['relationship','Relationship']],sequence:[['message','Message'],['reply','Reply']]};
const name=(k,v)=>t((k.find(x=>x[0]===v)||[v,v])[1]);
const nextId=(arr,prefix)=>{let i=1;while(arr.some(x=>x.id===prefix+i))i++;return prefix+i;};
const state=new Map();let activePreview=null;
const tr=(en,vi)=>language()==='vi'?vi:en;
const kinds=[['uml','Use case (UML)'],['bpmn','BPMN'],['erd','ERD'],['sequence','Sequence'],['activity','Activity']];
function starter(kind){
 const title=tr('Untitled diagram','Sơ đồ mới'),n=(id,type,label,extra={})=>({id,type,label,...extra});
 if(kind==='uml')return {kind,title,nodes:[n('actor1','actor',tr('User','Người dùng'),{side:'left'}),n('node1','usecase',tr('Perform action','Thực hiện tác vụ'))],edges:[{id:'edge1',type:'association',from:'actor1',to:'node1'}]};
 if(kind==='erd')return {kind,title,nodes:[n('node1','entity','Entity',{attributes:[{name:'id',type:'UUID',key:'PK'}]})],edges:[]};
 if(kind==='sequence')return {kind,title,nodes:[n('node1','participant',tr('User','Người dùng')),n('node2','participant',tr('System','Hệ thống'))],edges:[]};
 return {kind,title,lanes:[{id:'lane1',label:tr('Team','Bộ phận')}],nodes:[n('node1','start',tr('Start','Bắt đầu'),{lane:'lane1'}),n('node2','task',tr('First task','Tác vụ đầu tiên'),{lane:'lane1'}),n('node3','end',tr('End','Kết thúc'),{lane:'lane1'})],edges:[{id:'edge1',type:'sequence',from:'node1',to:'node2'},{id:'edge2',type:'sequence',from:'node2',to:'node3'}]};
}
function remember(s){s.undo??=[];s.redo??=[];s.undo.push(clone(s.model));if(s.undo.length>30)s.undo.shift();s.redo.length=0;}
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
async function exportPng(svg,l,orientation,filename='diagram.png'){
 const landscape=orientation==='landscape',maxW=landscape?3508:2480,maxH=landscape?2480:3508,s=Math.min(maxW/l.width,maxH/l.height);
 const canvas=$('canvas');canvas.width=Math.max(1,Math.round(l.width*s));canvas.height=Math.max(1,Math.round(l.height*s));const ctx=canvas.getContext('2d');if(!ctx)throw Error('PNG export failed.');
 const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));
 try{const image=new Image();image.src=url;await image.decode();ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('PNG export failed.');download(filename,await png300(blob),'image/png');}finally{URL.revokeObjectURL(url);}
}
export function diagramView(w,ui){
 activePreview?.();
 const {heading,button,table,projectId,commit}=ui;
 const c=heading('Diagram Studio',tr('Create, connect, arrange, then export.','Tạo đối tượng, nối luồng, sắp xếp và xuất sơ đồ.'));
 let s=state.get(projectId);if(!s){s={id:'',model:clone(w.diagrams[0]?.model??starter('uml')),dirty:false,zoom:0.7,fit:true,orientation:'portrait',undo:[],redo:[]};s.id=w.diagrams[0]?.id??'';state.set(projectId,s);}
 // Reconcile a removed or replaced project record after import/reset.
 if(s.id&&!w.diagrams.some(d=>d.id===s.id)){s.id='';s.dirty=true;}
 const bar=$('div');bar.className='diagram-toolbar';c.append(bar);
 const saved=list([['',t('Select a saved diagram')],...w.diagrams.map(d=>[d.id,d.model.title])],s.id);
 const choose=()=>!s.dirty||confirm(t('Discard unsaved diagram changes?'));
 function replace(model,id=''){s.model=clone(model);s.id=id;s.dirty=!id;s.undo=[];s.redo=[];s.nodeId='';s.edgeId='';s.connect=false;s.from='';s.relation='';s.fit=true;diagramView(w,ui);}
 saved.addEventListener('change',()=>{if(!choose()){saved.value=s.id;return;}const d=w.diagrams.find(x=>x.id===saved.value);if(d)replace(d.model,d.id);else saved.value=s.id;});
 const file=$('input');file.type='file';file.accept='.json,application/json';file.hidden=true;
 file.addEventListener('change',async()=>{const f=file.files[0];if(!f)return;try{if(f.size>1024*1024)throw Error('Model JSON is invalid.');const model=JSON.parse(await f.text());if(validateDiagram(model).some(x=>x.level==='error'))throw Error('Diagram has structural errors.');if(choose())replace(model);}catch(e){alert(t(e.message));}finally{file.value='';}});
 const kindPicker=list(kinds,s.model.kind);kindPicker.setAttribute('aria-label',tr('Diagram type','Loại sơ đồ'));
 const samples=$('details');samples.className='diagram-menu';samples.append($('summary',tr('Examples & import','Mẫu và nhập')));
 bar.append(saved,kindPicker,button(tr('New diagram','Sơ đồ mới'),()=>{if(choose())replace(starter(kindPicker.value));},'primary'),samples);
 samples.append(button('New UML sample',()=>{if(choose())replace(sampleDiagram('uml',language()));}),button('New BPMN sample',()=>{if(choose())replace(sampleDiagram('bpmn',language()));}),...['erd','sequence','activity'].map(k=>button('New '+k.toUpperCase()+' sample',()=>{if(choose())replace(sampleDiagram(k,language()));})),button('From use cases',()=>{const m=fromUseCases(w);if(!m.nodes.length){alert(t('No use cases with explicit actors found.'));return;}if(choose()){replace(m);alert(t('Use case relationships must be confirmed manually.'));}}),button('Import model JSON',()=>file.click()),file);
 const draft=$('p');draft.className='diagram-draft';draft.textContent=s.dirty?t('Draft not saved'):s.id?s.model.title:t('Unsaved model');c.append(draft);
 const grid=$('div');grid.className='diagram-grid';c.append(grid);const left=$('section'),right=$('section');left.className=right.className='diagram-panel';grid.append(left,right);
 left.append($('h2',tr('Tools & properties','Công cụ và thuộc tính')));right.append($('h2',tr('Canvas','Bản vẽ')));
 const err=$('p');err.className='error';err.setAttribute('role','alert');left.append(err);
 const title=input(s.model.title);title.maxLength=160;left.append(field('Model title',title));title.addEventListener('change',()=>{if(!title.value.trim()){title.value=s.model.title;return;}remember(s);s.model.title=title.value.trim();mark();});
 const palette=$('div');palette.className='diagram-palette';left.append(palette);const editor=$('div');left.append(editor);const canvas=$('div');canvas.className='diagram-canvas';canvas.tabIndex=0;
 const toolbar=$('div');toolbar.className='diagram-toolbar';right.append(toolbar,canvas);
 const metrics=$('p');metrics.className='diagram-counts';const findings=$('div');findings.className='diagram-findings';findings.setAttribute('aria-live','polite');const review=$('details');review.className='diagram-review';const reviewTitle=$('summary',tr('Diagram checks','Kiểm tra sơ đồ'));review.append(reviewTitle,metrics,findings);right.append(review);
 const zoom=list([['fit',tr('Fit to canvas','Vừa khung')],[.25,'25%'],[.4,'40%'],[.55,'55%'],[.7,'70%'],[1,'100%'],[1.3,'130%'],[1.6,'160%']],s.fit?'fit':String(s.zoom));zoom.setAttribute('aria-label',t('Layout zoom'));
 const orient=list([['portrait',t('Portrait')],['landscape',t('Landscape')]],s.orientation);orient.addEventListener('change',()=>s.orientation=orient.value);
 let result=null,svg='',currentSvg=null,worker=null,timer=null,epoch=0,pending=false;
 activePreview=()=>{clearTimeout(timer);worker?.terminate();worker=null;epoch++;};
 const fileName=ext=>(s.model.title.replace(/[^\p{L}\p{N} _.-]/gu,'-').trim().slice(0,100)||'diagram')+'.'+ext;
 const svgButton=button('Export SVG',()=>{if(svg&&!blocked())download(fileName('svg'),svg,'image/svg+xml;charset=utf-8');});
 const pngButton=button('Export PNG (A4, 300 DPI)',async()=>{if(svg&&!blocked())try{await exportPng(svg,result.layout,s.orientation,fileName('png'));}catch(e){err.textContent=t(e.message);}});
 const xmlButton=button('Export BPMN XML',()=>{if(!blocked())download(fileName('bpmn'),exportBpmn(s.model,result),'application/xml');});
 const save=button('Save diagram',async()=>{if(blocked())return;save.disabled=true;const wasId=s.id;s.selectAfterSave=wasId?null:s.model;s.dirty=false;const ok=await commit({kind:'diagram-save',id:wasId||undefined,model:s.model});if(!ok){s.selectAfterSave=null;s.dirty=true;save.disabled=false;draft.textContent=t('Draft not saved');}},'primary');
 const remove=button('Delete diagram',async()=>{if(!s.id||!confirm(t('Delete this diagram?')))return;if(await commit({kind:'diagram-remove',id:s.id})){s.id='';s.dirty=false;}});
 if(s.selectAfterSave){const match=[...w.diagrams].reverse().find(d=>JSON.stringify(d.model)===JSON.stringify(s.selectAfterSave)||d.model.title===s.selectAfterSave.title&&d.model.kind===s.selectAfterSave.kind);if(match){s.id=match.id;saved.value=s.id;s.selectAfterSave=null;s.dirty=false;draft.textContent=s.model.title;}}
 // A successful project save triggers synchronous re-render; match before commit via pending content.
 const undo=button(tr('Undo','Hoàn tác'),()=>restore('undo','redo')),redo=button(tr('Redo','Làm lại'),()=>restore('redo','undo'));
 const auto=button(tr('Auto layout','Tự sắp xếp'),()=>{remember(s);for(const n of s.model.nodes){delete n.position;delete n.row;delete n.col;}mark();});
 const exportMenu=$('details');exportMenu.className='diagram-menu';exportMenu.append($('summary',tr('More formats','Định dạng khác')),orient,xmlButton,button('Download model JSON',()=>download(fileName('json'),JSON.stringify(s.model,null,2),'application/json')));
 toolbar.append(undo,redo,auto,zoom,save,pngButton,svgButton,exportMenu);
 const hint=$('p');hint.className='diagram-hint';right.insertBefore(hint,canvas);
 function restore(from,to){if(!s[from]?.length)return;(s[to]??=[]).push(clone(s.model));s.model=s[from].pop();s.nodeId='';s.edgeId='';s.from='';title.value=s.model.title;mark();}
 function hintText(){hint.textContent=s.connect?(s.from?tr('Select the destination node.','Chọn đối tượng đích.'):tr('Select the source node.','Chọn đối tượng nguồn.')):tr('Click a shape to edit. Drag to move. Use Connect to link two shapes.','Bấm hình để sửa. Kéo để di chuyển. Dùng Nối để liên kết hai hình.');}
 function historyButtons(){undo.disabled=!s.undo?.length;redo.disabled=!s.redo?.length;hintText();}

 left.append(remove);
 function blocked(){return pending||!result?.layout||result.findings.some(f=>f.level==='error')||!svg;}
 function disableExports(){svg='';for(const b of [svgButton,pngButton,xmlButton,save])b.disabled=true;}
 function setZoom(){if(!currentSvg||!result?.layout)return;if(s.fit)s.zoom=Math.min(1,Math.max(.12,(canvas.clientWidth-12)/result.layout.width),Math.max(.12,570/result.layout.height));currentSvg.setAttribute('width',String(Math.round(result.layout.width*s.zoom)));currentSvg.setAttribute('height',String(Math.round(result.layout.height*s.zoom)));}
 zoom.addEventListener('change',()=>{s.fit=zoom.value==='fit';if(!s.fit)s.zoom=Number(zoom.value);setZoom();});
 function mark(rebuildForm=true){s.dirty=true;draft.textContent=t('Draft not saved');disableExports();if(rebuildForm)rebuild();historyButtons();render(rebuildForm?0:180);}
 function render(delay=0){
  clearTimeout(timer);worker?.terminate();worker=null;const token=++epoch;pending=true;disableExports();
  metrics.textContent=tr('Updating preview…','Đang cập nhật sơ đồ…');canvas.setAttribute('aria-busy','true');
  timer=setTimeout(()=>{
   if(!canvas.isConnected||token!==epoch)return;
   const model=clone(s.model),fallback=()=>{try{const result=layoutDiagram(model,{draft:true});paint({result,svg:result.layout?renderSvg(model,result):''},token);}catch(e){paint({error:e.message},token);}};
   try{const instance=new Worker('/src/diagram.mjs',{type:'module'});worker=instance;instance.onmessage=({data})=>{instance.terminate();if(worker===instance)worker=null;paint(data,token);};instance.onerror=()=>{instance.terminate();if(worker===instance)worker=null;if(token===epoch)fallback();};instance.postMessage({model});}catch{fallback();}
  },delay);
 }
 function paint(data,token){
  if(token!==epoch||!canvas.isConnected)return;
  pending=false;canvas.setAttribute('aria-busy','false');err.textContent='';canvas.replaceChildren();findings.replaceChildren();currentSvg=null;
  try{
   if(data.error)throw Error(data.error);result=data.result;
   if(result.layout){svg=data.svg;const parsed=new DOMParser().parseFromString(svg,'image/svg+xml');if(parsed.querySelector('parsererror'))throw Error('Diagram export blocked by validation errors.');currentSvg=document.importNode(parsed.documentElement,true);canvas.append(currentSvg);setZoom();
    // Browser font measurement in SVG user units. Do not rely on character count alone.
    const nodes=new Map(result.layout.nodes.map(n=>[n.id,n]));for(const text of currentSvg.querySelectorAll('text')){
      const b=text.getBBox(),id=text.getAttribute('data-node'),n=nodes.get(id);
      if(b.x<0||b.y<0||b.x+b.width>result.layout.width||b.y+b.height>result.layout.height)result.findings.push({code:'V007',level:'error',message:'Text exceeds canvas: '+text.textContent});
      if(n&&(b.x<n.x+3||b.x+b.width>n.x+n.w-3||b.y<n.y+2||b.y+b.height>n.y+n.h-2))result.findings.push({code:'V008',level:'error',message:'Text exceeds node: '+id});
      if(n?.type==='usecase'){const cx=n.x+n.w/2,cy=n.y+n.h/2;for(const x of [b.x,b.x+b.width])for(const y of [b.y,b.y+b.height])if(((x-cx)/(n.w/2-4))**2+((y-cy)/(n.h/2-4))**2>1){result.findings.push({code:'V009',level:'error',message:'Text exceeds ellipse: '+id});break;}}
    }
    // Interactive hit regions are added only to the live preview, never to exported SVG.
    const ns='http://www.w3.org/2000/svg';
    for(const n of result.layout.nodes){
     const hit=document.createElementNS(ns,'rect');for(const [k,v] of Object.entries({x:n.x,y:n.y,width:n.w,height:n.h,rx:4,fill:'transparent',stroke:n.id===s.nodeId?'#2563eb':'transparent','stroke-width':2,tabindex:0,role:'button','aria-label':n.label}))hit.setAttribute(k,String(v));
     hit.setAttribute('data-hit-id',n.id);hit.classList.add('diagram-hit');currentSvg.append(hit);
     const activate=()=>{if(pending)return;if(s.connect){connectNode(n.id);return;}s.nodeId=n.id;s.edgeId='';rebuild();for(const h of currentSvg.querySelectorAll('.diagram-hit'))h.setAttribute('stroke',h===hit?'#2563eb':'transparent');};
     hit.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();activate();}});
     hit.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();hit.setPointerCapture(e.pointerId);const x=e.clientX,y=e.clientY;
      const move=ev=>{if(s.connect||s.model.kind==='sequence')return;hit.setAttribute('transform','translate('+((ev.clientX-x)/s.zoom)+' '+((ev.clientY-y)/s.zoom)+')');};hit.addEventListener('pointermove',move);hit.addEventListener('pointercancel',()=>{hit.removeEventListener('pointermove',move);hit.removeAttribute('transform');},{once:true});
      hit.addEventListener('pointerup',end=>{hit.removeEventListener('pointermove',move);hit.removeAttribute('transform');const dx=(end.clientX-x)/s.zoom,dy=(end.clientY-y)/s.zoom;
       if(pending)return;if(s.connect||s.model.kind==='sequence'||Math.abs(dx)+Math.abs(dy)<5){activate();return;}
       const modelNode=s.model.nodes.find(q=>q.id===n.id);if(!modelNode)return;remember(s);modelNode.position={x:Math.max(10,Math.min(20000,Math.round(n.x+dx))),y:Math.max(100,Math.min(20000,Math.round(n.y+dy)))};s.nodeId=n.id;mark();
      },{once:true});
     });
    }
    metrics.textContent=t('Node count')+': '+result.layout.nodes.length+' · '+t('Connections')+': '+result.layout.edges.length+' · '+t('Crossings')+': '+result.layout.crossings+' · '+result.layout.width+' × '+result.layout.height;
   }else metrics.textContent='';
   reviewTitle.textContent=tr('Diagram checks','Kiểm tra sơ đồ')+' · '+result.findings.filter(f=>f.level==='error').length+' '+tr('errors','lỗi');review.open=false;
   for(const f of result.findings){const p=$('p',f.code+' · '+t(f.level)+' — '+t(f.message));p.className=f.level;findings.append(p);}
   if(!result.findings.length)findings.append($('p',t('No findings.')));
   svgButton.disabled=pngButton.disabled=save.disabled=blocked();xmlButton.disabled=blocked()||s.model.kind!=='bpmn';remove.disabled=!s.id;
  }catch(e){err.textContent=t(e.message);disableExports();}
 }
 function section(label,open=true){const d=$('details'),summary=$('summary',t(label));d.open=open;d.append(summary);editor.append(d);return d;}
 function connectNode(id){
  const m=s.model;if(!s.from){s.from=id;s.nodeId=id;for(const h of currentSvg?.querySelectorAll('.diagram-hit')??[])h.setAttribute('stroke',h.getAttribute('data-hit-id')===id?'#2563eb':'transparent');hintText();return;}
  const from=s.from;s.from='';if(from===id){hintText();return;}
  const a=m.nodes.find(n=>n.id===from),b=m.nodes.find(n=>n.id===id);let type=s.relation||relations[m.kind][0][0];
  if(m.kind==='uml'&&type==='association'&&a.type===b.type){alert(tr('Choose an actor and a use case, or change relationship type.','Chọn actor và use case, hoặc đổi kiểu quan hệ.'));hintText();return;}
  if(m.kind==='uml'&&((['include','extend'].includes(type)&&(a.type!=='usecase'||b.type!=='usecase'))||(type==='generalization'&&a.type!==b.type))){alert(tr('These shapes do not support this relationship.','Hai đối tượng không hỗ trợ quan hệ này.'));hintText();return;}
  if(['bpmn','activity'].includes(m.kind)&&(a.type==='end'||b.type==='start')){alert(tr('Cannot connect from End or into Start.','Không nối từ Kết thúc hoặc vào Bắt đầu.'));hintText();return;}
  if(m.edges.length>=120){alert(tr('Connection limit reached.','Đã đạt giới hạn đường nối.'));return;}
  if(m.kind!=='sequence'&&m.edges.some(e=>e.type===type&&(e.from===from&&e.to===id||type==='association'&&e.from===id&&e.to===from))){hintText();return;}
  const r={id:nextId(m.edges,'edge'),from,to:id,type};
  if(m.kind==='erd')Object.assign(r,{fromCard:'1',toCard:'0..*'});
  if(m.kind==='sequence'){const label=prompt(tr('Message name','Tên thông điệp'),tr('Request','Yêu cầu'));if(!label?.trim()){hintText();return;}r.label=label.trim().slice(0,80);}
  remember(s);m.edges.push(r);s.edgeId=r.id;s.nodeId='';s.connect=false;mark();
 }
 function rebuild(){
  editor.replaceChildren();palette.replaceChildren();const m=s.model;
  palette.append($('small',tr('ADD SHAPE','THÊM ĐỐI TƯỢNG')));
  const quick=$('div');quick.className='diagram-shapes';palette.append(quick);
  const symbols={actor:'♙',usecase:'⬭',start:'○',end:'◎',task:'▭',exclusive:'◇',parallel:'◇',inclusive:'◇',intermediate:'◉',entity:'▤',participant:'▣'};
  for(const [type,label] of types[m.kind])quick.append(button((symbols[type]||'▭')+' '+t(label),()=>{
   if(m.nodes.length>=60){err.textContent=tr('Node limit reached.','Đã đạt giới hạn đối tượng.');return;}
   const n={id:nextId(m.nodes,'node'),type,label:t(label)+' '+(m.nodes.filter(x=>x.type===type).length+1)};
   if(['bpmn','activity'].includes(m.kind))n.lane=m.nodes.find(x=>x.id===s.nodeId)?.lane??m.lanes[0]?.id;
   if(type==='actor')n.side='left';if(type==='entity')n.attributes=[{name:'id',type:'UUID',key:'PK'}];
   remember(s);m.nodes.push(n);s.nodeId=n.id;s.edgeId='';s.connect=false;mark();editor.querySelector('.node-label-input')?.focus();
  }));
  const tools=$('div');tools.className='diagram-toolbar';const rel=list(relations[m.kind].map(([v,l])=>[v,t(l)]),s.relation);s.relation=rel.value;rel.setAttribute('aria-label',tr('Relationship type','Loại đường nối'));rel.addEventListener('change',()=>{s.relation=rel.value;s.from='';hintText();});
  tools.append(button(s.connect?tr('Cancel connect','Hủy nối'):tr('Connect','Nối đối tượng'),()=>{s.connect=!s.connect;s.from='';rebuild();hintText();},s.connect?'primary':''),rel);palette.append(tools);

  if(['bpmn','activity'].includes(m.kind)){
   const d=section('Lane',!!s.lanesOpen),listBox=$('div');d.append(listBox);d.addEventListener('toggle',()=>{s.lanesOpen=d.open;});
   for(const lane of m.lanes){const row=$('div');row.className='diagram-toolbar';const label=input(lane.label);label.maxLength=80;label.addEventListener('change',()=>{remember(s);lane.label=label.value;mark();});const del=button('Remove',()=>{if(m.nodes.some(n=>n.lane===lane.id)){err.textContent='D006 · '+t('Missing lane')+': '+lane.id;return;}if(m.lanes.length<=1)return;remember(s);m.lanes=m.lanes.filter(l=>l.id!==lane.id);mark();});row.append(label,del);listBox.append(row);}
   d.append(button('Add lane',()=>{if(m.lanes.length>=8)return;remember(s);m.lanes.push({id:nextId(m.lanes,'lane'),label:t('Lane')+' '+(m.lanes.length+1)});mark();}));
  }
  const d=section(tr('Shape properties','Thuộc tính đối tượng')),picker=list([['',tr('Select a shape','Chọn đối tượng')],...m.nodes.map(n=>[n.id,n.label])],s.nodeId||'');
  if(!m.nodes.some(n=>n.id===s.nodeId))picker.value='';
  const form=$('div');form.className='diagram-form';d.append(picker,form);
  function nodeForm(){
   form.replaceChildren();const selected=m.nodes.find(n=>n.id===picker.value);if(!selected){form.append($('p',tr('Select a shape on the canvas to edit it.','Bấm một hình trên bản vẽ để sửa.')));return;}const n=selected,type=list(types[m.kind].map(([v,l])=>[v,t(l)]),n?.type??types[m.kind][0][0]),label=input(n?.label??'');label.maxLength=160;label.className='node-label-input';let renaming=false;label.addEventListener('input',()=>{const value=label.value.trim();if(!value||value===n.label)return;if(!renaming){remember(s);renaming=true;}n.label=value;mark(false);});label.addEventListener('blur',()=>{renaming=false;if(!label.value.trim())label.value=n.label;const option=[...picker.options].find(o=>o.value===n.id);if(option)option.textContent=n.label;});
   const row=input(n?.row??'','number');row.min=0;row.max=59;const lane=list((m.lanes??[]).map(l=>[l.id,l.label]),n?.lane),side=list([['left',t('Left')],['right',t('Right')]],n?.side??'left'),ref=input(n?.ref??'');ref.maxLength=64;
   form.append(field('Node label',label),field('Node type',type));const advanced=$('details');advanced.append($('summary',tr('Advanced positioning','Vị trí nâng cao')),field('Row (optional)',row),field('Reference',ref));if(['bpmn','activity'].includes(m.kind))form.append(field('Lane',lane));else if(m.kind==='uml'&&(!n||n.type==='actor'))form.append(field('Actor side',side));
   let attrRows=[];
   if(m.kind==='erd'){const attrsBox=$('div');attrsBox.className='attribute-editor';const drawAttrs=()=>{attrsBox.replaceChildren($('small',tr('Attributes','Thuộc tính')));for(const a of attrRows){const line=$('div');line.className='attribute-row';line.append(a.name,a.type,a.key,button('×',()=>{if(attrRows.length>1){attrRows=attrRows.filter(x=>x!==a);drawAttrs();}}));attrsBox.append(line);}attrsBox.append(button(tr('Add attribute','Thêm thuộc tính'),()=>{if(attrRows.length<30){addAttr({name:'',type:'VARCHAR',key:''});drawAttrs();}}));};function addAttr(a){const name=input(a.name),type=input(a.type),key=list([['','—'],['PK','PK'],['FK','FK'],['PK/FK','PK/FK']],a.key);name.placeholder=tr('Name','Tên');type.placeholder=tr('Data type','Kiểu dữ liệu');name.setAttribute('aria-label',tr('Attribute name','Tên thuộc tính'));type.setAttribute('aria-label',tr('Attribute type','Kiểu thuộc tính'));key.setAttribute('aria-label',tr('Key','Khóa'));attrRows.push({name,type,key});}for(const a of n?.attributes??[{name:'id',type:'UUID',key:'PK'}])addAttr(a);drawAttrs();form.append(attrsBox);}
   form.append(advanced);
   form.append(button(n?tr('Apply changes','Áp dụng thay đổi'):'Add node',()=>{const record={id:n?.id??nextId(m.nodes,'node'),type:type.value,label:label.value.trim()};if(row.value!==''&&m.kind!=='sequence')record.row=Number(row.value);if(n?.position)record.position=n.position;if(n?.col!==undefined)record.col=n.col;if(!n&&m.nodes.length>=60){err.textContent=tr('Node limit reached.','Đã đạt giới hạn đối tượng.');return;}if(!record.label){err.textContent=tr('Enter a shape name.','Nhập tên đối tượng.');return;}if(m.kind==='erd'){record.attributes=attrRows.map(a=>({name:a.name.value.trim(),type:a.type.value.trim(),key:a.key.value}));if(record.attributes.some(a=>!a.name||!a.type)||new Set(record.attributes.map(a=>a.name)).size!==record.attributes.length){err.textContent=tr('Enter unique attribute names and data types.','Nhập tên thuộc tính không trùng và kiểu dữ liệu.');return;}}if(ref.value.trim())record.ref=ref.value.trim();if(['bpmn','activity'].includes(m.kind))record.lane=lane.value;else if(type.value==='actor')record.side=side.value;remember(s);if(n)m.nodes=m.nodes.map(x=>x.id===n.id?record:x);else m.nodes.push(record);s.nodeId=record.id;mark();}));
   if(n?.position)form.append(button('Reset position',()=>{remember(s);delete n.position;mark();}));
   if(n)form.append(button('Remove',()=>{if(m.nodes.length<=1){err.textContent=tr('Keep at least one shape.','Giữ ít nhất một đối tượng.');return;}remember(s);m.nodes=m.nodes.filter(x=>x.id!==n.id);m.edges=m.edges.filter(e=>e.from!==n.id&&e.to!==n.id);s.nodeId='';mark();}));
  }
  picker.addEventListener('change',()=>{s.nodeId=picker.value;nodeForm();});nodeForm();
  const e=section('Connections',!!s.edgeId),ep=list([['',t('Add connection')],...m.edges.map(e=>[e.id,(m.nodes.find(n=>n.id===e.from)?.label??e.from)+' → '+(m.nodes.find(n=>n.id===e.to)?.label??e.to)])],s.edgeId||'');if(!m.edges.some(x=>x.id===s.edgeId))ep.value='';
  const ef=$('div');ef.className='diagram-form';e.append(ep,ef);
  function edgeForm(){ef.replaceChildren();const old=m.edges.find(x=>x.id===ep.value),opts=m.nodes.map(n=>[n.id,n.label]),from=list(opts,old?.from),to=list(opts,old?.to??opts[1]?.[0]),type=list(relations[m.kind].map(([v,l])=>[v,t(l)]),old?.type),label=input(old?.label??'');label.maxLength=80;
   const cards=['1','0..1','0..*','1..*'].map(v=>[v,v]),fromCard=list(cards,old?.fromCard??'1'),toCard=list(cards,old?.toCard??'0..*');if(m.kind==='erd')ef.append(field('From cardinality',fromCard),field('To cardinality',toCard));
   ef.append(field('From',from),field('To',to),field('Relationship',type),field('Connection label',label),button(old?'Edit':'Add connection',()=>{const r={id:old?.id??nextId(m.edges,'edge'),from:from.value,to:to.value,type:type.value,...(label.value.trim()?{label:label.value.trim()}: {})};if(m.kind==='erd'){r.fromCard=fromCard.value;r.toCard=toCard.value;}if(!old&&m.edges.length>=120){err.textContent=tr('Connection limit reached.','Đã đạt giới hạn đường nối.');return;}if(r.from===r.to||!r.from||!r.to){err.textContent=tr('Choose two different shapes.','Chọn hai đối tượng khác nhau.');return;}remember(s);if(old)m.edges=m.edges.map(x=>x.id===old.id?r:x);else m.edges.push(r);s.edgeId=r.id;mark();}));if(old)ef.append(button('Remove',()=>{remember(s);m.edges=m.edges.filter(x=>x.id!==old.id);s.edgeId='';mark();}));}
  ep.addEventListener('change',()=>{s.edgeId=ep.value;edgeForm();});edgeForm();
  const raw=section('Model JSON',false);const source=$('textarea');source.value='';raw.addEventListener('toggle',()=>{if(raw.open)source.value=JSON.stringify(s.model,null,2);});source.setAttribute('aria-label',t('Model JSON'));raw.append(source,button('Update preview',()=>{try{const parsed=JSON.parse(source.value);if(!parsed||validateDiagram(parsed).some(f=>f.level==='error'))throw Error('Model JSON is invalid.');remember(s);s.model=parsed;title.value=parsed.title??'';mark();}catch(e){err.textContent=t(e.message);}}));
 }
 rebuild();historyButtons();render();
}
