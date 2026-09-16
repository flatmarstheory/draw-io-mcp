import { mkdir, realpath, lstat, open, readdir, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { checkedDocument, MAX_BYTES } from './xml.js';

export class Storage {
  constructor(directory = process.env.DRAWIO_OUTPUT_DIR ?? './output') { this.directory=path.resolve(directory); }
  async location(filename) {
    if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}\.drawio$/.test(filename) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])\./i.test(filename)) throw new Error('Use a simple filename ending in .drawio (no directories)');
    await mkdir(this.directory,{recursive:true});
    const root=await realpath(this.directory), target=path.join(root,filename);
    try { const stat=await lstat(target); if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink>1) throw new Error('Target must be a regular, non-linked file'); }
    catch(e) { if(e.code!=='ENOENT') throw e; }
    return target;
  }
  async save(filename,xml,overwrite=false) {
    checkedDocument(xml);
    const target=await this.location(filename);
    if(!overwrite) {
      const file=await open(target,'wx',0o600);
      try { await file.writeFile(xml,'utf8'); } finally { await file.close(); }
    } else {
      const temporary=path.join(path.dirname(target),`.${randomUUID()}.tmp`);
      try { const file=await open(temporary,'wx',0o600); try { await file.writeFile(xml,'utf8'); } finally { await file.close(); } await rename(temporary,target); }
      finally { await unlink(temporary).catch(e=>{if(e.code!=='ENOENT') throw e;}); }
    }
    return {filename,path:target,bytes:Buffer.byteLength(xml)};
  }
  async read(filename) {
    const target=await this.location(filename), file=await open(target,constants.O_RDONLY | (constants.O_NOFOLLOW??0));
    try { const stat=await file.stat(); if(!stat.isFile()||stat.size>MAX_BYTES||stat.nlink>1) throw new Error('Invalid or oversized diagram file'); const xml=await file.readFile('utf8'); checkedDocument(xml); return xml; }
    finally { await file.close(); }
  }
  async list() {
    await mkdir(this.directory,{recursive:true});
    const files=await readdir(this.directory,{withFileTypes:true});
    return files.filter(f=>f.isFile()&&f.name.endsWith('.drawio')&&!f.isSymbolicLink()).map(f=>f.name).sort();
  }
}
