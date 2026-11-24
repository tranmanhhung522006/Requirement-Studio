// Deterministic, dependency-free renderer. No user text is interpreted as SVG or XML.
const ID=/^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const TYPES={uml:['actor','usecase'],bpmn:['start','end','task','exclusive','parallel']};
const RELS={uml:['association','include','extend','generalization'],bpmn:['sequence']};
const esc=s=>String(s??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&apos;");
const validText=(s,max=160)=>typeof s==='string'&&s.trim()&&s.length<=max;
const fail=(code,message)=>({code,level:'error',message});
const warn=(code,message)=>({code,level:'warning',message});
export function validateDiagram(m){
 const f=[];
 if(!m||!Object.hasOwn(TYPES,m.kind)||!validText(m.title)||!Array.isArray(m.nodes)||!Array.isArray(m.edges)||!Array.isArray(m.lanes??[]))return [fail('D001','Invalid diagram schema.')];
 if(!m.nodes.length||m.nodes.length>60||m.edges.length>120||(m.lanes??[]).length>8)return [fail('D002','Use 1–60 nodes, at most 120 connections and 8 lanes.')];
 const nodes=new Map(),lanes=new Set(),edges=new Set(),pairs=new Set();
 for(const l of m.lanes??[]){if(!l||!ID.test(l.id??'')||!validText(l.label,80)||lanes.has(l.id))f.push(fail('D003','Invalid or duplicate lane.'));else lanes.add(l.id);}
 for(const n of m.nodes){
  if(!n||!ID.test(n.id??'')||nodes.has(n.id)||!TYPES[m.kind].includes(n.type)||!validText(n.label,160)){f.push(fail('D004','Invalid or duplicate node.'));continue;}
  if(n.row!==undefined&&(!Number.isInteger(n.row)||n.row<0||n.row>59))f.push(fail('D005','Invalid row: '+n.id));
  if(n.side!==undefined&&!['left','right'].includes(n.side))f.push(fail('D005','Invalid actor side: '+n.id));
  if(n.ref!==undefined&&(!validText(n.ref,64)))f.push(fail('D005','Invalid artifact reference: '+n.id));
  if(m.kind==='bpmn'&&!lanes.has(n.lane))f.push(fail('D006','Missing lane: '+n.id));
  nodes.set(n.id,n);
 }
 if(m.kind==='bpmn'&&!lanes.size)f.push(fail('D006','BPMN requires at least one lane.'));
 if(m.kind==='uml'&&lanes.size)f.push(fail('D006','UML use-case diagrams do not use lanes.'));
 for(const e of m.edges){
  if(!e||!ID.test(e.id??'')||edges.has(e.id)||!RELS[m.kind].includes(e.type)||!nodes.has(e.from)||!nodes.has(e.to)||e.from===e.to||(e.label!==undefined&&(typeof e.label!=='string'||e.label.length>80))){f.push(fail('D007','Invalid connection.'));continue;}
  edges.add(e.id);const a=nodes.get(e.from),b=nodes.get(e.to);
  const key=e.type+':'+(e.type==='association'?[e.from,e.to].sort().join(':'):e.from+':'+e.to);
  if(pairs.has(key))f.push(fail('D008','Duplicate relationship: '+e.id));pairs.add(key);
  if(m.kind==='uml'){
   if(e.type==='association'&&a.type===b.type)f.push(fail('D009','Association must connect an actor and a use case: '+e.id));
   if(['include','extend'].includes(e.type)&&(a.type!=='usecase'||b.type!=='usecase'))f.push(fail('D010','Include/extend requires two use cases: '+e.id));
   if(e.type==='generalization'&&a.type!==b.type)f.push(fail('D010','Generalization requires matching node types: '+e.id));
  }else if(a.type==='end'||b.type==='start')f.push(fail('D011','Sequence flow cannot leave an end or enter a start event: '+e.id));
 }
 if(f.some(x=>x.level==='error'))return f;
 const next=id=>m.edges.filter(e=>e.from===id).map(e=>e.to),prev=id=>m.edges.filter(e=>e.to===id);
 const walk=(starts,adj)=>{const seen=new Set(starts),q=[...starts];for(let i=0;i<q.length;i++)for(const n of adj(q[i]))if(!seen.has(n)){seen.add(n);q.push(n);}return seen;};
 if(m.kind==='bpmn'){
  const starts=m.nodes.filter(n=>n.type==='start'),ends=m.nodes.filter(n=>n.type==='end');
  if(!starts.length||!ends.length)f.push(fail('D012','At least one start and end event are required.'));
  const reach=walk(starts.map(n=>n.id),next),canEnd=walk(ends.map(n=>n.id),id=>prev(id).map(e=>e.from));
  for(const n of m.nodes){
   const out=m.edges.filter(e=>e.from===n.id),incoming=prev(n.id);
   if(!reach.has(n.id)||!canEnd.has(n.id))f.push(fail('D013','Node is not on a start-to-end path: '+n.id));
   if(n.type==='start'&&!out.length)f.push(fail('D014','Start event requires outgoing flow.'));
   if(['exclusive','parallel'].includes(n.type)&&incoming.length<2&&out.length<2)f.push(fail('D015','Gateway must split or merge: '+n.id));
   if(n.type==='exclusive'&&out.length>1&&out.some(e=>!e.label?.trim()))f.push(warn('D016','Name each exclusive branch: '+n.id));
   if(n.type==='parallel'&&out.some(e=>e.label?.trim()))f.push(warn('D017','Parallel branches should not imply conditions: '+n.id));
  }
 }else{
  const rel=m.edges.filter(e=>['include','generalization'].includes(e.type));
  for(const e of rel)if(walk([e.to],id=>rel.filter(x=>x.type===e.type&&x.from===id).map(x=>x.to)).has(e.from))f.push(fail('D018','Circular dependency: '+e.id));
  for(const n of m.nodes)if(!m.edges.some(e=>e.from===n.id||e.to===n.id))f.push(warn('D019','Unconnected node: '+n.id));
  if(!m.nodes.some(n=>n.type==='actor')||!m.nodes.some(n=>n.type==='usecase'))f.push(fail('D020','A use-case diagram requires actors and use cases.'));
 }
 return f;
}
// Conservative text budget, checked with real font metrics in the browser before export.
export function wrapText(s,max=24){
 const result=[];let line='';
 for(const word of s.trim().split(/\s+/u)){
  const pieces=[];let part='';for(const ch of word){if([...part].length>=max){pieces.push(part);part='';}part+=ch;}if(part)pieces.push(part);
  for(const p of pieces){if(line&&[...line+' '+p].length>max){result.push(line);line='';}line+=(line?' ':'')+p;}
 }if(line)result.push(line);return result;
}
const rect=(x,y,w,h)=>({x,y,w,h});
const inflate=(r,p)=>rect(r.x-p,r.y-p,r.w+2*p,r.h+2*p);
const inside=(p,r)=>p.x>r.x&&p.x<r.x+r.w&&p.y>r.y&&p.y<r.y+r.h;
const overlap=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
const same=(a,b)=>a.x===b.x&&a.y===b.y;
const segmentHits=(a,b,r)=>a.x===b.x?a.x>r.x&&a.x<r.x+r.w&&Math.max(a.y,b.y)>r.y&&Math.min(a.y,b.y)<r.y+r.h:a.y===b.y?a.y>r.y&&a.y<r.y+r.h&&Math.max(a.x,b.x)>r.x&&Math.min(a.x,b.x)<r.x+r.w:true;
function intersects(a,b,c,d){
 if(a.x===b.x&&c.y===d.y)return a.x>Math.min(c.x,d.x)&&a.x<Math.max(c.x,d.x)&&c.y>Math.min(a.y,b.y)&&c.y<Math.max(a.y,b.y);
 if(a.y===b.y&&c.x===d.x)return intersects(c,d,a,b);
 return false;
}
function simplify(p){const out=[];for(const a of p){if(out.length&&same(out.at(-1),a))continue;const b=out.at(-1),c=out.at(-2);if(c&&((c.x===b.x&&b.x===a.x)||(c.y===b.y&&b.y===a.y)))out.pop();out.push(a);}return out;}
function place(m){
 const nodes=[],w=280,pad=48,head=100,rowGap=72;
 const mk=(n,x,y,width,lines,h)=>({...n,x,y,w:width,h,lines});
 const autoRows=new Map();if(m.kind==='bpmn'){
  const q=m.nodes.filter(n=>n.type==='start').map(n=>n.id);q.forEach(id=>autoRows.set(id,0));
  for(let i=0;i<q.length;i++)for(const e of m.edges.filter(e=>e.from===q[i]))if(!autoRows.has(e.to)){autoRows.set(e.to,autoRows.get(q[i])+1);q.push(e.to);}
 }
 const used=new Set(),assigned=[];
 const content=m.nodes.filter(n=>n.type!=='actor');
 for(const n of content){
  const lines=wrapText(n.label,24);
  const col=m.kind==='bpmn'?m.lanes.findIndex(l=>l.id===n.lane):(['include','extend'].some(k=>m.edges.some(e=>e.type===k&&e.to===n.id))?1:0);
  let row=n.row??(m.kind==='bpmn'?(autoRows.get(n.id)??0):0);
  while(used.has(col+':'+row))row++;used.add(col+':'+row);
  const h=m.kind==='uml'?Math.max(86,lines.length*21+44):n.type==='task'?Math.max(68,lines.length*21+30):Math.max(100,lines.length*18+56);
  assigned.push({n,lines,col,row,h});
 }
 const rows=Math.max(0,...assigned.map(x=>x.row))+1,heights=Array.from({length:rows},(_,i)=>Math.max(90,...assigned.filter(x=>x.row===i).map(x=>x.h)));
 const ys=[];let y=head+30;for(const h of heights){ys.push(y);y+=h+rowGap;}
 let boundary,width,height,lanes=[];
 if(m.kind==='bpmn'){
  width=pad*2+m.lanes.length*(w+100);height=y+20;boundary=rect(pad,60,width-pad*2,height-90);
  lanes=m.lanes.map((l,i)=>({...l,...rect(pad+i*(w+100),60,w+100,height-90)}));
  for(const a of assigned){const cx=lanes[a.col].x+(w+100)/2;const nw=a.n.type==='task'?w:200;nodes.push(mk(a.n,cx-nw/2,ys[a.row]+(heights[a.row]-a.h)/2,nw,a.lines,a.h));}
 }else{
  const cols=assigned.some(x=>x.col===1)?2:1, bw=cols*(w+130)+20;
  width=bw+440;const actors=m.nodes.filter(n=>n.type==='actor');height=Math.max(y+20,160+Math.max(actors.filter(n=>n.side!=='right').length,actors.filter(n=>n.side==='right').length)*160);
  boundary=rect(220,60,bw,height-90);
  for(const a of assigned)nodes.push(mk(a.n,boundary.x+75+a.col*(w+130),ys[a.row]+(heights[a.row]-a.h)/2,w,a.lines,a.h));
  for(const side of ['left','right']){const group=actors.filter(n=>(n.side??'left')===side);group.forEach((n,i)=>{const lines=wrapText(n.label,16),h=78+lines.length*20;nodes.push(mk(n,side==='left'?30:width-190,100+(height-200)*(i+.5)/group.length-h/2,160,lines,h));});}
 }
 return {width,height,boundary,lanes,nodes};
}
function ports(n){
 const cx=n.x+n.w/2,cy=n.y+n.h/2;
 if(n.type==='actor')return [{a:{x:cx-25,y:n.y+36},b:{x:n.x-18,y:n.y+36},dir:1},{a:{x:cx+25,y:n.y+36},b:{x:n.x+n.w+18,y:n.y+36},dir:1}];
 // Bounding box also includes event/gateway labels. Side connectors use actual symbol, not its text box.
 if(['start','end','exclusive','parallel'].includes(n.type)){
  const r=['start','end'].includes(n.type)?18:24,sy=n.y+27;
  return [{a:{x:cx-r,y:sy},b:{x:n.x-18,y:sy},dir:1},{a:{x:cx+r,y:sy},b:{x:n.x+n.w+18,y:sy},dir:1},{a:{x:cx,y:sy-r},b:{x:cx,y:n.y-18},dir:2}];
 }
 return [{a:{x:n.x,y:cy},b:{x:n.x-18,y:cy},dir:1},{a:{x:n.x+n.w,y:cy},b:{x:n.x+n.w+18,y:cy},dir:1},{a:{x:cx,y:n.y},b:{x:cx,y:n.y-18},dir:2},{a:{x:cx,y:n.y+n.h},b:{x:cx,y:n.y+n.h+18},dir:2}];
}
class Heap{
 a=[];push(item){const a=this.a;a.push(item);let i=a.length-1;while(i){const p=(i-1)>>1;if(a[p][0]<=item[0])break;a[i]=a[p];i=p;}a[i]=item;}
 pop(){const a=this.a,first=a[0],last=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let j=i*2+1;if(j+1<a.length&&a[j+1][0]<a[j][0])j++;if(a[j][0]>=last[0])break;a[i]=a[j];i=j;}a[i]=last;}return first;}
}
function router(layout){
 const obstacles=layout.nodes.map(n=>inflate(n,9)),all=layout.nodes.flatMap(ports);
 const xs=[...new Set([12,layout.width-12,...obstacles.flatMap(r=>[r.x,r.x+r.w]),...all.map(p=>p.b.x)])].sort((a,b)=>a-b);
 const ys=[...new Set([92,layout.height-12,...obstacles.flatMap(r=>[r.y,r.y+r.h]),...all.map(p=>p.b.y)])].sort((a,b)=>a-b);
 const W=xs.length,H=ys.length,index=p=>ys.indexOf(p.y)*W+xs.indexOf(p.x),point=i=>({x:xs[i%W],y:ys[Math.floor(i/W)]});
 const blocked=Array.from({length:W*H},(_,i)=>{const p=point(i);return obstacles.some(r=>inside(p,r));});
 const adjacent=new Map();
 function adj(i){if(adjacent.has(i))return adjacent.get(i);const x=i%W,y=Math.floor(i/W),p=point(i),a=[];for(const [j,dir,ok] of [[i-1,1,x>0],[i+1,1,x<W-1],[i-W,2,y>0],[i+W,2,y<H-1]])if(ok&&!blocked[j]){const q=point(j);if(!obstacles.some(r=>segmentHits(p,q,r)))a.push([j,dir,Math.abs(q.x-p.x)+Math.abs(q.y-p.y)]);}adjacent.set(i,a);return a;}
 const existing=[];
 function route(from,to){
  const source=ports(from).filter(p=>!blocked[index(p.b)]),target=ports(to).filter(p=>!blocked[index(p.b)]),targets=new Map(target.map(p=>[index(p.b),p]));
  if(!source.length||!target.length)return null;
  const heap=new Heap(),dist=new Map(),prev=new Map(),orig=new Map();
  for(const p of source){const k=index(p.b)*3+p.dir;dist.set(k,0);orig.set(k,p);heap.push([0,k]);}
  let finish=null;
  while(heap.a.length){
   const [cost,k]=heap.pop();if(cost!==dist.get(k))continue;
   const i=Math.floor(k/3),dir=k%3;
   if(targets.has(i)){finish=k;break;}
   const a=point(i);
   for(const [j,d,len] of adj(i)){const b=point(j);let penalty=0;for(const [c,e] of existing){if(intersects(a,b,c,e))penalty+=95;else if(a.x===b.x&&c.x===e.x&&a.x===c.x&&Math.min(Math.max(a.y,b.y),Math.max(c.y,e.y))>Math.max(Math.min(a.y,b.y),Math.min(c.y,e.y)))penalty+=28;else if(a.y===b.y&&c.y===e.y&&a.y===c.y&&Math.min(Math.max(a.x,b.x),Math.max(c.x,e.x))>Math.max(Math.min(a.x,b.x),Math.min(c.x,e.x)))penalty+=28;}
    const nk=j*3+d,nc=cost+len+(dir===d?0:32)+penalty;if(nc<(dist.get(nk)??Infinity)){dist.set(nk,nc);prev.set(nk,k);heap.push([nc,nk]);}}
  }
  if(finish===null)return null;const tail=targets.get(Math.floor(finish/3)),path=[];let k=finish;while(k!==undefined){path.push(point(Math.floor(k/3)));if(!prev.has(k))break;k=prev.get(k);}const start=orig.get(k);if(!start)return null;
  const points=simplify([start.a,...path.reverse(),tail.a]);
  for(let i=1;i<points.length;i++)existing.push([points[i-1],points[i]]);
  return points;
 }
 return route;
}
function segments(p){return p.slice(1).map((b,i)=>[p[i],b]);}
function labelBox(edge,layout,labels,all){
 const text=edge.type==='include'?'«include»':edge.type==='extend'?'«extend»':edge.label||'';
 if(!text)return null;const lines=wrapText(text,22),w=Math.max(...lines.map(l=>[...l].length))*9+14,h=lines.length*19+8;
 const candidates=segments(edge.points).sort((a,b)=>(Math.abs(b[1].x-b[0].x)+Math.abs(b[1].y-b[0].y))-(Math.abs(a[1].x-a[0].x)+Math.abs(a[1].y-a[0].y)));
 for(const [a,b] of candidates)for(const frac of [.5,.3,.7])for(const side of [-1,1]){
  const x=a.x+(b.x-a.x)*frac,y=a.y+(b.y-a.y)*frac,r=a.y===b.y?rect(x-w/2,y+(side<0?-h-7:7),w,h):rect(x+(side<0?-w-7:7),y-h/2,w,h);
  if(r.x<8||r.y<94||r.x+r.w>layout.width-8||r.y+r.h>layout.height-8)continue;
  if(layout.nodes.some(n=>overlap(inflate(n,5),r))||labels.some(l=>overlap(inflate(l,4),r))||all.some(s=>segmentHits(s[0],s[1],inflate(r,3))))continue;
  return {...r,lines};
 }return null;
}
export function layoutDiagram(m){
 const findings=validateDiagram(m);if(findings.some(f=>f.level==='error'))return {findings,layout:null};
 const layout=place(m),route=router(layout),byId=new Map(layout.nodes.map(n=>[n.id,n])),edges=[];
 // Process primary control flows/associations before secondary dependencies.
 for(const e of [...m.edges].sort((a,b)=>Number(!['association','sequence'].includes(a.type))-Number(!['association','sequence'].includes(b.type)))){
  const points=route(byId.get(e.from),byId.get(e.to));if(!points){findings.push(fail('V001','Could not route connection: '+e.id));continue;}edges.push({...e,points});
 }
 const labels=[],all=edges.flatMap(e=>segments(e.points));
 for(const e of edges){e.labelBox=labelBox(e,layout,labels,all);if(e.labelBox)labels.push(e.labelBox);else if(e.label||['include','extend'].includes(e.type))findings.push(fail('V002','No safe label placement: '+e.id));}
 for(let i=0;i<layout.nodes.length;i++)for(let j=i+1;j<layout.nodes.length;j++)if(overlap(layout.nodes[i],layout.nodes[j]))findings.push(fail('V003','Nodes overlap: '+layout.nodes[i].id+' / '+layout.nodes[j].id));
 for(const e of edges)for(const n of layout.nodes)if(n.id!==e.from&&n.id!==e.to&&segments(e.points).some(([a,b])=>segmentHits(a,b,n)))findings.push(fail('V004','Connection crosses unrelated node: '+e.id+' / '+n.id));
 let crossings=0;for(let i=0;i<edges.length;i++)for(let j=i+1;j<edges.length;j++)for(const [a,b] of segments(edges[i].points))for(const [c,d] of segments(edges[j].points))if(intersects(a,b,c,d))crossings++;
 if(crossings)findings.push(warn('V005',crossings+' edge crossing(s); consider splitting the diagram.'));
 if(layout.width>layout.height*1.5||layout.height>layout.width*1.8||layout.nodes.length>24)findings.push(warn('V006','Large diagram: consider separate views or landscape export.'));
 return {findings,layout:{...layout,edges,crossings}};
}
const txt=(lines,x,y,size=18,extra='')=>lines.map((s,i)=>'<text x="'+x+'" y="'+(y+i*(size+3))+'" font-size="'+size+'" text-anchor="middle" '+extra+'>'+esc(s)+'</text>').join('');
const box=(r,more='')=>'<rect x="'+r.x+'" y="'+r.y+'" width="'+r.w+'" height="'+r.h+'" '+more+'/>';
export function renderSvg(m,result=layoutDiagram(m)){
 if(!result.layout)throw Error('Diagram has structural errors.');
 const l=result.layout,parts=['<svg xmlns="http://www.w3.org/2000/svg" width="'+l.width+'" height="'+l.height+'" viewBox="0 0 '+l.width+' '+l.height+'" role="img"><title>'+esc(m.title)+'</title><defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0 L9 5 L0 10 Z" fill="#171717"/></marker><marker id="open" markerWidth="11" markerHeight="11" refX="10" refY="5.5" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0 L10 5.5 L0 11" fill="none" stroke="#171717"/></marker><marker id="triangle" markerWidth="15" markerHeight="14" refX="14" refY="7" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0 L14 7 L0 14 Z" fill="white" stroke="#171717"/></marker></defs><rect width="100%" height="100%" fill="white"/><g font-family="Times New Roman, Liberation Serif, serif" fill="#171717" stroke-linejoin="round" stroke-linecap="round">'];
 parts.push(txt(wrapText(m.title,65),l.width/2,34,23,'font-weight="bold"'));
 parts.push(box(l.boundary,'fill="none" stroke="#171717" stroke-width="1.5"'));
 if(m.kind==='bpmn')for(const lane of l.lanes){parts.push(box(lane,'fill="none" stroke="#777" stroke-width="1"'),box(rect(lane.x,lane.y,lane.w,34),'fill="#f1f1f1" stroke="#777"'),txt(wrapText(lane.label,34).slice(0,1),lane.x+lane.w/2,lane.y+23,17,'font-weight="bold"'));}
 for(const e of l.edges){const marker=e.type==='association'?'':e.type==='sequence'?'arrow':e.type==='generalization'?'triangle':'open';parts.push('<polyline points="'+e.points.map(p=>p.x+','+p.y).join(' ')+'" stroke="#171717" stroke-width="1.5" fill="none" '+(['include','extend'].includes(e.type)?'stroke-dasharray="6 4" ':'')+(marker?'marker-end="url(#'+marker+')"':'')+'/>');}
 for(const n of l.nodes){const cx=n.x+n.w/2,cy=n.y+n.h/2;
  if(n.type==='actor'){const y=n.y;parts.push('<g fill="none" stroke="#171717" stroke-width="1.6"><circle cx="'+cx+'" cy="'+(y+13)+'" r="11"/><path d="M'+cx+' '+(y+24)+' V'+(y+52)+' M'+(cx-25)+' '+(y+36)+' H'+(cx+25)+' M'+cx+' '+(y+52)+' l-20 22 M'+cx+' '+(y+52)+' l20 22"/></g>',txt(n.lines,cx,y+94,17));}
  else if(n.type==='usecase'){parts.push('<ellipse cx="'+cx+'" cy="'+cy+'" rx="'+n.w/2+'" ry="'+n.h/2+'" fill="white" stroke="#171717" stroke-width="1.5"/>',txt(n.lines,cx,cy-(n.lines.length-1)*10+6,18,'data-node="'+n.id+'"'));}
  else if(n.type==='task'){parts.push(box(n,'rx="9" fill="white" stroke="#171717" stroke-width="1.5"'),txt(n.lines,cx,cy-(n.lines.length-1)*10+6,18,'data-node="'+n.id+'"'));}
  else {const y=n.y+27;if(['start','end'].includes(n.type))parts.push('<circle cx="'+cx+'" cy="'+y+'" r="18" fill="white" stroke="#171717" stroke-width="'+(n.type==='end'?3.4:1.5)+'"/>');else{parts.push('<path d="M'+cx+' '+(y-24)+' l24 24 -24 24 -24 -24 Z" fill="white" stroke="#171717" stroke-width="1.5"/>');parts.push(n.type==='exclusive'?'<path d="M'+(cx-9)+' '+(y-9)+' l18 18 m-18 0 l18 -18" stroke="#171717" stroke-width="2.5"/>':'<path d="M'+(cx-11)+' '+y+' h22 M'+cx+' '+(y-11)+' v22" stroke="#171717" stroke-width="2.5"/>');}parts.push(txt(n.lines,cx,n.y+68,16,'data-node="'+n.id+'"'));}
 }
 for(const e of l.edges)if(e.labelBox){const b=e.labelBox;parts.push(box(b,'fill="white"'),txt(b.lines,b.x+b.w/2,b.y+17,16));}
 return parts.join('')+'</g></svg>';
}
export function exportBpmn(m,result=layoutDiagram(m)){
 if(m.kind!=='bpmn'||!result.layout||result.findings.some(f=>f.level==='error'))throw Error('Valid BPMN diagram required.');
 const l=result.layout,id=s=>'rs_'+s,attr=s=>esc(id(s)),bounds=r=>'<dc:Bounds x="'+r.x+'" y="'+r.y+'" width="'+r.w+'" height="'+r.h+'"/>';
 const type={start:'startEvent',end:'endEvent',task:'task',exclusive:'exclusiveGateway',parallel:'parallelGateway'};
 const nodes=m.nodes.map(n=>'<bpmn:'+type[n.type]+' id="'+attr(n.id)+'" name="'+esc(n.label)+'">'+m.edges.filter(e=>e.to===n.id).map(e=>'<bpmn:incoming>'+attr(e.id)+'</bpmn:incoming>').join('')+m.edges.filter(e=>e.from===n.id).map(e=>'<bpmn:outgoing>'+attr(e.id)+'</bpmn:outgoing>').join('')+'</bpmn:'+type[n.type]+'>').join('');
 const laneSet='<bpmn:laneSet id="rs_laneSet">'+m.lanes.map(l=>'<bpmn:lane id="'+attr('lane_'+l.id)+'" name="'+esc(l.label)+'">'+m.nodes.filter(n=>n.lane===l.id).map(n=>'<bpmn:flowNodeRef>'+attr(n.id)+'</bpmn:flowNodeRef>').join('')+'</bpmn:lane>').join('')+'</bpmn:laneSet>';
 const flows=m.edges.map(e=>'<bpmn:sequenceFlow id="'+attr(e.id)+'" sourceRef="'+attr(e.from)+'" targetRef="'+attr(e.to)+'" name="'+esc(e.label||'')+'"/>').join('');
 const shapes=[...l.lanes.map(n=>({id:'lane_'+n.id,r:n,lane:true})),...l.nodes.map(n=>({id:n.id,r:n.type==='task'?n:rect(n.x+n.w/2-(['start','end'].includes(n.type)?18:24),n.y+27-(['start','end'].includes(n.type)?18:24),['start','end'].includes(n.type)?36:48,['start','end'].includes(n.type)?36:48)}))].map((n,i)=>'<bpmndi:BPMNShape id="rs_shape_'+i+'" bpmnElement="'+attr(n.id)+'"'+(n.lane?' isHorizontal="false"':'')+'>'+bounds(n.r)+'</bpmndi:BPMNShape>').join('');
 const di=l.edges.map((e,i)=>'<bpmndi:BPMNEdge id="rs_edge_'+i+'" bpmnElement="'+attr(e.id)+'">'+e.points.map(p=>'<di:waypoint x="'+p.x+'" y="'+p.y+'"/>').join('')+(e.labelBox?'<bpmndi:BPMNLabel>'+bounds(e.labelBox)+'</bpmndi:BPMNLabel>':'')+'</bpmndi:BPMNEdge>').join('');
 return '<?xml version="1.0" encoding="UTF-8"?><bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="rs_defs" targetNamespace="urn:requirement-studio"><bpmn:process id="rs_process" name="'+esc(m.title)+'" isExecutable="false">'+laneSet+nodes+flows+'</bpmn:process><bpmndi:BPMNDiagram id="rs_diagram"><bpmndi:BPMNPlane id="rs_plane" bpmnElement="rs_process">'+shapes+di+'</bpmndi:BPMNPlane></bpmndi:BPMNDiagram></bpmn:definitions>';
}
export function sampleDiagram(kind='uml',lang='en'){
 const vi=lang==='vi',pick=(en,v)=>vi?v:en,n=(id,type,label,extra={})=>({id,type,label,...extra}),e=(id,from,to,type,label)=>({id,from,to,type,...(label?{label}:{})});
 if(kind==='uml')return {kind,title:pick('Purchase approval system','Hệ thống phê duyệt mua hàng'),nodes:[n('employee','actor',pick('Employee','Nhân viên')),n('manager','actor',pick('Manager','Quản lý')),n('budget','actor',pick('Budget system','Hệ thống ngân sách'),{side:'right'}),n('create','usecase',pick('Create purchase request','Tạo yêu cầu mua hàng')),n('submit','usecase',pick('Submit purchase request','Gửi yêu cầu mua hàng')),n('track','usecase',pick('Track status','Theo dõi trạng thái')),n('review','usecase',pick('Review request','Xem xét yêu cầu')),n('approve','usecase',pick('Approve request','Phê duyệt yêu cầu')),n('reject','usecase',pick('Reject request','Từ chối yêu cầu')),n('check','usecase',pick('Validate budget','Kiểm tra ngân sách'),{row:1}),n('more','usecase',pick('Request more information','Yêu cầu bổ sung thông tin'),{row:6}),n('audit','usecase',pick('Record decision','Ghi nhận quyết định'),{row:5})],edges:[e('a1','employee','create','association'),e('a2','employee','submit','association'),e('a3','employee','track','association'),e('a4','manager','review','association'),e('a5','manager','approve','association'),e('a6','manager','reject','association'),e('a7','budget','check','association'),e('i1','submit','check','include'),e('i2','approve','audit','include'),e('i3','reject','audit','include'),e('x1','more','review','extend')]};
 return {kind:'bpmn',title:pick('Purchase request approval','Quy trình phê duyệt mua hàng'),lanes:[{id:'employee',label:pick('Employee','Nhân viên')},{id:'system',label:pick('System','Hệ thống')},{id:'manager',label:pick('Manager','Quản lý')}],nodes:[n('start','start',pick('Request needed','Phát sinh nhu cầu'),{lane:'employee',row:0}),n('create','task',pick('Create purchase request','Tạo yêu cầu mua hàng'),{lane:'employee',row:1}),n('submit','task',pick('Submit request','Gửi yêu cầu'),{lane:'employee',row:2}),n('validate','task',pick('Validate budget','Kiểm tra ngân sách'),{lane:'system',row:2}),n('budget','exclusive',pick('Budget available?','Đủ ngân sách?'),{lane:'system',row:3}),n('notify','task',pick('Notify insufficient budget','Thông báo thiếu ngân sách'),{lane:'employee',row:3}),n('stop','end',pick('Not submitted','Chưa gửi duyệt'),{lane:'employee',row:4}),n('review','task',pick('Review purchase request','Xem xét yêu cầu'),{lane:'manager',row:4}),n('decision','exclusive',pick('Approved?','Được duyệt?'),{lane:'manager',row:5}),n('approved','task',pick('Record approval','Ghi nhận phê duyệt'),{lane:'system',row:5}),n('rejected','task',pick('Record rejection','Ghi nhận từ chối'),{lane:'system',row:6}),n('done','end',pick('Approved','Đã duyệt'),{lane:'employee',row:5}),n('denied','end',pick('Rejected','Đã từ chối'),{lane:'employee',row:6})],edges:[e('f1','start','create','sequence'),e('f2','create','submit','sequence'),e('f3','submit','validate','sequence'),e('f4','validate','budget','sequence'),e('f5','budget','notify','sequence',pick('No','Không')),e('f6','notify','stop','sequence'),e('f7','budget','review','sequence',pick('Yes','Có')),e('f8','review','decision','sequence'),e('f9','decision','approved','sequence',pick('Yes','Có')),e('f10','decision','rejected','sequence',pick('No','Không')),e('f11','approved','done','sequence'),e('f12','rejected','denied','sequence')]};
}
export function fromUseCases(w){
 const records=w.items.filter(x=>x.type==='UC'&&x.status!=='Retired'&&x.title.trim()&&x.details?.actor?.trim()).slice(0,40),actors=new Map(),nodes=[],edges=[];
 for(const r of records){const name=r.details.actor.trim();if(!actors.has(name)){const id='actor'+(actors.size+1);actors.set(name,id);nodes.push({id,type:'actor',label:name.slice(0,160),side:'left'});}const id='uc'+(edges.length+1);nodes.push({id,type:'usecase',label:r.title.slice(0,160),ref:r.id});edges.push({id:'a'+(edges.length+1),type:'association',from:actors.get(name),to:id});}
 return {kind:'uml',title:w.name.slice(0,160),nodes,edges};
}
