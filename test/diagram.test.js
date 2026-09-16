import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { templates } from '../src/catalog.js';
import { createDiagram, inspectDiagram, editDiagram, combineDiagrams } from '../src/diagram.js';
import { checkedDocument, parseDocument, validateDocument, editorUrl } from '../src/xml.js';

for(const [name,graph] of Object.entries(templates)) test(`${name} creates a valid editable graph`,()=>{
  const xml=createDiagram(graph), summary=inspectDiagram(xml);
  assert.equal(summary.valid,true);
  assert.equal(summary.pages[0].cells.filter(c=>c.edge==='1').length,graph.edges.length);
  assert.ok(summary.pages[0].cells.filter(c=>c.vertex==='1').every(c=>Number(c.geometry.width)>0));
  assert.equal(createDiagram(graph),xml,'generation is deterministic');
});
test('XML labels round-trip special characters, Unicode and multiline text',()=>{
  const label='A < B & "C"\n日本語 🚀';
  const xml=createDiagram({nodes:[{id:'a',label}]});
  assert.equal(inspectDiagram(xml).pages[0].cells.find(c=>c.id==='a').label,label);
});
test('layout separates peers and preserves explicitly placed nodes',()=>{
  const xml=createDiagram({nodes:[{id:'a'},{id:'b'},{id:'c',x:1000,y:700}],edges:[{source:'a',target:'b'}]});
  const cells=inspectDiagram(xml).pages[0].cells;
  const a=cells.find(c=>c.id==='a').geometry,b=cells.find(c=>c.id==='b').geometry;
  assert.ok(+b.x>=+a.x + +a.width);
  assert.equal(cells.find(c=>c.id==='c').geometry.x,'1000');
});
test('nested containers expand to contain children',()=>{
  const xml=createDiagram({nodes:[{id:'outer',shape:'container'},{id:'inner',shape:'container',parent:'outer'},{id:'leaf',parent:'inner'}]});
  const cells=inspectDiagram(xml).pages[0].cells, byId=Object.fromEntries(cells.map(c=>[c.id,c]));
  assert.ok(+byId.inner.geometry.width >= +byId.leaf.geometry.x + +byId.leaf.geometry.width);
  assert.ok(+byId.outer.geometry.height >= +byId.inner.geometry.y + +byId.inner.geometry.height);
});
test('rejects duplicate IDs, invalid references, cycles and incomplete manual geometry',()=>{
  for(const graph of [
    {nodes:[{id:'a'},{id:'a'}]},
    {nodes:[{id:'a'}],edges:[{source:'a',target:'missing'}]},
    {nodes:[{id:'a',parent:'b'},{id:'b',parent:'a'}]},
    {nodes:[{id:'a'}],layout:'manual'},
    {nodes:[{id:'a',x:1}]},
    {nodes:[{id:'a',shape:'not-a-shape'}]},
  ]) assert.throws(()=>createDiagram(graph));
});
test('compressed pages, bare models, and editor links round-trip',()=>{
  const xml=createDiagram(templates.erd), model=xml.match(/<mxGraphModel[\s\S]*<\/mxGraphModel>/)[0];
  assert.equal(validateDocument(parseDocument(model)).valid,true);
  const data=deflateRawSync(Buffer.from(encodeURIComponent(model))).toString('base64');
  assert.equal(inspectDiagram(`<mxfile><diagram id="p" name="Compressed">${data}</diagram></mxfile>`).valid,true);
  const url=new URL(editorUrl(xml,'http://localhost:8080/'));
  const payload=JSON.parse(decodeURIComponent(url.hash.slice('#create='.length)));
  assert.equal(decodeURIComponent(inflateRawSync(Buffer.from(payload.data,'base64')).toString()),xml);
  assert.throws(()=>editorUrl(xml,'javascript:alert(1)'));
});
test('rejects malicious, invalid and oversized XML',()=>{
  for(const xml of ['<!DOCTYPE a [<!ENTITY e SYSTEM "file:///etc/passwd">]><a>&e;</a>','<mxfile>','<foo/>','<mxfile/><mxfile/>','<mxfile><diagram>bad</diagram></mxfile>','x'.repeat(5_000_001)]) assert.throws(()=>checkedDocument(xml));
  const bomb=deflateRawSync(Buffer.from('a'.repeat(5_000_001))).toString('base64');
  assert.throws(()=>checkedDocument(`<mxfile><diagram>${bomb}</diagram></mxfile>`),/oversized/);
});
test('edits preserve other pages and cascade deletes',()=>{
  const xml=combineDiagrams([{xml:createDiagram(templates.erd)},{xml:createDiagram(templates.network)}]);
  const edited=editDiagram(xml,[{action:'update',id:'customer',label:'Customers & contacts',geometry:{x:200}},{action:'remove',id:'order'}]);
  const result=inspectDiagram(edited);
  assert.equal(result.pages.length,2);
  assert.equal(result.pages[0].cells.find(c=>c.id==='customer').label,'Customers & contacts');
  assert.ok(!result.pages[0].cells.some(c=>c.id==='order'||c.parent==='order'||c.source==='order'||c.target==='order'));
  assert.deepEqual(result.pages[1].cells,inspectDiagram(xml).pages[1].cells);
  assert.throws(()=>editDiagram(xml,[{action:'update',id:'customer',parent:'customer'}]),/cycle/);
  assert.throws(()=>editDiagram(xml,[{action:'remove',id:'0'}]),/Structural/);
});
test('wrapped user objects retain metadata during edits',()=>{
  const xml='<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><UserObject id="a" label="Old" custom="preserved"><mxCell parent="1" vertex="1"><mxGeometry width="100" height="50" as="geometry"/></mxCell></UserObject></root></mxGraphModel>';
  const edited=editDiagram(xml,[{action:'update',id:'a',label:'New'}]);
  assert.match(edited,/custom="preserved"/);
  assert.equal(inspectDiagram(edited).pages[0].cells.find(c=>c.id==='a').label,'New');
});
