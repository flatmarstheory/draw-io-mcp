import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const client=new Client({name:'docker-smoke-test',version:'1.0.0'});
const transport=new StdioClientTransport({command:'docker',args:['run','--rm','-i','--network=none','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','draw-io-mcp:local'],stderr:'inherit'});
try {
  await client.connect(transport);
  const response=await client.callTool({name:'get_diagram_template',arguments:{name:'bpmn'}});
  assert.ok(!response.isError,JSON.stringify(response));
  const {xml}=response.structuredContent;
  const validation=await client.callTool({name:'validate_diagram',arguments:{xml}});
  assert.equal(validation.structuredContent.valid,true);
  const saved=await client.callTool({name:'save_diagram',arguments:{filename:'smoke.drawio',xml}});
  assert.ok(!saved.isError,JSON.stringify(saved));
  console.log('Docker MCP handshake, BPMN generation, validation and volume write passed.');
} finally { await client.close(); }
