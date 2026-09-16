import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Storage } from '../src/storage.js';
import { createDiagram } from '../src/diagram.js';
test('storage persists XML and refuses traversal, bad XML and accidental overwrite',async t=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'drawio-test-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const store=new Storage(dir), xml=createDiagram({nodes:[{id:'a',label:'Persist me'}]});
  await store.save('example.drawio',xml);
  assert.equal(await store.read('example.drawio'),xml);
  assert.deepEqual(await store.list(),['example.drawio']);
  await assert.rejects(store.save('example.drawio',xml),{code:'EEXIST'});
  const updated=createDiagram({nodes:[{id:'b'}]});
  await store.save('example.drawio',updated,true);
  assert.equal(await store.read('example.drawio'),updated);
  for(const filename of ['../escape.drawio','C:\\escape.drawio','x/y.drawio','nul.drawio','foo.txt']) await assert.rejects(store.save(filename,xml));
  await assert.rejects(store.save('invalid.drawio','<bad/>'));
});
test('concurrent create calls cannot overwrite each other',async t=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'drawio-race-')); t.after(()=>rm(dir,{recursive:true,force:true}));
  const store=new Storage(dir),xml=createDiagram({nodes:[]});
  const results=await Promise.allSettled([store.save('same.drawio',xml),store.save('same.drawio',xml)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
});
test('symlink targets are refused', {skip:process.platform==='win32'?'Windows symlink creation requires privileges':false}, async t=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'drawio-links-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const store=new Storage(dir),xml=createDiagram({nodes:[]});
  await store.save('real.drawio',xml); await symlink(path.join(dir,'real.drawio'),path.join(dir,'link.drawio'));
  await assert.rejects(store.read('link.drawio'));await assert.rejects(store.save('link.drawio',xml,true));
});
