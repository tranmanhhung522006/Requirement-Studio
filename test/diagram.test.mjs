import test from 'node:test';
import assert from 'node:assert/strict';
import {sampleDiagram,validateDiagram,layoutDiagram,renderSvg,exportBpmn,fromUseCases,wrapText} from '../src/diagram.mjs';
import {demo,empty,governance,newItem,saveItem} from '../src/core.mjs';
for(const lang of ['en','vi'])for(const kind of ['uml','bpmn'])test(kind+' sample '+lang+' has no geometry findings',()=>{
 const model=sampleDiagram(kind,lang),result=layoutDiagram(model);
 assert.deepEqual(result.findings,[]);assert.equal(result.layout.edges.length,model.edges.length);assert.equal(result.layout.crossings,0);
 const svg=renderSvg(model,result);assert.ok(svg.startsWith('<svg'));assert.ok(svg.includes('Times New Roman'));assert.equal(svg,renderSvg(model));if(kind==='bpmn')assert.ok(exportBpmn(model,result).includes('bpmndi:BPMNEdge'));
});
test('invalid BPMN references and unreachable nodes are rejected',()=>{
 const m=sampleDiagram('bpmn');m.edges.pop();assert.ok(validateDiagram(m).some(f=>f.code==='D013'));m.edges.push({id:'broken',type:'sequence',from:'start',to:'missing'});assert.ok(validateDiagram(m).some(f=>f.code==='D007'));
});
test('invalid UML association and circular includes are rejected',()=>{
 const m=sampleDiagram('uml');m.edges.push({id:'bad',type:'association',from:'review',to:'approve'});assert.ok(validateDiagram(m).some(f=>f.code==='D009'));m.edges.pop();m.edges.push({id:'cycle',type:'include',from:'check',to:'submit'});assert.ok(validateDiagram(m).some(f=>f.code==='D018'));
});
test('SVG and BPMN XML escape user content',()=>{
 const m=sampleDiagram('bpmn');m.title='<script>bad</script> & test';const r=layoutDiagram(m);assert.ok(!renderSvg(m,r).includes('<script>'));assert.ok(exportBpmn(m,r).includes('&lt;script&gt;'));
});
test('long words wrap deterministically',()=>{assert.deepEqual(wrapText('abcdefghijklmnop',5),['abcde','fghij','klmno','p']);});
test('persist diagram in project and remove explicitly',()=>{const w=empty('A'),m=sampleDiagram('uml');const saved=governance(w,{kind:'diagram-save',model:m});assert.equal(saved.diagrams.length,1);assert.equal(w.diagrams.length,0);assert.equal(governance(saved,{kind:'diagram-remove',id:saved.diagrams[0].id}).diagrams.length,0);});
test('requirement-to-UML conversion does not invent dependencies',()=>{let w=demo();let x={...newItem(w,'UC'),title:'Example',details:{actor:'Manager'},parents:['FR-001']};w=saveItem(w,x);const m=fromUseCases(w);assert.equal(m.nodes.length,2);assert.equal(m.edges[0].type,'association');assert.equal(m.nodes[1].ref,x.id);});
