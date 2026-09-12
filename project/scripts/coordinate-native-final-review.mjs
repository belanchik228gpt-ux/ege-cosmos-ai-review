import {_electron as electron} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const original=JSON.parse(await fs.readFile('docs/verification/overnight-dialogue-0.7.5/report.json','utf8'));
const exe=path.resolve('release/win-unpacked/EGE Cosmos.exe');
const out=path.resolve('docs/verification/coordinate-native-final-0.7.5');await fs.mkdir(out,{recursive:true});
const report={status:'running',exe,profile:original.profile,requests:0,checks:[],screenshots:[],errors:[],asarSha256:createHash('sha256').update(await fs.readFile(path.join(path.dirname(exe),'resources/app.asar'))).digest('hex')};
let app,page;
try{
 app=await electron.launch({executablePath:exe,env:{...process.env,COSMOS_USER_DATA:original.profile},timeout:45000});page=await app.firstWindow();page.setDefaultTimeout(20000);page.on('pageerror',e=>report.errors.push(e.message));
 await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.setIgnoreMouseEvents(true);w.setContentSize(1440,900);});
 await page.locator('.cosmos-studio').waitFor();
 await page.locator('.studio-sidebar').getByRole('button',{name:'Домашние задания',exact:true}).click();
 await page.waitForTimeout(300);
 if(await page.getByRole('button',{name:'К домашним заданиям',exact:true}).isVisible())await page.getByRole('button',{name:'К домашним заданиям',exact:true}).click();
 if(!await page.locator('.school-room').isVisible())await page.locator('.homework-work').first().click();
 await page.locator('.school-room').waitFor();
 for(const index of [2,4]){
  const answer=original.turns.find(t=>t.index===index).answer;
  const article=page.locator(`[data-message-id="${answer.id}"]`);
  const scene=article.locator('.dialogue-scene');await scene.scrollIntoViewIfNeeded();
  await scene.getByRole('button',{name:'Рисунок целиком',exact:true}).click();
  await scene.locator('.ds-dots button').last().click();
  await page.waitForTimeout(400);
  const labels=await scene.innerText(),svg=await scene.locator('svg[role="img"]').first().getAttribute('aria-label');
  assert.equal(await scene.locator('.ds-point').count(),3);
  assert.equal(await scene.locator('.ds-travel').count(),0);
  assert(!labels.includes('Выделено множество решений'));
  assert.equal(svg,index===2?'Числовая прямая: -1, 2, 5':'Числовая прямая: -4, 0, 5');
  const file=path.join(out,`turn-${index}-coordinate-points.png`);await page.screenshot({path:file});report.screenshots.push(file);
  report.checks.push({turn:index,answerId:answer.id,svg,labels,points:3,falseIntervalFill:false});
  await scene.getByRole('button',{name:'Вернуться к переписке',exact:true}).click();
 }
 assert.deepEqual(report.errors,[]);report.status='pass';
}catch(e){report.status='needs-review';report.failure=String(e.stack||e);if(page)await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});process.exitCode=1;}
finally{if(app)await app.close().catch(()=>{});await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
