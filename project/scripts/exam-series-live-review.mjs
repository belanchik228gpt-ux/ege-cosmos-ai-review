import { _electron as electron } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createInterface} from 'node:readline';
const exe=path.resolve(process.env.COSMOS_EXE || 'release/win-unpacked/EGE Cosmos.exe');
const out=path.resolve(process.env.COSMOS_QA_OUT || 'docs/verification/exam-series-live-0.5.1');
const profile=path.resolve(process.env.COSMOS_QA_PROFILE || `test-results/exam-series-live-${Date.now()}`);
await fs.mkdir(out,{recursive:true});
const result={status:'running',exe,profile,startedAt:new Date().toISOString(),asarSha256:createHash('sha256').update(await fs.readFile(path.join(path.dirname(exe),'resources/app.asar'))).digest('hex'),checks:[],screenshots:[],replies:[],documents:[],errors:[],limits:['Real packaged EXE and existing OpenAI sign-in, isolated learning profile. Native OS AutoClicker isolated; Playwright pointer events draw actual canvas. Human-agent computes answers from actual model questions; no response or learning-state injection.']};
let app,page;
async function poll(check,timeout=30000){const deadline=Date.now()+timeout;while(Date.now()<deadline){if(await check())return;await new Promise(r=>setTimeout(r,150));}throw new Error('Timed out waiting for persisted/native condition');}

let commandNumber=0;
async function command(){const file=path.join(out,`drawing-command-${++commandNumber}.json`);const deadline=Date.now()+300000;console.log(JSON.stringify({commandFile:file}));while(Date.now()<deadline){try{return JSON.parse(await fs.readFile(file,'utf8'));}catch{}await new Promise(r=>setTimeout(r,300));}throw new Error('No QA drawing command within 5 minutes');}
const button=name=>page.getByRole('button',{name,exact:true});
const nav=name=>page.locator('.studio-sidebar').getByRole('button',{name,exact:true});
const sheet=()=>page.getByRole('dialog',{name:'Лист для решения',exact:true});
const canvas=()=>sheet().locator('canvas');
async function shot(name){const file=path.join(out,`${name}.png`);await page.screenshot({path:file});result.screenshots.push(file);}
async function stroke(points){const r=await canvas().boundingBox();assert(r);const map=p=>[r.x+p[0]*r.width/1400,r.y+p[1]*r.height/900];await page.mouse.move(...map(points[0]));await page.mouse.down();for(const p of points.slice(1))await page.mouse.move(...map(p),{steps:3});await page.mouse.up();}
async function reply(action,name){const count=await page.locator('.studio-message.assistant:not(.streaming)').count();const started=Date.now();await action();await page.waitForFunction(n=>document.querySelectorAll('.studio-message.assistant:not(.streaming)').length>n || !!document.querySelector('.studio-chat-error'),count,{timeout:170000});assert.equal(await page.locator('.studio-chat-error').count(),0);await poll(()=>page.evaluate(async n=>Object.values((await window.cosmos.loadState()).cloudSessions).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0].messages.filter(m=>m.role==='assistant').length>n,count));const state=await page.evaluate(()=>window.cosmos.loadState());const l=Object.values(state.cloudSessions).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0];const answer=l.messages.filter(m=>m.role==='assistant').at(-1);result.replies.push({name,text:answer.text,question:answer.question,phase:answer.phase,drawing:answer.drawing,elapsedMs:Date.now()-started});console.log(JSON.stringify({reply:result.replies.at(-1)}));await shot(name);return answer;}
async function send(text,name){await page.getByLabel('Сообщение Cosmos',{exact:true}).fill(text);return reply(()=>button('Отправить сообщение').click(),name);}
async function exportLesson(name){const before=(await page.evaluate(()=>window.cosmos.loadState())).documents.length;await button('Сохранить конспект').click();await poll(()=>page.evaluate(async n=>(await window.cosmos.loadState()).documents.length>n,before));const doc=(await page.evaluate(()=>window.cosmos.loadState())).documents.at(-1);assert(doc.drawings?.length>=1,'Real topic must include drawings');assert((await fs.stat(doc.path)).size>3000);result.documents.push({id:doc.id,title:doc.title,html:doc.path,drawings:doc.drawings.length,steps:doc.drawings.reduce((n,d)=>n+d.steps.length,0)});await nav('Мои конспекты').click();await page.locator('.saved-document').filter({hasText:doc.title}).first().click();await page.getByRole('button',{name:'Предпросмотр',exact:true}).click();await shot(`${name}-preview`);await page.getByLabel('Формат',{exact:true}).selectOption('pdf');await button('Сохранить и экспортировать').click();await poll(()=>page.evaluate(async id=>(await window.cosmos.loadState()).documents.find(d=>d.id===id)?.path?.endsWith('.pdf'),doc.id),60000);const pdf=(await page.evaluate(()=>window.cosmos.loadState())).documents.find(d=>d.id===doc.id).path;assert((await fs.stat(pdf)).size>5000);assert.equal((await fs.readFile(pdf)).subarray(0,5).toString(),'%PDF-');result.documents.at(-1).pdf=pdf;await fs.copyFile(pdf,path.join(out,`${name}.pdf`));await button('Закрыть документ').click();}
const glyph={
 '2':[[[0,12],[12,0],[35,0],[48,12],[48,25],[0,65],[50,65]]],
 '3':[[[0,0],[48,0],[24,30],[45,35],[50,50],[40,65],[0,65]]],
 '4':[[[38,0],[0,43],[52,43]],[[38,0],[38,67]]],
 '5':[[[50,0],[0,0],[0,30],[32,30],[49,42],[49,54],[35,65],[0,65]]],
 '8':[[[12,0],[38,0],[50,13],[38,28],[12,35],[0,48],[12,65],[38,65],[50,50],[38,35],[12,28],[0,13],[12,0]]],
 '1':[[[10,10],[25,0],[25,65]],[[8,65],[45,65]]],
 'x':[[[0,8],[45,60]],[[45,8],[0,60]]],
 '+':[[[0,32],[50,32]],[[25,7],[25,57]]],
 '=':[[[0,22],[50,22]],[[0,43],[50,43]]],
};
async function write(text,x,y){for(const ch of text){if(glyph[ch])for(const points of glyph[ch])await stroke(points.map(([a,b])=>[x+a,y+b]));x+=74;}}

Object.assign(glyph,{
 '0':[[[10,0],[40,0],[50,15],[50,50],[40,65],[10,65],[0,50],[0,15],[10,0]]],
 '6':[[[48,0],[18,0],[0,25],[0,55],[14,65],[40,65],[50,50],[40,35],[0,35]]],
 '7':[[[0,0],[50,0],[14,65]]],
 '9':[[[50,30],[0,30],[0,0],[50,0],[50,65],[8,65]]],
 '/':[[[45,0],[0,65]]],'-':[[[0,32],[50,32]]],'.':[[[20,64],[24,64]]],
 '*':[[[0,12],[50,52]],[[50,12],[0,52]],[[25,0],[25,65]]],
 '(':[[[30,0],[10,20],[10,45],[30,65]]],')':[[[10,0],[30,20],[30,45],[10,65]]],
});
try {
 app=await electron.launch({executablePath:exe,env:{...process.env,COSMOS_USER_DATA:profile,COSMOS_DOCUMENTS_DIR:path.join(profile,'documents'),COSMOS_OPENAI_USER_DATA:path.join(process.env.APPDATA,'EGE Cosmos Studio')},timeout:45000});
 await app.evaluate(({BrowserWindow})=>{for(const w of BrowserWindow.getAllWindows()){w.setIgnoreMouseEvents(true);w.setContentSize(1600,1000);}});
 page=await app.firstWindow();page.setDefaultTimeout(25000);page.on('pageerror',e=>result.errors.push(e.message));if(!process.env.COSMOS_EXAM_RESUME){await page.locator('.welcome-modal input').fill('Проверка экзамена');await button('Начнём знакомство').click();}else await page.locator('.cosmos-studio').waitFor();
 await poll(()=>page.evaluate(async()=>(await window.cosmos.getOpenAIStatus()).authenticated===true));
 if(!process.env.COSMOS_EXAM_RESUME){await nav('Как решать ЕГЭ').click();await page.getByRole('button',{name:/^Задание 3:/}).click();await shot('01-task3-requirements');await page.getByRole('tab',{name:'Оформление',exact:true}).click();await shot('02-format');await page.getByLabel('Количество примеров',{exact:true}).fill('2');await button('Открыть тренировку').click();
 await reply(()=>button('Начать серию').click(),'03-first-question');}else{await nav('Математика').click();console.log(JSON.stringify({resumed:(await page.evaluate(()=>window.cosmos.loadState())).cloudSessions}));}
 for(let n=1;n<=2;n++){
   console.log(JSON.stringify({needsDrawing:n,instruction:'Supply JSON {lines:["digits and +-=/*()x only"],context:"optional text"} for the actual task above.'}));const action=await command();assert(Array.isArray(action.lines)&&action.lines.length<=5);for(const line of action.lines)assert(typeof line==='string'&&line.length<=16&&/^[0123456789x+*/=(). -]+$/.test(line));
   await button('Решить на листе').click();await sheet().waitFor();await page.waitForTimeout(300);assert(await button('Проверить решение').isDisabled(),'Every series example opens an independent empty draft');
   for(let i=0;i<action.lines.length;i++)await write(action.lines[i],110,85+i*130);
   if(action.context)await page.getByLabel('Условие или пояснение — по желанию',{exact:true}).fill(action.context);
   await shot(`04-example-${n}-handwriting`);await reply(()=>button('Проверить решение').click(),`05-example-${n}-review`);
   const series=(await page.evaluate(()=>window.cosmos.loadState())).cloudSessions;const l=Object.values(series).find(l=>l.examTraining);assert.equal(l.topicId,'exam-math-3');assert(l.examTraining.completed.includes(n));assert.equal(l.examTraining.current,n);
   if(n<2)await reply(()=>button('Следующий пример').click(),'06-next-question');
 }
 await reply(()=>button('Итог серии').click(),'07-series-summary');await exportLesson('math-series');result.checks.push('two-live-authored-exam3-examples-handwritten-reviewed-separate-drafts-summary-html-pdf');
 await nav('Русский язык').click();await send('Объясни маленькими шагами разницу между главным и придаточным предложением на фразе «Я знаю, что ты придёшь». Покажи разбор в 3 понятных кадрах. Пока один вопрос мне.','08-russian-explanation');
 await send('Главная часть «Я знаю», придаточная «что ты придёшь» поясняет, что именно знаю. Запятая перед «что». Верно?','09-russian-answer');
 await reply(()=>button('Завершить занятие').click(),'10-russian-summary');await exportLesson('russian-lesson');result.checks.push('second-actual-topic-dialogue-summary-html-pdf');
 const saved=await page.evaluate(()=>window.cosmos.loadState());await app.close();app=null;
 result.savedCloudLessons=Object.values(saved.cloudSessions).map(l=>({id:l.id,subject:l.subject,title:l.title,completed:!!l.completedAt,messages:l.messages.length,training:l.examTraining}));
 assert.deepEqual(result.errors,[]);result.status='pass';
}catch(e){result.status='fail';result.failure=e.stack;console.error(e);if(page)await shot('failure').catch(()=>{});process.exitCode=1;}
finally{await app?.close().catch(()=>{});result.finishedAt=new Date().toISOString();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({status:result.status,checks:result.checks,documents:result.documents}));}
