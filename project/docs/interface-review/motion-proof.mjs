import {chromium, _electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import os from 'node:os';
const exe=process.env.COSMOS_EXE;
const dir=exe?'docs/interface-review/native':'docs/interface-review/source-recheck';await mkdir(dir,{recursive:true});
let browser,app,page;
if(exe){
 app=await electron.launch({executablePath:path.resolve(exe),args:['--disable-backgrounding-occluded-windows'],env:{...process.env,COSMOS_USER_DATA:path.resolve('test-results/interface-motion-'+Date.now())},timeout:45000});
 page=await app.firstWindow();
 await app.evaluate(({BrowserWindow})=>{const window=BrowserWindow.getAllWindows()[0];window.setContentSize(1440,1000);window.show();window.focus();});
 await page.bringToFront();
}else{
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 page=await browser.newPage({viewport:{width:1440,height:1000}});
}
const errors=[],results={at:new Date().toISOString(),kind:exe?'Packaged Windows EXE; real renderer screenshots':'Source app in Chrome; not Windows EXE',errors};page.on('pageerror',e=>errors.push(e.message));
if(exe){results.executable=path.resolve(exe);results.appAsarSha256=createHash('sha256').update(await readFile(path.join(path.dirname(path.resolve(exe)),'resources/app.asar'))).digest('hex');results.gpuFeatureStatus=await app.evaluate(({app})=>app.getGPUFeatureStatus());}
results.environment={cpu:os.cpus()[0]?.model,logicalCpus:os.cpus().length,memoryGiB:Math.round(os.totalmem()/1024**3),platform:os.platform(),osRelease:os.release(),viewport:await page.evaluate(()=>({width:innerWidth,height:innerHeight,devicePixelRatio}))};
results.performanceNotes=['Short renderer-main-thread samples while an authored scene runs; not a guarantee of sustained FPS.','requestAnimationFrame gaps are callback intervals, not a measurement of GPU presentation or display frames.','Long-task entries cover the renderer main thread only; model generation is not running.','QA windows use --disable-backgrounding-occluded-windows to avoid unrelated test-window occlusion. Production settings are unchanged.'];
const home=()=>page.getByRole('navigation',{name:'Основная навигация'}).getByRole('button',{name:'Мой космос',exact:true}).click();
const settings=async()=>{await page.getByRole('button',{name:'Настройки',exact:true}).click();await page.getByRole('button',{name:'Неон и движение',exact:true}).click();};
const transform=locator=>locator.evaluate(e=>{const s=getComputedStyle(e),m=s.transform==='none'?new DOMMatrix():new DOMMatrix(s.transform);return {y:m.f,scale:m.a,shadow:s.boxShadow,outline:s.outlineStyle,transition:s.transitionDuration};});
const sampleFrames=async quality=>{
 await page.getByRole('combobox',{name:'Скорость воспроизведения',exact:true}).selectOption('1');
 await page.getByRole('button',{name:'Повторить сцену',exact:true}).click();
 if(await page.getByRole('button',{name:'Воспроизвести',exact:true}).count())await page.getByRole('button',{name:'Воспроизвести',exact:true}).click();
 await page.bringToFront();await page.waitForTimeout(500);
 const sample=await page.evaluate(async()=>{
  const durationMs=8000,gaps=[],longTasks=[],steps=new Set(),visibility=[];let previous;
  const start=performance.now();
  const supportsLongTasks=PerformanceObserver.supportedEntryTypes.includes('longtask');
  const observer=supportsLongTasks?new PerformanceObserver(list=>{for(const e of list.getEntries())longTasks.push({startMs:e.startTime-start,durationMs:e.duration});}):null;
  observer?.observe({type:'longtask'});
  const markVisibility=()=>visibility.push({atMs:performance.now()-start,hidden:document.hidden});
  markVisibility();document.addEventListener('visibilitychange',markVisibility);
  await new Promise(resolve=>{let done=false;const stop=()=>{if(done)return;done=true;clearTimeout(deadline);resolve();};const deadline=setTimeout(stop,durationMs+5000);const frame=now=>{if(done)return;if(previous!==undefined)gaps.push(now-previous);previous=now;steps.add(document.querySelector('.sc-counter')?.textContent?.trim());if(now-start<durationMs)requestAnimationFrame(frame);else stop();};requestAnimationFrame(frame);});
  for(const e of observer?.takeRecords()??[])longTasks.push({startMs:e.startTime-start,durationMs:e.duration});observer?.disconnect();document.removeEventListener('visibilitychange',markVisibility);
  const elapsedMs=performance.now()-start,sorted=[...gaps].sort((a,b)=>a-b),percentile=p=>sorted[Math.min(sorted.length-1,Math.floor(sorted.length*p))]??null;
  return{elapsedMs,callbacks:gaps.length+1,averageCallbackHz:gaps.length*1000/gaps.reduce((a,b)=>a+b,0),medianGapMs:percentile(.5),p95GapMs:percentile(.95),p99GapMs:percentile(.99),maxGapMs:Math.max(...gaps),gapsOver33ms:gaps.filter(g=>g>33.34).length,gapsOver50ms:gaps.filter(g=>g>50).length,supportsLongTasks,longTasks,steps:[...steps],visibility,gapsMs:gaps};
 });
 if(await page.getByRole('button',{name:'Пауза',exact:true}).count())await page.getByRole('button',{name:'Пауза',exact:true}).click();
 assert(sample.steps.length>=2,'Scene must actually advance during performance sample');assert(sample.visibility.every(v=>!v.hidden),'Hidden renderer invalidates performance sample');
 await page.locator('.scene-player').screenshot({path:`${dir}/scene-${quality}-after-sample.png`});
 return{quality,...sample};
};
try{
 if(!exe)await page.goto('http://127.0.0.1:5173');await page.getByPlaceholder('Твоё имя').fill('Алексей');await page.getByRole('button',{name:'Начнём знакомство',exact:true}).click();await page.waitForTimeout(750);
 assert.equal(await page.locator('html').getAttribute('data-ui-motion'),'expressive');assert(await page.locator('.ui-ambient').count()===1);await page.screenshot({path:`${dir}/01-home-neon.png`,fullPage:true});
 const button=page.getByRole('button',{name:'Продолжить занятие',exact:true});await page.mouse.move(2,2);const idle=await transform(button);await button.hover();await page.waitForTimeout(350);const hover=await transform(button);assert(hover.y<idle.y-1);assert.notEqual(hover.shadow,idle.shadow);await page.locator('.hero-card').screenshot({path:`${dir}/02-hover.png`});
 await page.mouse.down();await page.waitForTimeout(140);const press=await transform(button);assert(press.scale<0.99,JSON.stringify(press));await page.locator('.hero-card').screenshot({path:`${dir}/03-press.png`});await page.mouse.move(2,2);await page.mouse.up();
 await button.focus();await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');await page.locator('.hero-card').screenshot({path:`${dir}/04-keyboard-focus.png`});const focused=await transform(button);assert.equal(focused.outline,'solid');results.button={idle,hover,press,focused};
 await page.getByRole('navigation',{name:'Предметы',exact:true}).getByRole('button',{name:'Математика',exact:true}).click();const entering=await page.locator('.main-content').evaluate(e=>e.getAnimations().map(a=>({state:a.playState,duration:a.effect.getTiming().duration})));assert(entering.length>0);await page.screenshot({path:`${dir}/05-navigation-enter.png`});results.navigation=entering;
 await page.keyboard.press('Control+k');await page.locator('.command-dialog').waitFor();await page.screenshot({path:`${dir}/06-command-dialog.png`});await page.keyboard.press('Escape');
 await settings();await page.getByRole('combobox',{name:'Движение интерфейса',exact:true}).selectOption('off');await home();await page.waitForTimeout(400);assert(await page.locator('.ui-ambient').count()===0);await button.hover();await page.waitForTimeout(100);const off=await transform(button);assert.equal(off.y,0);await page.mouse.down();const offPress=await transform(button);assert.equal(offPress.y,0);assert.equal(offPress.scale,1);await page.mouse.move(2,2);await page.mouse.up();results.off={hover:off,press:offPress};
 await settings();await page.getByRole('combobox',{name:'Движение интерфейса',exact:true}).selectOption('expressive');await page.getByRole('checkbox',{name:'Отклик при наведении',exact:true}).uncheck();await home();await page.waitForTimeout(650);await button.hover();await page.waitForTimeout(300);assert.equal((await transform(button)).y,0);results.hoverDisabled=true;
 await settings();await page.getByRole('checkbox',{name:'Отклик при наведении',exact:true}).check();await page.getByRole('checkbox',{name:'Автоматически запускать сцены',exact:true}).uncheck();await page.getByRole('combobox',{name:'Начальная скорость сцены',exact:true}).selectOption('2');await home();await button.click();await page.waitForTimeout(750);assert.equal(await page.getByRole('combobox',{name:'Скорость воспроизведения',exact:true}).inputValue(),'2');assert.equal(await page.getByRole('button',{name:'Пауза',exact:true}).count(),0);assert((await page.locator('.sc-counter').innerText()).startsWith('01'));await page.getByRole('button',{name:'Воспроизвести',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.sc-counter')?.textContent?.startsWith('02'),{},{timeout:4500});await page.getByRole('button',{name:'Пауза',exact:true}).click();results.sceneStartup={autoplayOff:true,initialSpeed:2,manualPlay:true};await page.locator('.scene-player').screenshot({path:`${dir}/07-scene-manual-start.png`});
 await settings();await page.getByRole('checkbox',{name:'Уменьшить движение',exact:true}).check();await home();await page.waitForTimeout(350);await button.hover();const reduced=await transform(button);assert.equal(reduced.y,0);assert.equal(await page.locator('.ui-ambient').count(),0);const animations=await page.locator('.main-content').evaluate(e=>e.getAnimations({subtree:true}).filter(a=>a.playState==='running').length);assert.equal(animations,0);await page.screenshot({path:`${dir}/08-reduced-motion.png`,fullPage:true});results.appReduced={animations,hover:reduced};
 await settings();await page.getByRole('checkbox',{name:'Уменьшить движение',exact:true}).uncheck();await page.emulateMedia({reducedMotion:'reduce'});await home();await page.waitForTimeout(300);assert.equal(await page.locator('.ui-ambient').count(),0);assert.equal(await page.locator('.main-content').evaluate(e=>e.getAnimations({subtree:true}).filter(a=>a.playState==='running').length),0);results.osReduced=true;await page.emulateMedia({reducedMotion:'no-preference'});
 await settings();await page.getByRole('button',{name:'Изображение и звук',exact:true}).click();await page.locator('.quality-options button').filter({hasText:'Низкое'}).click();await home();await page.waitForTimeout(700);assert.equal(await page.locator('.ui-ambient').count(),0);const low=await page.locator('.main-content').evaluate(e=>e.getAnimations({subtree:true}).filter(a=>a.playState==='running').length);assert.equal(low,0);results.low={continuousAnimations:low};
 await settings();await page.getByRole('button',{name:'Изображение и звук',exact:true}).click();await page.locator('.quality-options button').filter({hasText:'Высокое'}).click();await home();await button.click();results.frameSamples=[await sampleFrames('high')];
 await settings();await page.getByRole('button',{name:'Изображение и звук',exact:true}).click();await page.locator('.quality-options button').filter({hasText:'Низкое'}).click();await home();await button.click();results.frameSamples.push(await sampleFrames('low'));
 assert.deepEqual(errors,[]);results.passed=true;console.log(JSON.stringify({...results,frameSamples:results.frameSamples.map(({gapsMs,...sample})=>sample)}));
}catch(error){results.failure=String(error?.stack??error);throw error;}finally{await writeFile(`${dir}/motion-results.json`,JSON.stringify(results,null,2));if(app)await app.close();if(browser)await browser.close();}
