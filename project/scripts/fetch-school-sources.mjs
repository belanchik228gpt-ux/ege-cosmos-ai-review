// Restore the exact public source PDFs from the committed, reviewed manifest.
// Text excerpts are committed; no PDF parser or textbook download is required.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=path.resolve('resources/school-program');
const manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
assert(manifest.version===1&&Array.isArray(manifest.documents)&&manifest.documents.length<=100);
for(const item of manifest.documents){
  assert(/^[a-z0-9-]+\.pdf$/.test(item.file)&&/^[a-f0-9]{64}$/.test(item.pdfSha256));
  const url=new URL(item.url);assert(url.protocol==='https:'&&['edsoo.ru','www.edsoo.ru'].includes(url.hostname));
  const target=path.join(root,item.file),existing=await fs.readFile(target).catch(()=>null);
  if(existing&&existing.length===item.pdfBytes&&hash(existing)===item.pdfSha256){console.log('Verified',item.id);continue;}
  const response=await fetch(url,{signal:AbortSignal.timeout(45000)});assert(response.ok,`${item.id}: HTTP ${response.status}`);
  assert(['edsoo.ru','www.edsoo.ru'].includes(new URL(response.url).hostname),'Unexpected redirect');
  const chunks=[];let total=0;
  for await(const chunk of response.body){total+=chunk.length;assert(total<=item.pdfBytes&&total<50_000_000,'Source size mismatch');chunks.push(chunk);}
  const data=Buffer.concat(chunks);assert(data.length===item.pdfBytes&&hash(data)===item.pdfSha256,`${item.id}: source changed; review before updating manifest`);
  assert(data.subarray(0,5).toString()==='%PDF-');await fs.writeFile(target,data);console.log('Restored',item.id);
}
