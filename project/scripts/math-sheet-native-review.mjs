import { _electron as electron } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const exe=path.resolve(process.env.COSMOS_EXE || 'release/win-unpacked/EGE Cosmos.exe');
const out=path.resolve(process.env.COSMOS_QA_OUT || 'docs/verification/math-sheet-0.5.1');
const profile=path.resolve(process.env.COSMOS_QA_PROFILE || `test-results/math-sheet-${Date.now()}`);
const live=process.env.COSMOS_LIVE==='1';
await fs.mkdir(out,{recursive:true});
const result={status:'running',exe,profile,startedAt:new Date().toISOString(),asarSha256:createHash('sha256').update(await fs.readFile(path.join(path.dirname(exe),'resources/app.asar'))).digest('hex'),checks:[],screenshots:[],replies:[],errors:[],limits:['Actual mouse/pointer drawing and toolbar in packaged EXE, no response or state injection. Existing OpenAI authentication reused only when COSMOS_LIVE=1. Native OS clicks isolated with setIgnoreMouseEvents(true) because an elevated AutoClicker is running; Playwright pointer events drive the real EXE canvas. User credentials never read or copied. Learning data isolated.']};
let app,page;
async function poll(check,timeout=30000){const deadline=Date.now()+timeout;while(Date.now()<deadline){if(await check())return;await new Promise(r=>setTimeout(r,150));}throw new Error('Timed out waiting for persisted/native condition');}

const button=(name)=>page.getByRole('button',{name,exact:true});
const nav=(name)=>page.locator('.studio-sidebar').getByRole('button',{name,exact:true});
const sheet=()=>page.getByRole('dialog',{name:'Лист для решения',exact:true});
const canvas=()=>sheet().locator('canvas');
async function size(width,height){await app.evaluate(({BrowserWindow},{width,height})=>{const w=BrowserWindow.getAllWindows()[0];w.setContentSize(width,height);w.showInactive();},{width,height});await page.waitForTimeout(500);}
async function shot(name){const p=path.join(out,`${name}.png`);await page.screenshot({path:p});result.screenshots.push(p);}
async function open(){await button('Решить на листе').click();await sheet().waitFor();await page.waitForTimeout(300);}
async function close(){await button('Закрыть лист').click();}
async function pixels(){const value=await canvas().evaluate(async c=>{await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return c.toDataURL('image/png');});return createHash('sha256').update(value).digest('hex');}
async function stroke(points){const r=await canvas().boundingBox();assert(r);const map=p=>[r.x+p[0]*r.width/1400,r.y+p[1]*r.height/900];await page.mouse.move(...map(points[0]));await page.mouse.down();for(const p of points.slice(1))await page.mouse.move(...map(p),{steps:3});await page.mouse.up();}
async function launch(){const fresh=!(await fs.stat(path.join(profile,'learning-state.v1.json')).catch(()=>null));app=await electron.launch({executablePath:exe,env:{...process.env,COSMOS_USER_DATA:profile,COSMOS_DOCUMENTS_DIR:path.join(profile,'documents'),COSMOS_OPENAI_USER_DATA:live?path.join(process.env.APPDATA,'EGE Cosmos Studio'):path.join(profile,'isolated-auth')},timeout:45000});await app.evaluate(({BrowserWindow})=>{for(const w of BrowserWindow.getAllWindows())w.setIgnoreMouseEvents(true);});page=await app.firstWindow();page.setDefaultTimeout(20000);page.on('pageerror',e=>result.errors.push(e.message));await page.evaluate(()=>{window.__sheetEvents=[];for(const type of ['pointerdown','pointerup','click','keydown'])window.addEventListener(type,e=>window.__sheetEvents.push({type,time:Date.now(),x:e.clientX,y:e.clientY,key:e.key,target:e.target.tagName,text:(e.target.innerText||'').slice(0,40),trusted:e.isTrusted}),true);});await page.locator('.cosmos-studio').waitFor();await size(1600,1000);if(fresh){await page.locator('.welcome-modal input').fill('Проверка листа');await button('Начнём знакомство').click().catch(async e=>{if(await page.locator('.welcome-modal').isVisible())throw e;});await page.locator('.welcome-modal').waitFor({state:'hidden'});}await nav('Математика').click();await page.locator('.studio-chat').waitFor();}
// These glyphs are written through real pointer events. They are not injected pixels or OCR text.
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
async function answer(name){const count=await page.locator('.studio-message.assistant:not(.streaming)').count(),started=Date.now();await button('Проверить решение').click();await sheet().waitFor({state:'hidden'});await page.waitForFunction(count=>document.querySelectorAll('.studio-message.assistant:not(.streaming)').length>count || !!document.querySelector('.studio-chat-error'),count,{timeout:170000});assert.equal(await page.locator('.studio-chat-error').count(),0);const last=page.locator('.studio-message.assistant:not(.streaming)').last();const text=await last.innerText();result.replies.push({name,text,elapsedMs:Date.now()-started});console.log(JSON.stringify(result.replies.at(-1)));await last.scrollIntoViewIfNeeded();await shot(name);return last;}
try{
 await launch();
 if(!process.env.COSMOS_RESUME_AFTER_WRONG){
 const chat=await page.locator('.studio-chat').boundingBox();assert(chat.width>1250);await shot('01-wide-room');result.checks.push('wide-chat-default-topic-and-phase-retained');
 await open();assert(await button('Проверить решение').isDisabled());const blank=await pixels();
 await stroke([[180,120],[220,180],[280,120]]);const marked=await pixels();assert.notEqual(marked,blank);
 await button('Отменить штрих').click();assert.equal(await pixels(),blank);await button('Вернуть штрих').click();assert.equal(await pixels(),marked);
 await button('Ластик').click();await stroke([[220,180],[225,182]]);assert.notEqual(await pixels(),marked);await button('Отменить штрих').click();assert.equal(await pixels(),marked);
 for(const name of ['Прямая','Прямоугольник','Овал']){await button(name).click();await stroke([[350,120],[480,200]]);}
 await button('Надпись').click();await page.getByLabel('Текст надписи',{exact:true}).fill('Моё решение');await stroke([[620,150]]);await page.getByLabel('Условие или пояснение — по желанию',{exact:true}).fill('Проверка черновика');
 const saved=await pixels();await shot('02-sheet-tools');await close();await open();assert.equal(await pixels(),saved);result.checks.push('pen-eraser-shapes-text-undo-redo-close-restore');
 await page.getByLabel('Масштаб листа',{exact:true}).selectOption('2');await button('Карандаш').click();await stroke([[130,100],[150,130]]);await page.getByLabel('Масштаб листа',{exact:true}).selectOption('1');
 const draftBefore=await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage).filter(([k])=>k.startsWith('cosmos-math-sheet-v1:'))));
 await button('Очистить лист').click();assert.equal(await pixels(),blank);await button('Отменить штрих').click();assert.notEqual(await pixels(),blank);
 await button('Скачать PNG').click();await page.locator('.sheet-export-path').waitFor();const pngPath=await page.locator('.sheet-export-path').getAttribute('data-path');assert((await fs.stat(pngPath)).size>2000);await fs.copyFile(pngPath,path.join(out,'actual-sheet-export.png'));result.pngPath=pngPath;
 result.checks.push('zoom-maps-points-clear-undo-actual-png-download');
 await size(1280,720);await shot('03-sheet-1280');assert((await button('Проверить решение').boundingBox()).y<720);await size(700,850);await shot('04-sheet-narrow');assert((await sheet().boundingBox()).width<700);await size(1600,1000);
 await close();await nav('Русский язык').click();assert.equal(await button('Решить на листе').count(),0);await nav('Математика').click();await open();assert.notEqual(await pixels(),blank);await close();
 await button('Новое занятие').click();await open();assert.equal(await pixels(),blank);await close();result.checks.push('math-only-and-separate-draft-per-lesson');
 await app.close();await launch();const draftAfter=await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage).filter(([k])=>k.startsWith('cosmos-math-sheet-v1:'))));assert.deepEqual(draftAfter,draftBefore);result.checks.push('real-process-restart-restores-draft-storage');
 }
 if(live){
  await poll(()=>page.evaluate(async()=>(await window.cosmos.getOpenAIStatus()).authenticated===true));
  if(!process.env.COSMOS_RESUME_AFTER_WRONG){await open();await write('2x+3=11',180,100);await write('2x=8',180,230);await write('x=5',180,360);await shot('05-handwritten-wrong');await answer('06-real-wrong-solution-review');}
  const scene=page.locator('.dialogue-scene').last();assert(await scene.count());await scene.getByRole('button',{name:'Рисунок целиком',exact:true}).click();await page.waitForFunction(()=>!!document.fullscreenElement);await shot('07-full-scene');
  await scene.getByRole('button',{name:'Повторить рисунок',exact:true}).click();await page.waitForTimeout(350);if(await scene.getByRole('button',{name:'Пауза',exact:true}).isEnabled())await scene.getByRole('button',{name:'Пауза',exact:true}).click();
  const before=await scene.getAttribute('data-step');await page.waitForTimeout(600);assert.equal(await scene.getAttribute('data-step'),before);await scene.getByRole('button',{name:'Следующий кадр',exact:true}).click();assert.notEqual(await scene.getAttribute('data-step'),before);await scene.getByRole('button',{name:'Предыдущий кадр',exact:true}).click();assert.equal(await scene.getAttribute('data-step'),before);await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.fullscreenElement);result.checks.push('real-openai-scene-fullscreen-pause-next-back-escape');
  await open();await button('Очистить лист').click();await write('2x+3=11',180,100);await write('2x=8',180,230);await write('x=4',180,360);await shot('08-handwritten-correct');await answer('09-real-correct-solution-review');result.checks.push('two-real-image-reviews-through-math-sheet-button');
  const state=await page.evaluate(()=>window.cosmos.loadState());const m=Object.values(state.cloudSessions).filter(l=>l.subject==='math').flatMap(l=>l.messages);assert(m.filter(m=>m.imageName==='Моё рукописное решение.png').length===2);
  await open();const finalPixels=await pixels();await close();await app.close();await launch();await open();assert.equal(await pixels(),finalPixels);await shot('10-restored-solution');await close();assert((await page.evaluate(()=>window.cosmos.getOpenAIStatus())).authenticated);result.checks.push('checked-handwriting-and-auth-restored-after-restart');
 }
 assert.deepEqual(result.errors,[]);result.status='pass';
}catch(e){result.status='fail';result.failure=e.stack;result.events=await page.evaluate(()=>window.__sheetEvents).catch(()=>[]);result.sheetAudit=await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage).filter(([k])=>k.startsWith('cosmos-math-sheet-v1:')))).catch(()=>({}));console.error(e);if(page)await shot('failure').catch(()=>{});process.exitCode=1;}
finally{if(app)await app.close().catch(()=>{});result.finishedAt=new Date().toISOString();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({status:result.status,checks:result.checks}));}
