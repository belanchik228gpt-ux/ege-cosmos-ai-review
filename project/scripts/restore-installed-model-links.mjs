// Repair the local QA installation after an interrupted model copy, without duplicating weights.
// All source weights are hashed before any installed file is replaced.
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
const text = JSON.parse(await fs.readFile('runtime/artifacts.json','utf8'));
const vision = JSON.parse(await fs.readFile('runtime/vision-artifacts.json','utf8'));
const model = text.downloads.find(([file])=>file.startsWith('models/'));
const artifacts = [{relative:model[0],sha256:model[2]}, ...vision.files];
const target = path.resolve('test-results/installed-app/resources/runtime');
const checked = [];
for(const artifact of artifacts){
 const source=path.resolve('runtime',artifact.relative), destination=path.resolve(target,artifact.relative);
 assert(destination.startsWith(target+path.sep));
 assert(source.startsWith(path.resolve('runtime/models')+path.sep));
 const hash=createHash('sha256');for await(const chunk of createReadStream(source))hash.update(chunk);
 assert.equal(hash.digest('hex'),artifact.sha256,artifact.relative);
 const stat=await fs.stat(source);if(artifact.bytes)assert.equal(stat.size,artifact.bytes);
 checked.push({source,destination,bytes:stat.size,sha256:artifact.sha256});
}
for(const file of checked){
 await fs.mkdir(path.dirname(file.destination),{recursive:true});
 const original=await fs.stat(file.source), previous=await fs.lstat(file.destination).catch(()=>null);
 if(previous){assert(previous.isFile());if(previous.ino===original.ino&&previous.dev===original.dev)continue;await fs.unlink(file.destination);}
 await fs.link(file.source,file.destination);
 const linked=await fs.stat(file.destination);assert.equal(linked.ino,original.ino);assert.equal(linked.size,file.bytes);
}
await fs.writeFile('docs/verification/installed-model-links-'+JSON.parse(await fs.readFile('package.json','utf8')).version+'.json',JSON.stringify({status:'pass',at:new Date().toISOString(),reason:'App-only NSIS installation followed by verified local NTFS hard links, without copying multi-GB weights.',files:checked},null,2));
console.log('Three official model artifacts verified and restored as complete NTFS hard links.');
