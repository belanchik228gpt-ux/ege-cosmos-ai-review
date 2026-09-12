import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const page=await browser.newPage({viewport:{width:1280,height:720}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:5173');await page.getByPlaceholder('Твоё имя').fill('Саша');await page.getByRole('button',{name:'Начнём знакомство',exact:true}).click();
const palettes=[['cosmos','Тихая орбита'],['aurora','Северное сияние'],['ocean','Далёкий океан'],['amber','Золотая пыль'],['rose','Розовая туманность']];const results=[];
for(const [id,title] of palettes){
 await page.getByRole('button',{name:'Настройки',exact:true}).click();await page.locator('.palette-choice').filter({hasText:title}).click();await page.getByRole('combobox',{name:'Размер текста',exact:true}).selectOption('large');
 await page.getByRole('navigation',{name:'Предметы',exact:true}).getByRole('button',{name:'Математика',exact:true}).click();await page.locator('.topic-card').filter({has:page.getByRole('heading',{name:'Медиана треугольника',exact:true})}).click();await page.locator('.sc-tick').nth(11).click();
 for(const [width,height] of [[1280,720],[390,844]]){
  await page.setViewportSize({width,height});await page.locator('.scene-player').screenshot({path:`docs/scene-review/motion-v2/palette-${id}-${width}.png`});
  const metrics=await page.locator('.scene-player').evaluate(e=>({width:e.getBoundingClientRect().width,font:getComputedStyle(e.querySelector('.sc-explanation p')).fontSize,button:getComputedStyle(e.querySelector('.sc-play')).backgroundColor,overflow:document.documentElement.scrollWidth>innerWidth,svg:e.querySelector('svg.sc-visual').getAttribute('viewBox')}));if(metrics.overflow)console.log(JSON.stringify(await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).map(e=>({tag:e.tagName,class:e.className,right:e.getBoundingClientRect().right})).slice(0,12))));assert(metrics.svg==='0 0 720 410');results.push({palette:id,width,...metrics});
 }
 await page.setViewportSize({width:1280,height:720});
}
await page.getByRole('button',{name:'Сосредоточиться',exact:true}).click();await page.locator('.scene-player').screenshot({path:'docs/scene-review/motion-v2/focus-median.png'});assert(await page.locator('.app-shell.focus-mode').count()===1);
await page.locator('.sc-outline summary').click();await page.locator('.scene-player').screenshot({path:'docs/scene-review/motion-v2/outline-focus.png'});
await writeFile('docs/scene-review/motion-v2/layout-results.json',JSON.stringify({at:new Date().toISOString(),errors,results,focus:true,outline:true},null,2));console.log(JSON.stringify({errors,results}));await browser.close();
