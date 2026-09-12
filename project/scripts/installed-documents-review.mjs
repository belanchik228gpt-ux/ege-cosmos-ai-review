import { _electron as electron } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const exe=path.resolve('test-results/installed-app/EGE Cosmos.exe');
const profile=path.resolve('test-results/exam-series-live-1788903437246');
const out=path.resolve(process.env.COSMOS_QA_OUT || 'docs/verification/installed-documents-0.5.1');await fs.mkdir(out,{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex');
const report={status:'running',exe,profile,at:new Date().toISOString(),asarSha256:hash(await fs.readFile(path.join(path.dirname(exe),'resources/app.asar'))),checks:[],screenshots:[],documents:[],errors:[],limits:['Actual installed EXE, actual previously completed isolated QA lessons, UI editing and export, real files checked by signature and byte count. No model-response or learning-state injection. OS AutoClicker excluded from QA window.']};
let app,page;
async function poll(fn,timeout=60000){const end=Date.now()+timeout;while(Date.now()<end){if(await fn())return;await new Promise(r=>setTimeout(r,150));}throw new Error('Expected saved state not received');}
const button=name=>page.getByRole('button',{name,exact:true});
const nav=name=>page.locator('.studio-sidebar').getByRole('button',{name,exact:true});
async function shot(name){const p=path.join(out,`${name}.png`);await page.screenshot({path:p});report.screenshots.push(p);}
async function launch(){app=await electron.launch({executablePath:exe,env:{...process.env,COSMOS_USER_DATA:profile,COSMOS_DOCUMENTS_DIR:path.join(profile,'documents'),COSMOS_OPENAI_USER_DATA:path.join(process.env.APPDATA,'EGE Cosmos Studio')},timeout:45000});await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.setIgnoreMouseEvents(true);w.setContentSize(1600,1000);});page=await app.firstWindow();page.setDefaultTimeout(25000);page.on('pageerror',e=>report.errors.push(e.message));await page.locator('.cosmos-studio').waitFor();await poll(()=>page.evaluate(async()=>(await window.cosmos.getOpenAIStatus()).authenticated===true));}
try {
 await launch();assert.equal((await page.evaluate(()=>window.cosmos.getAppInfo())).version,'0.5.1');await nav('Мои конспекты').click();
 const documents=(await page.evaluate(()=>window.cosmos.loadState())).documents;assert(documents.length>=2);
 for(const subject of ['math','russian']){
   const doc=documents.find(d=>d.subject===subject);assert(doc);await page.locator('.saved-document').filter({hasText:doc.title}).first().click();
   if(subject==='russian'){
    const title='Сложноподчинённое предложение: главная и придаточная части';await page.getByLabel('Название документа',{exact:true}).fill(title);await button('Редактирование').click();const text=await page.getByLabel('Содержание документа',{exact:true}).inputValue();await page.getByLabel('Содержание документа',{exact:true}).fill(text.replace(/^# [^\n]+/,`# ${title}`));await button('Предпросмотр').click();
   }
   await shot(`${subject}-preview`);
   for(const format of ['html','pdf']){
     const previous=(await page.evaluate(()=>window.cosmos.loadState())).documents.find(d=>d.id===doc.id).path;
     await page.getByLabel('Формат',{exact:true}).selectOption(format);await button('Сохранить и экспортировать').click();
     await poll(()=>page.evaluate(async({id,format,previous})=>{const p=(await window.cosmos.loadState()).documents.find(d=>d.id===id)?.path;return typeof p==='string'&&p!==previous&&p.endsWith(`.${format}`);},{id:doc.id,format,previous}));
     const saved=(await page.evaluate(()=>window.cosmos.loadState())).documents.find(d=>d.id===doc.id);assert(saved.drawings?.length);const bytes=await fs.readFile(saved.path);assert(bytes.length>5000);if(format==='pdf')assert.equal(bytes.subarray(0,5).toString(),'%PDF-');else assert(bytes.toString('utf8').toLowerCase().includes('<!doctype html>'));
     const artifact=path.join(out,`${subject}-lesson.${format}`);await fs.copyFile(saved.path,artifact);report.documents.push({subject,title:saved.title,id:doc.id,format,path:saved.path,artifact,bytes:bytes.length,sha256:hash(bytes),drawingCount:saved.drawings.length,frameCount:saved.drawings.reduce((n,d)=>n+d.steps.length,0)});
   }
   await button('Закрыть документ').click();
 }
 report.checks.push('actual-ui-edit-preview-html-pdf-two-studied-topics-signatures-and-paths');
 await app.close();await launch();await nav('Математика').click();await page.locator('.exam-series-progress').waitFor();assert((await page.locator('.exam-series-progress').innerText()).includes('Пример 2 из 2'));const state=await page.evaluate(()=>window.cosmos.loadState());const training=Object.values(state.cloudSessions).find(l=>l.examTraining)?.examTraining;assert.deepEqual(training.completed,[1,2]);assert(state.documents.every(d=>d.path.endsWith('.pdf')));await shot('restored-completed-series');await nav('Мои конспекты').click();await shot('restored-document-library');report.checks.push('real-process-restart-restores-series-documents-edited-title-and-sign-in');assert.deepEqual(report.errors,[]);report.status='pass';
}catch(e){report.status='fail';report.error=e.stack;console.error(e);await shot('failure').catch(()=>{});process.exitCode=1;}
finally{await app?.close().catch(()=>{});report.finishedAt=new Date().toISOString();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
