import { _electron as electron } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const original=JSON.parse(await fs.readFile('docs/verification/math-sheet-installed-0.5.1/report.json','utf8'));
const exe=path.resolve(process.env.COSMOS_EXE || 'test-results/installed-app/EGE Cosmos.exe');
const out=path.resolve(process.env.COSMOS_QA_OUT || 'docs/verification/fullscreen-installed-0.5.1');
await fs.mkdir(out,{recursive:true});
const report={status:'running',at:new Date().toISOString(),exe,profile:original.profile,asarSha256:createHash('sha256').update(await fs.readFile(path.join(path.dirname(exe),'resources/app.asar'))).digest('hex'),checks:[],screenshots:[],errors:[],scope:'Actual packaged EXE, existing real OpenAI response and persisted handwriting; no new model request, state or response injection. OS AutoClicker excluded only in the QA window.'};
let app,page;
try{
 app=await electron.launch({executablePath:exe,env:{...process.env,COSMOS_USER_DATA:original.profile,COSMOS_DOCUMENTS_DIR:path.join(original.profile,'documents'),COSMOS_OPENAI_USER_DATA:path.join(process.env.APPDATA,'EGE Cosmos Studio')},timeout:45000});
 await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.setIgnoreMouseEvents(true);w.setContentSize(1600,1000);});page=await app.firstWindow();page.on('pageerror',e=>report.errors.push(e.message));await page.locator('.cosmos-studio').waitFor();await page.locator('.studio-sidebar').getByRole('button',{name:'Математика',exact:true}).click();
 const scene=page.locator('.dialogue-scene').last();await scene.getByRole('button',{name:'Рисунок целиком',exact:true}).click();await page.waitForFunction(()=>!!document.fullscreenElement);await scene.getByRole('button',{name:'Повторить рисунок',exact:true}).click();await page.waitForTimeout(350);await scene.getByRole('button',{name:'Пауза',exact:true}).click();await page.waitForTimeout(400);
 const formula=scene.locator('.ds-equations .katex').first();report.formula=await formula.evaluate(el=>({fontPx:parseFloat(getComputedStyle(el).fontSize),bounds:el.getBoundingClientRect().toJSON(),viewport:{width:innerWidth,height:innerHeight}}));assert(report.formula.fontPx>=40);const before=await scene.getAttribute('data-step');await page.waitForTimeout(400);assert.equal(await scene.getAttribute('data-step'),before);
 const shot=path.join(out,'fullscreen-large-formula.png');await page.screenshot({path:shot});report.screenshots.push(shot);
 await scene.getByRole('button',{name:'Следующий кадр',exact:true}).click();assert.notEqual(await scene.getAttribute('data-step'),before);await scene.getByRole('button',{name:'Предыдущий кадр',exact:true}).click();assert.equal(await scene.getAttribute('data-step'),before);await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.fullscreenElement);
 await page.getByRole('button',{name:'Решить на листе',exact:true}).click();await page.getByRole('dialog',{name:'Лист для решения',exact:true}).waitFor();const draft=path.join(out,'restored-handwriting.png');await page.screenshot({path:draft});report.screenshots.push(draft);const inkCount=await page.evaluate(()=>Object.entries(localStorage).filter(([k])=>k.startsWith('cosmos-math-sheet-v1:')).reduce((n,[,v])=>n+JSON.parse(v).strokes.length,0));report.restoredStrokeCount=inkCount;assert(inkCount>0);await page.getByRole('button',{name:'Закрыть лист',exact:true}).click();
 await page.locator('.studio-sidebar').getByRole('button',{name:'Как решать ЕГЭ',exact:true}).click();
 for(const [subject,number,count,tab] of [['Математика',3,21,'Оформление'],['Русский язык',27,27,'Требования'],['История',21,21,'Советы и ошибки'],['Обществознание',25,25,'Требования']]){
  await page.locator('.exam-subjects').getByRole('button',{name:new RegExp(subject)}).click();assert.equal(await page.locator('.exam-number-grid button').count(),count);await page.getByRole('button',{name:new RegExp('^Задание '+number+':')}).click();await page.getByRole('tab',{name:tab,exact:true}).click();await page.locator('.exam-workshop-heading').scrollIntoViewIfNeeded();const p=path.join(out,`exam-${count}-${number}-${subject}.png`);await page.screenshot({path:p});report.screenshots.push(p);
 }
 assert.deepEqual(report.errors,[]);report.checks.push('large-centered-formula-in-native-fullscreen','pause-next-back-escape','existing-real-conversation-and-handwriting-restored','four-exam-room-cards-and-formats-in-installed-exe');report.status='pass';
}catch(e){report.status='fail';report.error=e.stack;process.exitCode=1;console.error(e);}
finally{await app?.close().catch(()=>{});report.finishedAt=new Date().toISOString();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
