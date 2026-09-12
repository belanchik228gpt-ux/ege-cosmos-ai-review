import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';import path from 'node:path';
const {scenes}=await import(pathToFileURL(path.resolve('src/scenes/registry.ts')).href);
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1280,height:720}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:5173');await page.getByPlaceholder('Твоё имя').fill('Саша');await page.getByRole('button',{name:'Начнём знакомство',exact:true}).click();
const titles={rectangle:'Площадь прямоугольника',triangle:'Площадь треугольника',median:'Медиана треугольника',fraction:'Как устроена дробь',multiply:'Умножение дробей',percent:'Проценты без путаницы',syntax:'Основа предложения',commas:'Запятая между частями','ne-ni':'НЕ и НИ: смысл частицы',baptism:'Крещение Руси',reform:'Отмена крепостного права',demand:'Спрос и предложение',groups:'Социальные группы'};const subjects={math:'Математика',russian:'Русский язык',history:'История',social:'Обществознание'};const results=[];
for(const mode of ['static','reduced','low']){
 await page.getByRole('button',{name:'Настройки',exact:true}).click();await page.getByRole('button',{name:mode==='static'?'Статичное Шаги переключаются вручную':mode==='low'?'Низкое Без тяжёлых эффектов':'Высокое Свечение и плавные переходы',exact:true}).click();
 await page.locator('.setting-toggle').filter({hasText:'Уменьшить движение'}).getByRole('checkbox').setChecked(mode==='reduced');
 for(const scene of Object.values(scenes)){
  await page.getByRole('navigation',{name:'Предметы',exact:true}).getByRole('button',{name:subjects[scene.subject],exact:true}).click();await page.locator('.topic-card').filter({has:page.getByRole('heading',{name:titles[scene.id],exact:true})}).click();
  assert((await page.locator('.sc-counter').innerText()).startsWith(String(mode==='static'?scene.steps.length:1).padStart(2,'0')));
  if(mode==='low')await page.getByRole('button',{name:'Пауза',exact:true}).click();else assert(await page.getByRole('button',{name:'Пауза',exact:true}).count()===0);
  await page.locator('.sc-tick').last().click();assert(await page.locator('.sc-formula').innerText()===scene.steps.at(-1).formula);
  const animations=await page.locator('.sc-body').evaluate(e=>e.getAnimations({subtree:true}).length);assert(animations===0,'MANUAL STEPS MUST BE SETTLED');
  if(['rectangle','syntax','baptism','demand'].includes(scene.id))await page.locator('.scene-player').screenshot({path:`docs/scene-review/motion-v2/${mode}-${scene.id}.png`});
  await page.getByRole('button',{name:'Предыдущий шаг',exact:true}).click();assert((await page.locator('.sc-counter').innerText()).startsWith(String(scene.steps.length-1).padStart(2,'0')));
  await page.getByRole('button',{name:'Повторить сцену',exact:true}).click();assert((await page.locator('.sc-counter').innerText()).startsWith('01'));
  if(mode==='low')await page.getByRole('button',{name:'Пауза',exact:true}).click();
  results.push({mode,scene:scene.id,finalFrame:true,manualBack:true,replay:true,animationsOnManualStep:animations});
 }
 console.log(`VERIFIED ${mode}: 13 scenes`);
}
const cdp=await browser.newBrowserCDPSession();const gpu=await cdp.send('SystemInfo.getInfo');await writeFile('docs/scene-review/motion-v2/quality-results.json',JSON.stringify({at:new Date().toISOString(),browser:browser.version(),flag:'--disable-gpu',gpuFeatureStatus:gpu.gpu.featureStatus,errors,results},null,2));console.log(JSON.stringify({cases:results.length,errors,gpuFeatureStatus:gpu.gpu.featureStatus}));await browser.close();
