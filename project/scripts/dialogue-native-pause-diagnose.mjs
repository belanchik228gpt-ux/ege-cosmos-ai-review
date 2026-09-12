import { _electron as electron } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { compareScenePixels, readSceneVisualState } from './scene-pixel-metrics.mjs';

const source = JSON.parse(await fs.readFile('docs/verification/studio-live-native-0.5/report.json', 'utf8'));
const out = path.resolve('docs/verification/dialogue-native-pause-0.5');
await fs.mkdir(out, {recursive:true});
const result = { kind:'actual-saved-model-scene-read-only-replay', profile:source.profile, asarSha256:createHash('sha256').update(await fs.readFile(path.join(path.dirname(source.exe),'resources/app.asar'))).digest('hex'), cases:[], errors:[], limits:['No model requests; no learning state injection. Existing isolated QA profile reopened.'] };
let app;
try {
  app = await electron.launch({executablePath:source.exe, env:{...process.env,COSMOS_USER_DATA:source.profile,COSMOS_DOCUMENTS_DIR:path.join(source.profile,'documents'),COSMOS_OPENAI_USER_DATA:path.join(process.env.APPDATA,'EGE Cosmos Studio')}, timeout:45000});
  const page = await app.firstWindow();
  page.setDefaultTimeout(25000);
  page.on('pageerror', e=>result.errors.push(e.message));
  await page.locator('.cosmos-studio').waitFor();
  await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.setContentSize(1600,1000);w.show();w.focus();});
  await page.locator('.studio-sidebar').getByRole('button',{name:'Математика',exact:true}).click();
  const scene=page.locator('.dialogue-scene').last();
  await scene.waitFor();
  await scene.scrollIntoViewIfNeeded();
  for (const mode of ['default','second-replay']) {
    await scene.getByRole('button',{name:'Повторить рисунок',exact:true}).click();
    await page.waitForTimeout(500);
    await scene.getByRole('button',{name:'Пауза',exact:true}).click();
    await page.mouse.move(5,5);
    await page.waitForTimeout(350);
    const firstState=await scene.evaluate(readSceneVisualState);
    const metadata=()=>scene.evaluate(el=>({rect:el.getBoundingClientRect().toJSON(),scrolls:[...document.querySelectorAll('*')].filter(x=>x.scrollTop||x.scrollLeft).map(x=>({tag:x.tagName,class:x.className,top:x.scrollTop,left:x.scrollLeft})),playing:el.dataset.playing,allAnimations:document.getAnimations().map(a=>({target:a.effect?.target?.className,name:a.animationName,property:a.transitionProperty,currentTime:a.currentTime,playState:a.playState})),background:getComputedStyle(el).background,ancestors:(()=>{const r=[];for(let p=el;p;p=p.parentElement)r.push({tag:p.tagName,cls:p.className,opacity:getComputedStyle(p).opacity,transform:getComputedStyle(p).transform,filter:getComputedStyle(p).filter,backdrop:getComputedStyle(p).backdropFilter});return r;})()}));
    const firstMeta=await metadata();
    const captures={};
    for (const [name,locator] of [['scene',scene],['body',scene.locator('.dialogue-scene-body')],['svg',scene.locator('.dialogue-scene-body svg').first()]]) captures[name]=await locator.screenshot({path:path.join(out,`${mode}-${name}-a.png`)});
    await page.waitForTimeout(700);
    const secondState=await scene.evaluate(readSceneVisualState),secondMeta=await metadata(),pixels={};
    for (const [name,locator] of [['scene',scene],['body',scene.locator('.dialogue-scene-body')],['svg',scene.locator('.dialogue-scene-body svg').first()]]) pixels[name]=compareScenePixels(captures[name],await locator.screenshot({path:path.join(out,`${mode}-${name}-b.png`)}));
    result.cases.push({mode,pixels,geometryEqual:JSON.stringify(firstState.geometry)===JSON.stringify(secondState.geometry),animationsEqual:JSON.stringify(firstState.animations)===JSON.stringify(secondState.animations),firstMeta,secondMeta,firstState,secondState});
    console.log(JSON.stringify({mode,pixels,geometryEqual:result.cases.at(-1).geometryEqual,animationsEqual:result.cases.at(-1).animationsEqual}));
  }
  await page.screenshot({path:path.join(out,'viewport.png')});
} catch(e) {result.error=String(e.stack||e);process.exitCode=1;}
finally {await app?.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(result,null,2));}
