import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { compareScenePixels } from './scene-pixel-metrics.mjs';

const root = process.cwd(), output = path.join(root, 'docs/verification/task-board-browser'), harness = path.join(root, 'test-results/task-board-qa');
await fs.mkdir(output, {recursive:true}); await fs.mkdir(harness, {recursive:true});
const cases = [
  ['russian-commas', 'russian', '«Когда наступила весна птицы вернулись домой». После какого слова нужна запятая?'],
  ['russian-members', 'russian', '«Тихий дождь начался утром». Назови сказуемое.'],
  ['history-prince', 'history', 'С каким князем связывают Крещение Руси? Назови имя.'],
  ['history-date', 'history', 'В 1861 году произошла реформа. Назови её последствие.'],
  ['social-market', 'social', 'Покупатели хотят купить 100 единиц, а продавцы предлагают 80 по той же цене. Это равновесие?'],
  ['social-cause', 'social', 'Цена товара выросла. Спрос увеличится или уменьшится?'],
  ['math-root-condition', 'math', 'Сколько корней у |x| = 0?'],
  ['math-median', 'math', 'AM — медиана, BC = 14 см. Чему равно BM?'],
];
await fs.writeFile(path.join(harness, 'index.html'), '<html lang="ru"><meta charset="utf-8"><div id="root"></div><script type="module" src="./main.tsx"></script><style>body{margin:0;overflow:auto}main.qa{max-width:920px;margin:20px auto;padding:0 18px}nav.qa{display:flex;gap:14px;margin-bottom:20px;flex-wrap:wrap}nav.qa button,nav.qa select{font:inherit;padding:8px}</style></html>');
await fs.writeFile(path.join(harness, 'main.tsx'), `import React,{useState}from'react';import{createRoot}from'react-dom/client';import'/src/ui/styles.css';import'/src/ui/tutor-workspace.css';import{TaskBoard}from'/src/ui/TaskBoard';const cases=${JSON.stringify(cases)};function QA(){const[i,setI]=useState(0),[quality,setQuality]=useState('high'),[reduced,setReduced]=useState(false),[paused,setPaused]=useState(false);const[id,subject,prompt]=cases[i];return <main className="qa"><nav className="qa"><select aria-label="Сценарий" value={i} onChange={e=>setI(Number(e.target.value))}>{cases.map(([id],i)=><option key={id} value={i}>{id}</option>)}</select><select aria-label="Качество" value={quality} onChange={e=>setQuality(e.target.value)}>{['high','medium','low','static'].map(v=><option key={v}>{v}</option>)}</select><label><input type="checkbox" checked={reduced} onChange={e=>setReduced(e.target.checked)}/>Без движения</label><label><input type="checkbox" checked={paused} onChange={e=>setPaused(e.target.checked)}/>Пауза занятия</label></nav><TaskBoard task={{id,prompt,answer:'secret answer not for scene',answerKind:'text',hints:[]}} subject={subject} quality={quality} reducedMotion={reduced} paused={paused} autoplay /></main>};createRoot(document.getElementById('root')).render(<QA/>);`);
const report = {at:new Date().toISOString(),scope:'Actual TaskBoard in headless Chrome, production component and styles. Not EXE/integrated TutorRoom/model.',sourceHash:crypto.createHash('sha256').update(await fs.readFile('src/ui/TaskBoard.tsx')).digest('hex'),cases:[],errors:[],passed:false};
const state = body => ({
  geometry:[...body.querySelectorAll('*')].map(el=>{const style=getComputedStyle(el),rect=el.getBoundingClientRect();return {tag:el.tagName,x:rect.x,y:rect.y,width:rect.width,height:rect.height,transform:style.transform,color:style.color,background:style.backgroundColor,border:style.borderColor,after:getComputedStyle(el,'::after').transform};}),
  animations:body.getAnimations({subtree:true}).map(a=>({currentTime:a.currentTime,playState:a.playState,property:a.transitionProperty,name:a.animationName})),
});
let server,browser,page;
try {
  server=await createServer({root,server:{port:5177,host:'127.0.0.1',strictPort:true},logLevel:'error'});await server.listen();
  browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  page=await browser.newPage({viewport:{width:1280,height:720},reducedMotion:'no-preference'});page.on('pageerror',e=>report.errors.push(String(e)));
  await page.goto('http://127.0.0.1:5177/test-results/task-board-qa/index.html');
  const scene=page.locator('.semantic-task-board'),body=scene.locator('.sb-body');
  for(let i=0;i<cases.length;i++) {
    const [id]=cases[i];await page.getByLabel('Сценарий').selectOption(String(i));
    await scene.getByLabel('Скорость доски').selectOption('2');
    const opening=await body.screenshot({path:path.join(output,`${id}-opening.png`)});
    await page.waitForFunction(()=>document.querySelector('.semantic-task-board')?.getAttribute('data-stage')==='1');
    await page.waitForTimeout(180);await scene.getByRole('button',{name:'Пауза',exact:true}).click();
    const stateA=await body.evaluate(state),a=await body.screenshot({path:path.join(output,`${id}-paused-a.png`)});
    await page.waitForTimeout(400);const stateB=await body.evaluate(state),b=await body.screenshot({path:path.join(output,`${id}-paused-b.png`)});
    const pixels=compareScenePixels(a,b);if(pixels.maxChannelDelta>1||JSON.stringify(stateA)!==JSON.stringify(stateB))throw Error(`${id}: paused body changed`);
    // Each actual fact/sentence reacts; captions alone must not be the whole animation.
    const animated=await body.evaluate(el=>el.getAnimations({subtree:true}).length);if(animated===0)throw Error(`${id}: no active visual transitions at pause`);
    await scene.getByRole('button',{name:'Следующий шаг доски',exact:true}).click();if(await scene.getAttribute('data-stage')!=='2')throw Error('next failed');
    await scene.screenshot({path:path.join(output,`${id}-final.png`)});
    if((await scene.innerText()).includes('secret answer'))throw Error('answer leaked');
    if(id==='russian-commas'&&(await scene.locator('.sb-sentence').innerText()).includes(','))throw Error('comma inserted');
    if(id==='history-prince'&&/(988|Владимир)/.test(await scene.innerText()))throw Error('historical answer inserted');
    await scene.getByRole('button',{name:'Предыдущий шаг доски'}).click();if(await scene.getAttribute('data-stage')!=='1')throw Error('back failed');
    await scene.getByRole('button',{name:'Повторить доску'}).click();if(await scene.getAttribute('data-stage')!=='0')throw Error('replay failed');
    await scene.getByRole('button',{name:'Пауза',exact:true}).click();
    report.cases.push({id,pixels,stableGeometryAndAnimationTime:true,activeVisualTransitions:animated,back:true,replay:true,openingBytes:opening.length});
  }
  await page.getByLabel('Сценарий').selectOption('4');await scene.getByRole('button',{name:'Пауза',exact:true}).click();
  await scene.getByLabel('Скорость доски').selectOption('0.5');if(await scene.getByLabel('Скорость доски').inputValue()!=='0.5')throw Error('speed .5 failed');
  await page.setViewportSize({width:390,height:844});await scene.getByRole('button',{name:'Следующий шаг доски',exact:true}).click();await scene.screenshot({path:path.join(output,'market-narrow.png')});
  report.narrow=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));if(report.narrow.scroll>report.narrow.width)throw Error('narrow horizontal overflow');
  await page.getByLabel('Качество',{exact:true}).selectOption('low');await scene.screenshot({path:path.join(output,'market-low.png')});
  await page.getByLabel('Качество',{exact:true}).selectOption('static');await scene.getByRole('button',{name:'Следующий шаг доски',exact:true}).click();
  if(!await scene.getByRole('button',{name:'Смотреть',exact:true}).isDisabled())throw Error('static play enabled');
  if((await body.evaluate(el=>el.getAnimations({subtree:true}).length))!==0)throw Error('static animations exist');await scene.screenshot({path:path.join(output,'market-static.png')});
  await page.getByLabel('Качество',{exact:true}).selectOption('high');await page.getByLabel('Без движения',{exact:true}).check();
  if(!await scene.getByRole('button',{name:'Смотреть',exact:true}).isDisabled())throw Error('reduced play enabled');
  await page.getByLabel('Без движения',{exact:true}).uncheck();await page.getByLabel('Пауза занятия',{exact:true}).check();
  if(await scene.locator('button:not(:disabled),select:not(:disabled)').count())throw Error('external pause controls enabled');
  report.controls={speedHalf:true,speedDouble:true,reduced:true,static:true,externalPause:true};report.passed=report.errors.length===0;
} catch(error) {report.failure=String(error);process.exitCode=1;if(page)await page.screenshot({path:path.join(output,'failure.png'),fullPage:true}).catch(()=>{});}
finally {await browser?.close();await server?.close();await fs.writeFile(path.join(output,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
