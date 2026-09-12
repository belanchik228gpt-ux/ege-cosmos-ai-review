// Actual desktop exporter with invisible Electron print windows; no pupil data or local model.
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve('vite/package.json'))('esbuild');
const root = path.resolve(import.meta.dirname, '..');
const profile = path.join(root, 'test-results', `radicals-document-${Date.now()}`);
const out = path.join(root, 'docs', 'verification', 'radicals-document-0.4');
await fs.mkdir(profile, { recursive: true });
await fs.mkdir(out, { recursive: true });
const contentModule = path.join(profile, 'content.cjs');
await build({
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  outfile: contentModule,
  stdin: {
    resolveDir: root,
    loader: 'ts',
    contents:
      "export { createState } from './src/domain/learning'; export { buildDocumentContent } from './src/domain/document-content';",
  },
});
const { createState, buildDocumentContent } = require(contentModule);
const document = buildDocumentContent(createState('Тестовый ученик'), {
  type: 'Конспект занятия',
  subject: 'math',
  topicId: 'math-radicals',
  includeAnswers: true,
  now: new Date(),
});
await fs.writeFile(path.join(profile, 'document.json'), JSON.stringify(document, null, 2));
await fs.writeFile(path.join(out, 'editable-content.md'), document.content);
const sourceHashes = {};
for (const file of [
  'shared/document-topics.mjs',
  'shared/document-renderer.mjs',
  'desktop/documents.cjs',
  'src/domain/document-content.ts',
])
  sourceHashes[file] = createHash('sha256')
    .update(await fs.readFile(path.join(root, file)))
    .digest('hex');
const runner = path.join(profile, 'export.cjs');
await fs.writeFile(
  runner,
  `
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const root=${JSON.stringify(root)}, profile=__dirname, out=${JSON.stringify(out)};
const {exportDocument}=require(path.join(root,'desktop/documents.cjs'));
app.setPath('userData',path.join(profile,'electron'));
app.disableHardwareAcceleration();
app.on('window-all-closed',()=>{});
const result={at:new Date().toISOString(),scope:'Actual desktop exportDocument with source modules and hidden Electron windows, not installed EXE/UI acceptance',sourceHashes:${JSON.stringify(sourceHashes)},outputs:[]};
const timer=setTimeout(()=>{app.exit(1);},90000);
app.whenReady().then(async()=>{
 const document=JSON.parse(await fs.readFile(path.join(profile,'document.json'),'utf8'));
 for(const scale of ['comfortable','large']){
  const exported=await exportDocument({...document,documentType:document.type,format:'pdf',style:'cosmos',scale},{documentsDir:path.join(profile,'documents'),BrowserWindow});
  const bytes=await fs.readFile(exported.path);
  if(!bytes.subarray(0,5).equals(Buffer.from('%PDF-')))throw Error('Missing actual PDF signature');
  const copied=path.join(out,'math-radicals-'+scale+'.pdf');await fs.copyFile(exported.path,copied);
  result.outputs.push({format:'pdf',scale,path:copied,actualExportPath:exported.path,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
 }
 result.status='exported-needs-visual-review';
}).catch(error=>{result.status='fail';result.error=error.message;}).finally(async()=>{
 clearTimeout(timer);result.remainingWindows=BrowserWindow.getAllWindows().length;
 await fs.writeFile(path.join(out,'result.json'),JSON.stringify(result,null,2));
 for(const item of result.outputs)await fs.writeFile(path.join(out,'exports-'+item.scale+'.json'),JSON.stringify([item],null,2));
 console.log(JSON.stringify(result));app.exit(result.status==='fail'?1:0);
});
`,
);
await new Promise((resolve, reject) => {
  const child = spawn(path.join(root, 'node_modules/electron/dist/electron.exe'), [runner], {
    cwd: root,
    windowsHide: true,
    stdio: 'inherit',
  });
  const timeout = setTimeout(() => child.kill(), 105000);
  child.on('error', reject);
  child.on('exit', (code) => {
    clearTimeout(timeout);
    code === 0 ? resolve() : reject(Error(`Desktop export process exited ${code}`));
  });
});
