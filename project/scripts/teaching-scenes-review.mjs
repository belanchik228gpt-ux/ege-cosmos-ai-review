import fs from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'vite';
import {chromium} from 'playwright';
import {compareScenePixels,readSceneVisualState} from './scene-pixel-metrics.mjs';
const root=process.cwd(),expose=process.env.TEACHING_REVEAL!=='0',output=path.join(root,`docs/verification/teaching-scenes-browser${expose?'':'-independent'}`),harness=path.join(root,'test-results/teaching-scenes-qa');
await fs.mkdir(output,{recursive:true});await fs.mkdir(harness,{recursive:true});
const cases=[
  ['distance',{kind:'distance',value:-7}],['zero-distance',{kind:'distance',value:0}],
  ['zero-roots',{kind:'zero-root',center:0}],['negative-radius',{kind:'negative-radius',center:0,radius:-3}],
  ['shifted',{kind:'shifted-modulus',center:2,radius:3}],['subtraction',{kind:'subtraction',start:3,subtract:5}],
  ['sign',{kind:'sign',boundary:4,relation:'lt',offset:4}],['compare',{kind:'compare',left:{radicand:7},right:4}],
  ['expression',{kind:'expression',condition:'x < a',workedExample:true,lines:[{text:'√((x − a)²)',focus:'x − a'},{text:'|x − a|',focus:'x − a'},{text:'−(x − a)',focus:'−'},{text:'−x + a',focus:'+'}]}],
];
await fs.writeFile(path.join(harness,'index.html'),'<html lang="ru"><meta charset="utf-8"><div id="root"></div><script type="module" src="./main.tsx"></script><style>body{margin:0;background:#100c19;color:#f4edff;font:16px Segoe UI;--accent:#bc9bf4;--muted:#c7bad9}main{max-width:950px;margin:20px auto;padding:0 18px}nav{display:flex;gap:14px;margin-bottom:20px;flex-wrap:wrap}nav button,nav select{font:inherit;padding:8px}*{box-sizing:border-box}</style></html>');
await fs.writeFile(path.join(harness,'main.tsx'),`import React,{useState}from'react';import{createRoot}from'react-dom/client';import{TeachingScene}from'/src/scenes/TeachingScene';const cases=${JSON.stringify(cases)};function QA(){const[i,setI]=useState(0);const[quality,setQuality]=useState('high');const[reveal,setReveal]=useState(${expose});return <main><nav><select aria-label="Сценарий" value={i} onChange={e=>setI(Number(e.target.value))}>{cases.map(([id],i)=><option key={id} value={i}>{id}</option>)}</select><select aria-label="Качество" value={quality} onChange={e=>setQuality(e.target.value)}>{['high','medium','low','static'].map(v=><option key={v}>{v}</option>)}</select><label><input type="checkbox" checked={reveal} onChange={e=>setReveal(e.target.checked)}/>Ответ открыт</label></nav><TeachingScene visual={cases[i][1]} quality={quality} revealAnswer={reveal} autoplay initialSpeed={2}/></main>};createRoot(document.getElementById('root')).render(<QA/>);`);
let server,browser,page;
const report={at:new Date().toISOString(),scope:'Actual TeachingScene in headless Chrome component harness; not EXE, no model',revealAnswer:expose,cases:[],errors:[],passed:false};
try{
  server=await createServer({root,server:{port:5177,host:'127.0.0.1',strictPort:true},logLevel:'error'});await server.listen();
  browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  page=await browser.newPage({viewport:{width:1280,height:900},reducedMotion:'no-preference'});page.on('pageerror',e=>report.errors.push(String(e)));
  await page.goto('http://127.0.0.1:5177/test-results/teaching-scenes-qa/index.html');
  const scene=page.locator('.teaching-scene'),body=scene.locator('.ts-body'),svg=body.locator('svg');
  for(let i=0;i<cases.length;i++){
    const [id]=cases[i];await page.getByLabel('Сценарий').selectOption(String(i));
    await page.waitForFunction(()=>document.querySelector('.teaching-scene')?.getAttribute('data-stage')==='build');
    await page.waitForTimeout(180);await scene.getByRole('button',{name:'Пауза',exact:true}).click();
    if(id!=='expression'&&await svg.locator('.ts-traveller[data-move="true"]').count()===0)throw Error(`${id}: construction held at orient`);
    const stateA=await body.evaluate(readSceneVisualState),a=await svg.screenshot({path:path.join(output,`${id}-paused-a.png`)});
    await page.waitForTimeout(450);
    const stateB=await body.evaluate(readSceneVisualState),b=await svg.screenshot({path:path.join(output,`${id}-paused-b.png`)}),pixels=compareScenePixels(a,b);
    if(pixels.maxChannelDelta>1||JSON.stringify(stateA)!==JSON.stringify(stateB))throw Error(`${id}: pause changed visual`);
    await scene.getByRole('button',{name:'Следующий кадр объяснения',exact:true}).click();
    await scene.getByRole('button',{name:'Следующий кадр объяснения',exact:true}).click();
    await scene.screenshot({path:path.join(output,`${id}-final.png`)});
    await scene.getByRole('button',{name:'Предыдущий кадр объяснения'}).click();if(await scene.getAttribute('data-stage')!=='compare')throw Error('back failed');
    await scene.getByRole('button',{name:'Повторить учебный шаг'}).click();if(await scene.getAttribute('data-stage')!=='orient')throw Error('replay failed');
    await scene.getByRole('button',{name:'Пауза',exact:true}).click();
    report.cases.push({id,pixels,stableState:true,back:true,replay:true});
  }
  await page.setViewportSize({width:390,height:844});await scene.screenshot({path:path.join(output,'expression-narrow.png')});
  const size=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));if(size.scroll>size.width)throw Error('narrow overflow');report.narrow=size;
  await page.getByLabel('Качество',{exact:true}).selectOption('low');await scene.screenshot({path:path.join(output,'expression-low.png')});
  await page.getByLabel('Качество',{exact:true}).selectOption('static');await scene.getByRole('button',{name:'Следующий кадр объяснения',exact:true}).click();await scene.screenshot({path:path.join(output,'expression-static.png')});
  if(!await scene.getByRole('button',{name:'Смотреть',exact:true}).isDisabled())throw Error('static play enabled');
  await page.getByLabel('Сценарий').selectOption('2');await page.getByLabel('Ответ открыт').uncheck();
  for(let i=0;i<3;i++)await scene.getByRole('button',{name:'Следующий кадр объяснения',exact:true}).click();
  if((await scene.innerText()).includes('Один различный корень')||(await scene.innerText()).includes('Разных точек:'))throw Error('independent result label leaked');
  await scene.screenshot({path:path.join(output,'zero-independent.png')});
  report.passed=report.errors.length===0;
}catch(error){report.failure=String(error);process.exitCode=1;if(page)await page.screenshot({path:path.join(output,'failure.png'),fullPage:true}).catch(()=>{});}
finally{await browser?.close();await server?.close();await fs.writeFile(path.join(output,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
