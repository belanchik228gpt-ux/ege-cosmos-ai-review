import { _electron as electron, chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const source=JSON.parse(await fs.readFile(process.env.COSMOS_DIALOGUE_REPORT || 'docs/verification/overnight-dialogue-0.7.5/report.json','utf8'));
const exe=path.resolve(process.env.COSMOS_EXE||'release/win-unpacked/EGE Cosmos.exe');
const profile=source.profile;
const out=path.resolve(process.env.COSMOS_REVIEW_OUT || 'docs/verification/overnight-document-0.7.5');await fs.mkdir(out,{recursive:true});
const report={status:'running',exe,profile,files:[],screenshots:[],errors:[]};let app,page,browser;
const button=name=>page.getByRole('button',{name,exact:true});
async function state(){return page.evaluate(()=>window.cosmos.loadState());}
async function poll(fn){for(let i=0;i<300;i++){if(await fn())return;await page.waitForTimeout(200);}throw Error('Timed out waiting for export');}
try{
 app=await electron.launch({executablePath:exe,env:{...process.env,COSMOS_USER_DATA:profile,COSMOS_DOCUMENTS_DIR:path.join(profile,'documents')},timeout:45000});page=await app.firstWindow();page.setDefaultTimeout(25000);page.on('pageerror',e=>report.errors.push(e.message));await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.setIgnoreMouseEvents(true);w.setContentSize(1280,720);});
 await page.locator('.cosmos-studio').waitFor();await page.locator('.studio-sidebar').getByRole('button',{name:'Домашние задания',exact:true}).click();
 if(!(await page.locator('.school-room').isVisible()))await page.locator('.conversation-history-list button').first().click();await page.locator('.school-room').waitFor();await button('Конспект').click();await page.locator('.school-document-preview').waitFor();
 const doc=(await state()).homeworkDesk.documents.at(-1);assert(doc.drawings.length>=2);assert(doc.content.length>2000);report.drawings=doc.drawings.length;report.contentChars=doc.content.length;
 await page.screenshot({path:path.join(out,'document-in-app.png')});report.screenshots.push('document-in-app.png');
 for(const format of ['HTML','PDF']){await button(format).click();await poll(async()=>{const d=(await state()).homeworkDesk.documents.find(x=>x.id===doc.id);return d.path?.endsWith('.'+format.toLowerCase());});const d=(await state()).homeworkDesk.documents.find(x=>x.id===doc.id);assert((await fs.stat(d.path)).size>1000);const file=path.join(out,'actual-dialogue-notes.'+format.toLowerCase());await fs.copyFile(d.path,file);report.files.push(file);}
 await app.close();app=null;
 browser=await chromium.launch({channel:'msedge',headless:true});const preview=await browser.newPage({viewport:{width:1240,height:1754}});await preview.goto(pathToFileURL(report.files[0]).href);await preview.evaluate(()=>document.fonts.ready);
 const pages=preview.locator('.album-page');report.pages=await pages.count();assert(report.pages>0);report.layout=await pages.evaluateAll(nodes=>nodes.map((n,i)=>({page:i+1,overflow:n.scrollHeight>n.clientHeight+3||n.scrollWidth>n.clientWidth+3})));
 for(const i of [...new Set([0,1,Math.floor(report.pages/2),report.pages-1])]){const file=path.join(out,`html-page-${i+1}.png`);await pages.nth(i).screenshot({path:file});report.screenshots.push(file);}
 assert(!report.layout.some(x=>x.overflow));assert.deepEqual(report.errors,[]);report.status='pass';
}catch(e){report.status='failed';report.failure=String(e.stack||e);process.exitCode=1;}
finally{if(app)await app.close();if(browser)await browser.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
