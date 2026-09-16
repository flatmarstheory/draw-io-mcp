import { mkdir, writeFile } from 'node:fs/promises';
import { templates } from '../src/catalog.js';
import { createDiagram, combineDiagrams } from '../src/diagram.js';
await mkdir('examples',{recursive:true});
const diagrams=[];
for(const [name,graph] of Object.entries(templates)) {
  const xml=createDiagram(graph); diagrams.push({xml});
  await writeFile(`examples/${name}.drawio`,xml);
  await writeFile(`examples/${name}.json`,JSON.stringify(graph,null,2)+'\n');
}
await writeFile('examples/all-diagrams.drawio',combineDiagrams(diagrams));
console.log(`Generated ${diagrams.length} examples and a multi-page gallery.`);
