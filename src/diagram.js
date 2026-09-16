import dagre from '@dagrejs/dagre';
import { graphSchema } from './schema.js';
import { shapes, relations } from './catalog.js';
import { element as el, serialize, checkedDocument, pagesOf, cellsOf, rootOf, attrs, find, children, validateDocument } from './xml.js';

const baseNode = 'whiteSpace=wrap;html=0;fontFamily=Helvetica;fontSize=13;fillColor=#dae8fc;strokeColor=#6c8ebf;';
const baseEdge = 'edgeStyle=orthogonalEdgeStyle;rounded=0;html=0;fontFamily=Helvetica;fontSize=12;';
export function createDiagram(input) {
  const spec = graphSchema.parse(input), nodes = structuredClone(spec.nodes), ids = new Set(['0','1']);
  const reserve = id => { if(ids.has(id)) throw new Error(`Duplicate ID: ${id}`); ids.add(id); };
  nodes.forEach(n=>reserve(n.id));
  const byId = new Map(nodes.map(n=>[n.id,n]));
  for(const n of nodes) {
    if(n.parent && !byId.has(n.parent)) throw new Error(`Unknown parent ${n.parent}`);
    const seen = new Set([n.id]); let parent = n.parent;
    while(parent) { if(seen.has(parent)) throw new Error('Container parent cycle'); seen.add(parent); parent=byId.get(parent).parent; }
    if((n.x === undefined) !== (n.y === undefined)) throw new Error(`Provide both x and y for ${n.id}`);
    if(spec.layout==='manual' && n.x===undefined) throw new Error(`Manual layout requires x/y for ${n.id}`);
    n.width ??= n.body ? 240 : 160; n.height ??= n.body ? Math.max(80,40+n.body.length*24) : 70;
  }
  const edges = spec.edges.map((e,i)=>({ ...e, id:e.id ?? `edge_${i+1}` }));
  for(const e of edges) { reserve(e.id); if(!byId.has(e.source)||!byId.has(e.target)) throw new Error(`Unknown endpoint on ${e.id}`); }
  for(const n of nodes.filter(n=>n.body)) for(let i=0;i<n.body.length;i++) reserve(`${n.id}__row_${i+1}`);

  // Lay out sibling groups bottom-up; cross-container edges influence their ancestors.
  function layout(parent) {
    const siblings = nodes.filter(n=>n.parent===parent);
    for(const n of siblings) if(nodes.some(c=>c.parent===n.id)) layout(n.id);
    if(spec.layout!=='manual' && siblings.length) {
      const graph = new dagre.graphlib.Graph({multigraph:true}).setGraph({rankdir:spec.layout,nodesep:50,ranksep:90,marginx:30,marginy:parent?55:30}).setDefaultEdgeLabel(()=>({}));
      siblings.forEach(n=>graph.setNode(n.id,{width:n.width,height:n.height}));
      function ancestor(id) { let n=byId.get(id); while(n && n.parent!==parent) n=byId.get(n.parent); return n?.id; }
      edges.forEach(e=>{ const s=ancestor(e.source),t=ancestor(e.target); if(s && t && s!==t) graph.setEdge(s,t,{},e.id); });
      dagre.layout(graph);
      siblings.forEach(n=>{ const p=graph.node(n.id); n.x ??= Math.round(p.x-n.width/2); n.y ??= Math.round(p.y-n.height/2); });
    }
    if(parent && siblings.length) {
      const container=byId.get(parent);
      container.width=Math.max(container.width,...siblings.map(n=>n.x+n.width+30));
      container.height=Math.max(container.height,...siblings.map(n=>n.y+n.height+30));
    }
  }
  layout(undefined);
  const cells=[el('mxCell',{id:'0'}),el('mxCell',{id:'1',parent:'0'})];
  for(const n of nodes) {
    cells.push(el('mxCell',{id:n.id,value:n.label,vertex:'1',parent:n.parent??'1',style:baseNode+shapes[n.shape]+(n.style??'')},[el('mxGeometry',{x:n.x,y:n.y,width:n.width,height:n.height,as:'geometry'})]));
    for(const [i,row] of (n.body??[]).entries()) cells.push(el('mxCell',{id:`${n.id}__row_${i+1}`,value:row,vertex:'1',parent:n.id,style:'text;html=0;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;spacingLeft=10;fontSize=12;whiteSpace=wrap;'},[el('mxGeometry',{x:0,y:34+i*24,width:n.width,height:24,as:'geometry'})]));
  }
  for(const e of edges) cells.push(el('mxCell',{id:e.id,value:e.label,edge:'1',parent:'1',source:e.source,target:e.target,style:baseEdge+relations[e.relation]+(e.style??'')},[el('mxGeometry',{relative:'1',as:'geometry'},e.points?.length?[el('Array',{as:'points'},e.points.map(p=>el('mxPoint',p)))]:[])]));
  const top=nodes.filter(n=>!n.parent);
  const model=el('mxGraphModel',{grid:'1',gridSize:'10',guides:'1',connect:'1',page:'1',pageScale:'1',pageWidth:Math.max(1169,...top.map(n=>n.x+n.width+60)),pageHeight:Math.max(827,...top.map(n=>n.y+n.height+60))},[el('root',{},cells)]);
  const xml=serialize([el('mxfile',{host:'draw-io-mcp',version:'1.0.0'},[el('diagram',{id:'page-1',name:spec.name},[model])])]);
  checkedDocument(xml);
  return xml;
}

export function inspectDiagram(xml) {
  const doc=checkedDocument(xml);
  return { ...validateDocument(doc), pages:pagesOf(doc).map((p,i)=>({index:i,name:attrs(p).name,id:attrs(p).id,cells:cellsOf(p).map(c=>({id:c.id,...attrs(c.cell),label:attrs(c.owner).label??attrs(c.cell).value,geometry:find(c.cell,'mxGeometry').map(attrs)[0]}))})) };
}

export function editDiagram(xml, operations, pageIndex=0) {
  const doc=checkedDocument(xml), page=pagesOf(doc)[pageIndex];
  if(!page) throw new Error(`Page ${pageIndex} does not exist`);
  for(const op of operations) {
    const cells=cellsOf(page), byId=new Map(cells.map(c=>[c.id,c]));
    if(['0','1'].includes(op.id)) throw new Error('Structural cells cannot be edited');
    const c=byId.get(op.id);
    if(!c) throw new Error(`Unknown cell ${op.id}`);
    if(op.action==='remove') {
      const removed=new Set([op.id]); let changed=true;
      while(changed) { changed=false; for(const item of cells) { const a=attrs(item.cell); if(!removed.has(item.id) && [a.parent,a.source,a.target].some(id=>removed.has(id))) { removed.add(item.id); changed=true; } } }
      const owners=new Set(cells.filter(c=>removed.has(c.id)).map(c=>c.owner));
      const root=rootOf(page); root.root=children(root).filter(owner=>!owners.has(owner));
    } else {
      const a=attrs(c.cell);
      if(op.label!==undefined) { if(c.owner!==c.cell) attrs(c.owner).label=op.label; else a.value=op.label; }
      if(op.style!==undefined) a.style=op.style;
      for(const key of ['parent','source','target']) if(op[key]!==undefined) a[key]=op[key];
      if(op.geometry) { const g=find(c.cell,'mxGeometry')[0]; if(!g) throw new Error('Cell has no geometry'); for(const [k,v] of Object.entries(op.geometry)) attrs(g)[k]=String(v); }
    }
  }
  const result=serialize(doc); checkedDocument(result); return result;
}

export function combineDiagrams(diagrams) {
  const pages=diagrams.flatMap(({xml,name})=>pagesOf(checkedDocument(xml)).map(p=>{ if(name) attrs(p).name=name; return p; }));
  pages.forEach((p,i)=>{attrs(p).id=`page-${i+1}`;});
  const xml=serialize([el('mxfile',{host:'draw-io-mcp'},pages)]); checkedDocument(xml); return xml;
}
