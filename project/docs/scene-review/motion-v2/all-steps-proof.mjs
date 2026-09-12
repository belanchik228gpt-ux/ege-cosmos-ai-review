import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const {scenes}=await import(pathToFileURL(path.resolve('src/scenes/registry.ts')).href);
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const page=await browser.newPage({viewport:{width:1280,height:720}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:5173');await page.getByPlaceholder('Твоё имя').fill('Саша');await page.getByRole('button',{name:'Начнём знакомство',exact:true}).click();
const topicTitles={rectangle:'Площадь прямоугольника',triangle:'Площадь треугольника',median:'Медиана треугольника',fraction:'Как устроена дробь',multiply:'Умножение дробей',percent:'Проценты без путаницы',syntax:'Основа предложения',commas:'Запятая между частями','ne-ni':'НЕ и НИ: смысл частицы',baptism:'Крещение Руси',reform:'Отмена крепостного права',demand:'Спрос и предложение',groups:'Социальные группы'};
const subjectTitles={math:'Математика',russian:'Русский язык',history:'История',social:'Обществознание'};const results=[];
try{
for(const scene of Object.values(scenes)){
 await page.getByRole('navigation',{name:'Предметы',exact:true}).getByRole('button',{name:subjectTitles[scene.subject],exact:true}).click();
 await page.locator('.topic-card').filter({has:page.getByRole('heading',{name:topicTitles[scene.id],exact:true})}).click();
 await page.getByRole('button',{name:'Пауза',exact:true}).click();await page.getByRole('combobox',{name:'Скорость воспроизведения',exact:true}).selectOption('2');await page.getByRole('button',{name:'Воспроизвести',exact:true}).click();
 const stepResults=[];const key=Math.max(1,scene.steps.findIndex(s=>s.formula));
 for(let i=0;i<scene.steps.length;i++){
  const wanted=String(i+1).padStart(2,'0');await page.waitForFunction(w=>document.querySelector('.sc-counter')?.textContent?.startsWith(w),wanted,{timeout:7000});
  const progress=parseFloat(await page.locator('.sc-tick.sc-current span').evaluate(e=>e.style.width))/100*scene.steps[i].durationMs;
  const early=await page.locator('.sc-formula').innerText();
  assert(!scene.steps[i].formula || progress>=1400 || early!==scene.steps[i].formula,`${scene.id} formula too early at ${i}`);
  if(i===0)await page.locator('.scene-player').screenshot({path:`docs/scene-review/motion-v2/${scene.id}-start.png`});
  await page.waitForTimeout(800);
  const formula=await page.locator('.sc-formula').innerText();
  assert(!scene.steps[i].formula || formula===scene.steps[i].formula,`${scene.id} formula missing at ${i}: ${formula}`);
  assert(await page.locator('.sc-explanation h3').innerText()===scene.steps[i].title,`${scene.id} narration mismatch at ${i}`);
  if(i===key||i===scene.steps.length-1)await page.locator('.scene-player').screenshot({path:`docs/scene-review/motion-v2/${scene.id}-${i===key?'key':'end'}.png`});
  stepResults.push({step:i+1,title:scene.steps[i].title,earlyElapsedMs:Math.round(progress),earlyFormulaWithheld:!scene.steps[i].formula||progress>=1400||early!==scene.steps[i].formula,settledFormula:formula});
 }
 await page.waitForFunction(()=>document.querySelector('.sc-next')?.disabled,{},{timeout:6500});
 const completed=await page.locator('.sc-next').isDisabled();assert(completed);await page.getByRole('button',{name:'Повторить сцену',exact:true}).click();assert((await page.locator('.sc-counter').innerText()).startsWith('01'));await page.getByRole('button',{name:'Пауза',exact:true}).click();
 results.push({id:scene.id,steps:stepResults,completed,replay:true,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)});console.log(`VERIFIED ${scene.id}: ${stepResults.length} animated steps`);
 await writeFile('docs/scene-review/motion-v2/all-steps-results.json',JSON.stringify({at:new Date().toISOString(),kind:'Real browser playback of local scenes at 2x, NOT packaged exe',errors,results},null,2));
}
}finally{await browser.close();}
console.log(JSON.stringify({scenes:results.length,steps:results.reduce((n,s)=>n+s.steps.length,0),errors}));
