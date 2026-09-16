#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { pathToFileURL } from 'node:url';
import { graphSchema, xmlSchema } from './schema.js';
import { shapes, relations, templates } from './catalog.js';
import { createDiagram, inspectDiagram, editDiagram, combineDiagrams } from './diagram.js';
import { parseDocument, validateDocument, editorUrl } from './xml.js';
import { Storage } from './storage.js';

export const guidance = `Create editable draw.io XML locally. Start with list_diagram_templates and get_diagram_template, adapt the returned graph, then call create_diagram. Use list_diagram_shapes for built-in shapes/relations. All labels default to plain text. Custom style strings support any Draw.io stencil, including vendor cloud libraries; those libraries must exist in the target editor. Use parent IDs for containers; child coordinates are relative to the parent. Automatic layouts preserve explicit x/y. Use manual coordinates for sequence diagrams and precise lane placement. save_diagram writes to the configured output directory; it refuses overwrites by default. XML tools accept uncompressed mxfile, bare mxGraphModel, and compressed draw.io pages. Validation checks structure/references, not UML/BPMN business semantics. BPMN output is a visual drawing, not executable BPMN 2.0. No network request or image rendering occurs. Native PNG/PDF/SVG rendering is performed in Draw.io Desktop or the editor.`;
export function makeServer(storage = new Storage()) {
  const server=new McpServer({name:'draw-io-mcp-local',version:'1.0.0'},{instructions:guidance});
  function tool(name,description,inputSchema,fn,write=false) {
    server.registerTool(name,{description,inputSchema,annotations:{readOnlyHint:!write,destructiveHint:write,idempotentHint:!write,openWorldHint:false}},async args=>{
      try { const result=await fn(args); return {content:[{type:'text',text:JSON.stringify(result)}],structuredContent:result}; }
      catch(e) { return {isError:true,content:[{type:'text',text:e.message}]}; }
    });
  }
  tool('list_diagram_templates','List editable starter templates for diagram families.',{},()=>({templates:Object.entries(templates).map(([name,g])=>({name,title:g.name,nodes:g.nodes.length}))}));
  tool('get_diagram_template','Get a graph specification and XML starter. Modify graph and pass it to create_diagram.',{name:z.enum(Object.keys(templates))},({name})=>({graph:templates[name],xml:createDiagram(templates[name])}));
  tool('list_diagram_shapes','List built-in shape and connector styles. Custom styles extend these to other Draw.io notations.',{},()=>({shapes,relations}));
  tool('create_diagram','Generate editable .drawio XML from nodes and edges with automatic or manual layout. Does not write a file.',{graph:graphSchema},({graph})=>({xml:createDiagram(graph)}));
  tool('validate_diagram','Validate XML structure, IDs, parent cycles, geometry and edge references; not full XSD or domain-semantic validation.',{xml:xmlSchema},({xml})=>{try{return validateDocument(parseDocument(xml));}catch(e){return {valid:false,errors:[e.message],pages:[]};}});
  tool('inspect_diagram','Inspect all pages, cells, styles, geometry, and connections in existing XML.',{xml:xmlSchema},({xml})=>inspectDiagram(xml));
  const operation=z.object({action:z.enum(['update','remove']),id:z.string().min(1).max(128),label:z.string().max(20000).optional(),style:z.string().max(20000).optional(),parent:z.string().max(128).optional(),source:z.string().max(128).optional(),target:z.string().max(128).optional(),geometry:z.object({x:z.number().finite(),y:z.number().finite(),width:z.number().positive().finite(),height:z.number().positive().finite()}).partial().optional()}).strict();
  tool('edit_diagram','Update labels, replace styles, move/resize/reparent cells, reconnect edges, or remove cells. Removal cascades to descendants and connected edges. Preserves other XML and pages; invalid edits fail atomically.',{xml:xmlSchema,page:z.number().int().min(0).default(0),operations:z.array(operation).min(1).max(1000)},({xml,page,operations})=>({xml:editDiagram(xml,operations,page)}));
  tool('combine_diagrams','Combine documents into one multi-page .drawio file.',{diagrams:z.array(z.object({xml:xmlSchema,name:z.string().max(200).optional()})).min(1).max(100)},({diagrams})=>({xml:combineDiagrams(diagrams)}));
  tool('get_editor_url','Build a URL containing diagram XML in its fragment. Opens nothing and sends no network request; opening the URL loads your chosen editor.',{xml:xmlSchema,base_url:z.string().url().default('https://app.diagrams.net/')},({xml,base_url})=>({url:editorUrl(xml,base_url)}));
  tool('save_diagram','Validate and save XML under DRAWIO_OUTPUT_DIR. Set overwrite=true only when replacement is intended.',{filename:z.string(),xml:xmlSchema,overwrite:z.boolean().default(false)},({filename,xml,overwrite})=>storage.save(filename,xml,overwrite),true);
  tool('read_diagram','Read and validate a saved .drawio file from the configured directory.',{filename:z.string()},async({filename})=>({xml:await storage.read(filename)}));
  tool('list_saved_diagrams','List .drawio filenames in the configured directory.',{},async()=>({files:await storage.list()}));
  server.registerResource('diagram-guide','drawio://guide',{mimeType:'text/plain',description:'Local Draw.io diagram generation guide'},async uri=>({contents:[{uri:uri.href,mimeType:'text/plain',text:guidance}]}));
  server.registerPrompt('design_diagram',{description:'Turn a description into an editable diagram',argsSchema:{description:z.string(),kind:z.string().optional()}},({description,kind})=>({messages:[{role:'user',content:{type:'text',text:`Create an editable ${kind??''} Draw.io diagram for: ${description}\nUse the template and shape tools, create the graph, validate it, and return the XML. Save if I request a file. ${guidance}`}}]}));
  return server;
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const server=makeServer();
  server.connect(new StdioServerTransport()).catch(error=>{console.error(error);process.exitCode=1;});
}
