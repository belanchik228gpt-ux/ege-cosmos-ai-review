import { _electron as electron } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const exe=path.resolve(process.env.COSMOS_EXE||'release/win-unpacked/EGE Cosmos.exe'), out=path.resolve(process.env.COSMOS_QA_OUT||'docs/verification/teaching-live-native-0.4');
const profile=path.resolve(`test-results/teaching-live-native-${Date.now()}`),runtime=path.resolve('runtime');
const sha=createHash('sha256').update(await fs.readFile(path.join(path.dirname(exe),'resources/app.asar'))).digest('hex');
await fs.mkdir(out,{recursive:true});
const report={startedAt:new Date().toISOString(),exe,appAsarSha256:sha,profile,runtime,scope:'Actual unpacked Electron0.4 UI and real local Qwen; isolated profile; semantic build verified, later layout-only changes are outside this hash.',turns:[],checks:[],screenshots:[],errors:[]};
let app,page;
const save=()=>fs.writeFile(path.join(out,'result.json'),JSON.stringify(report,null,2));
async function read(){await page.waitForTimeout(220);return page.evaluate(()=>window.cosmos.loadState());}
async function session(topic){return Object.values((await read()).sessions).find(s=>s.topicId===topic);}
async function jump(query,title){await page.getByRole('button',{name:'Быстрый переход',exact:true}).click();await page.getByLabel('Поиск темы или действия').fill(query);await page.locator('.command-result').filter({hasText:title}).first().click();await page.getByLabel('Прогресс занятия',{exact:true}).waitFor();}
async function next(){await page.getByLabel('Управление ходом объяснения').getByRole('button').click();await page.waitForTimeout(170);}
function snapshot(s){return {id:s?.id,topicId:s?.topicId,taskIndex:s?.taskIndex,phase:s?.phase,teaching:s?.teaching};}
async function shot(name){await page.evaluate(()=>window.scrollTo(0,0));await page.waitForTimeout(350);await page.screenshot({path:path.join(out,`${name}.png`),fullPage:true});await page.screenshot({path:path.join(out,`${name}-viewport.png`)});report.screenshots.push({name,...await page.evaluate(()=>({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth}))});}
async function send(text,id,topic){
  const before=await session(topic),logs=await page.evaluate(()=>window.cosmos.getDiagnostics()),started=Date.now();
  await page.getByLabel('Сообщение Cosmos',{exact:true}).fill(text);await page.getByRole('button',{name:'Отправить сообщение',exact:true}).click();
  await page.waitForTimeout(300);await page.locator('.tutor-thinking').waitFor({state:'hidden',timeout:180000});
  const after=await session(topic),diag=(await page.evaluate(()=>window.cosmos.getDiagnostics())).slice(logs.length),last=after?.messages.filter(m=>m.role==='cosmos').at(-1);
  const turn={id,input:text,elapsedMs:Date.now()-started,before:snapshot(before),after:snapshot(after),reply:last,condition:await page.locator('.conversation-condition').innerText().catch(()=>null),inLesson:await page.getByLabel('Прогресс занятия',{exact:true}).count()===1,modelStatus:await page.evaluate(()=>window.cosmos.modelStatus()),diagnostics:diag,counts:{candidates:diag.filter(d=>d.scope==='model-candidate').length,reviews:diag.filter(d=>d.scope==='model-verification').length,supportedAnswers:diag.filter(d=>d.scope==='model-answer').length,plannerDecisions:diag.filter(d=>d.scope==='tutor-planner'&&d.message.startsWith('selected ')).length}};
  report.turns.push(turn);await shot(id);await save();console.log(JSON.stringify({id,elapsedMs:turn.elapsedMs,kind:last?.kind,step:after?.teaching?.activeStepId,phase:after?.teaching?.phase,counts:turn.counts,text:last?.text}));return turn;
}
try{
  app=await electron.launch({executablePath:exe,args:['--disable-backgrounding-occluded-windows'],env:{...process.env,COSMOS_USER_DATA:profile,COSMOS_DOCUMENTS_DIR:path.join(profile,'documents'),COSMOS_RUNTIME_DIR:runtime},timeout:45000});
  page=await app.firstWindow();page.setDefaultTimeout(25000);page.on('pageerror',e=>report.errors.push(e.message));await page.locator('.app-shell').waitFor();
  await page.getByLabel('Как к тебе обращаться?').fill('Алекс');await page.getByRole('button',{name:'Начнём знакомство'}).click();await page.locator('.daily-dashboard').waitFor();
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1920,1080));
  report.appInfo=await page.evaluate(()=>window.cosmos.getAppInfo());report.initialModel=await page.evaluate(()=>window.cosmos.modelStatus());assert.equal(report.appInfo.version,'0.4.0');assert.equal(report.initialModel.available,true);
  await jump('модуль числа','Модуль числа и расстояние');for(let i=0;i<4;i++)await next();assert.equal((await session('math-absolute')).taskIndex,4);
  const explain=await send('объясни как решить |x|=0','01-explain-zero','math-absolute');
  report.checks.push({name:'equation-explanation-stays-in-lesson',passed:explain.inLesson&&explain.after.taskIndex===4});
  if(explain.after.teaching?.activeStepId!=='zero-coordinate')await send('дай подсказку','01b-coordinate-support','math-absolute');
  const doubt=await send('0? я не знаю','02-uncertain-zero','math-absolute');
  report.checks.push({name:'uncertain-coordinate-accepted-as-substep',passed:doubt.after.teaching?.phase==='answered'&&doubt.after.taskIndex===4&&doubt.after.teaching?.attempts.at(-1)?.correct===true});
  const nav=await send('что дальше','03-next-without-model','math-absolute');
  report.checks.push({name:'next-is-deterministic-navigation',passed:nav.after.teaching?.activeStepId==='main'&&nav.counts.candidates===0&&nav.counts.plannerDecisions===0});
  const definition=await send('я не знаю как находить действительные объясни тему','04-definition-detour','math-absolute');
  report.checks.push({name:'meaning-of-real-roots-has-persisted-detour',passed:/definition/.test(definition.after.teaching?.activeStepId||'')&&definition.after.taskIndex===4});
  await jump('корни модуль','Корни, модуль и знаки выражений');
  const radical=await send('не понимаю что означает чему равно','05-radical-simple-example','math-radicals');
  report.checks.push({name:'radical-question-meaning-uses-simple-example',passed:/subtract|meaning/.test(radical.after.teaching?.activeStepId||'')&&/3\s*[−-]\s*5/.test(radical.condition||'')});
  report.finalDiagnostics=await page.evaluate(()=>window.cosmos.getDiagnostics());report.finalModel=await page.evaluate(()=>window.cosmos.modelStatus());
  report.counts={turns:report.turns.length,actualModelReplies:report.turns.filter(t=>t.reply?.kind==='model').length,materialReplies:report.turns.filter(t=>t.reply?.kind==='material').length,candidates:report.turns.reduce((s,t)=>s+t.counts.candidates,0),reviewCalls:report.turns.reduce((s,t)=>s+t.counts.reviews,0),supportedAnswers:report.turns.reduce((s,t)=>s+t.counts.supportedAnswers,0),plannerDecisions:report.turns.reduce((s,t)=>s+t.counts.plannerDecisions,0)};
  report.functionalPassed=report.checks.every(c=>c.passed)&&report.errors.length===0;
}catch(error){report.failure=error.stack;console.error(report.failure);if(page)await shot('failure').catch(()=>{});process.exitCode=1;}
finally{await app?.close();report.finishedAt=new Date().toISOString();report.windowsClosed=true;await save();console.log(JSON.stringify({finishedAt:report.finishedAt,checks:report.checks,counts:report.counts,failure:report.failure},null,2));}
if(report.functionalPassed===false)process.exitCode=1;
