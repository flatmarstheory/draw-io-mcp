import { XMLParser, XMLBuilder, XMLValidator } from 'fast-xml-parser';
import { inflateRawSync, deflateRawSync } from 'node:zlib';

export const MAX_BYTES = 5_000_000;
const options = { preserveOrder: true, ignoreAttributes: false, attributeNamePrefix: '', parseTagValue: false, trimValues: false, processEntities: true };
const parser = new XMLParser(options);
const builder = new XMLBuilder({ ...options, format: true, suppressEmptyNode: true });
export const tag = el => Object.keys(el).find(k => k !== ':@');
export const attrs = el => el[':@'] ?? {};
export const children = el => Array.isArray(el[tag(el)]) ? el[tag(el)] : [];
export const element = (name, attributes = {}, content = []) => ({ [name]: content, ':@': Object.fromEntries(Object.entries(attributes).map(([k,v]) => [k,String(v)])) });
export const serialize = doc => builder.build(doc);
export const find = (el, name) => children(el).filter(child => tag(child) === name);

function parse(xml) {
  if (Buffer.byteLength(xml) > MAX_BYTES) throw new Error('XML exceeds the 5 MB limit');
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('DTD and entity declarations are not supported');
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/u.test(xml)) throw new Error('Invalid XML control character');
  const valid = XMLValidator.validate(xml);
  if (valid !== true) throw new Error(`Invalid XML: ${valid.err.msg}`);
  const doc = parser.parse(xml);
  const roots = doc.filter(el => !['?xml','#text','#comment'].includes(tag(el)));
  if (roots.length !== 1) throw new Error('Expected exactly one XML root element');
  return roots;
}
export function parseDocument(xml) {
  let doc = parse(xml);
  if (tag(doc[0]) === 'mxGraphModel') doc = [element('mxfile', {}, [element('diagram', {id:'page-1',name:'Page-1'}, doc)])];
  if (tag(doc[0]) !== 'mxfile') throw new Error('Expected mxfile or mxGraphModel');
  const pages = find(doc[0], 'diagram');
  if (!pages.length || pages.length > 100) throw new Error('Expected 1–100 diagram pages');
  let total = Buffer.byteLength(xml);
  for (const page of pages) {
    if (!find(page,'mxGraphModel').length) {
      const encoded = children(page).filter(el => tag(el) === '#text').map(el => el['#text']).join('').trim();
      if (!encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new Error('Page is missing mxGraphModel or valid compressed data');
      let decoded;
      try { decoded = decodeURIComponent(inflateRawSync(Buffer.from(encoded,'base64'), {maxOutputLength:MAX_BYTES}).toString('utf8')); }
      catch { throw new Error('Invalid or oversized compressed diagram'); }
      total += Buffer.byteLength(decoded);
      if (total > MAX_BYTES) throw new Error('Expanded XML exceeds the 5 MB limit');
      const model = parse(decoded);
      if (tag(model[0]) !== 'mxGraphModel') throw new Error('Compressed page must contain mxGraphModel');
      page.diagram = model;
    }
  }
  return doc;
}
export function pagesOf(doc) { return find(doc[0], 'diagram'); }
export function rootOf(page) {
  const models = find(page,'mxGraphModel');
  if (models.length !== 1 || find(models[0],'root').length !== 1) throw new Error('Each page needs one mxGraphModel/root');
  return find(models[0],'root')[0];
}
export function cellsOf(page) {
  return children(rootOf(page)).flatMap(owner => {
    if (tag(owner) === 'mxCell') return [{owner, cell:owner, id:attrs(owner).id}];
    return find(owner,'mxCell').map(cell => ({owner,cell,id:attrs(owner).id ?? attrs(cell).id}));
  });
}
export function validateDocument(doc) {
  const errors = [], summaries = [], pageIds = new Set();
  for (const [index,page] of pagesOf(doc).entries()) {
    const prefix = `Page ${index+1}`;
    const pageId = attrs(page).id;
    if (pageId && pageIds.has(pageId)) errors.push(`${prefix}: duplicate page ID ${pageId}`);
    pageIds.add(pageId);
    let cells;
    try { cells = cellsOf(page); } catch (e) { errors.push(`${prefix}: ${e.message}`); continue; }
    if (cells.length > 10000) { errors.push(`${prefix}: too many cells`); continue; }
    const ids = new Set(), byId = new Map(cells.map(c => [c.id,c]));
    for (const {id,cell} of cells) {
      const a = attrs(cell);
      if (!id || ids.has(id)) errors.push(`${prefix}: missing or duplicate cell ID ${id ?? ''}`);
      ids.add(id);
      if (a.vertex === '1' && a.edge === '1') errors.push(`${prefix}: ${id} cannot be both vertex and edge`);
      for (const key of ['parent','source','target']) if (a[key] && !byId.has(a[key])) errors.push(`${prefix}: ${id} has unknown ${key} ${a[key]}`);
      if (id !== '0' && !a.parent) errors.push(`${prefix}: ${id} needs a parent`);
      if (a.vertex === '1' || a.edge === '1') {
        const geometry = find(cell,'mxGeometry');
        if (geometry.length !== 1 || attrs(geometry[0]).as !== 'geometry') errors.push(`${prefix}: ${id} needs mxGeometry as=geometry`);
        if (geometry.length) {
          const g = attrs(geometry[0]);
          for (const key of ['x','y','width','height']) if (g[key] !== undefined && !Number.isFinite(Number(g[key]))) errors.push(`${prefix}: ${id} invalid ${key}`);
          if (a.vertex === '1' && !(Number(g.width)>0 && Number(g.height)>0)) errors.push(`${prefix}: ${id} needs positive width and height`);
        }
      }
      const visited = new Set([id]);
      let parent = a.parent;
      while (parent && byId.has(parent)) {
        if (visited.has(parent)) { errors.push(`${prefix}: parent cycle at ${id}`); break; }
        visited.add(parent); parent = attrs(byId.get(parent).cell).parent;
      }
    }
    if (!byId.has('0') || attrs(byId.get('0').cell).parent !== undefined) errors.push(`${prefix}: missing/invalid root cell 0`);
    if (!byId.has('1') || attrs(byId.get('1').cell).parent !== '0') errors.push(`${prefix}: missing/invalid default layer 1`);
    summaries.push({ name:attrs(page).name ?? `Page-${index+1}`, id:pageId, cells:cells.length, vertices:cells.filter(c=>attrs(c.cell).vertex==='1').length, edges:cells.filter(c=>attrs(c.cell).edge==='1').length });
  }
  return { valid:errors.length===0, errors, pages:summaries };
}
export function checkedDocument(xml) {
  const doc = parseDocument(xml), validation = validateDocument(doc);
  if (!validation.valid) throw new Error(validation.errors.join('; '));
  return doc;
}
export function editorUrl(xml, baseUrl = 'https://app.diagrams.net/') {
  checkedDocument(xml);
  const url = new URL(baseUrl);
  if (!['http:','https:'].includes(url.protocol)) throw new Error('Editor URL must use http or https');
  url.hash = 'create=' + encodeURIComponent(JSON.stringify({type:'xml',compressed:true,data:deflateRawSync(Buffer.from(encodeURIComponent(xml))).toString('base64')}));
  return url.toString();
}
