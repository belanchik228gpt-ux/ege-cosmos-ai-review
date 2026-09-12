import {chromium} from 'playwright';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:5173');
await page.getByPlaceholder('Твоё имя').fill('Саша');
await page.getByRole('button',{name:'Начнём знакомство',exact:true}).click();
const topics=[['math','Математика','Площадь прямоугольника','rectangle'],['math','Математика','Площадь треугольника','triangle'],['math','Математика','Медиана треугольника','median'],['math','Математика','Как устроена дробь','fraction'],['math','Математика','Умножение дробей','multiply'],['math','Математика','Проценты без путаницы','percent'],['russian','Русский язык','Основа предложения','syntax'],['russian','Русский язык','Запятая между частями','commas'],['russian','Русский язык','НЕ и НИ: смысл частицы','ne-ni'],['history','История','Крещение Руси','baptism'],['history','История','Отмена крепостного права','reform'],['social','Обществознание','Спрос и предложение','demand'],['social','Обществознание','Социальные группы','groups']];
const results=[];
for(const [,subject,title,id] of topics){
 await page.getByRole('navigation',{name:'Предметы',exact:true}).getByRole('button',{name:subject,exact:true}).click();
 await page.locator('.topic-card').filter({has:page.getByRole('heading',{name:title,exact:true})}).click();
 await page.getByRole('button',{name:'Пауза',exact:true}).click();
 await page.locator('.sc-tick').last().click();
 await page.waitForTimeout(1900);
 await page.locator('.scene-player').screenshot({path:`docs/scene-review/${id}-desktop-final.png`});
 results.push({id,step:await page.locator('.sc-counter').innerText(),formula:await page.locator('.sc-formula').innerText(),svg:await page.locator('.sc-visual').boundingBox(),overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)});
 if(['triangle','median','baptism','syntax','demand'].includes(id)){
  await page.setViewportSize({width:390,height:844});
  await page.locator('.scene-player').screenshot({path:`docs/scene-review/${id}-mobile-final.png`});
  results.push({id,viewport:'390x844',overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)});
  await page.setViewportSize({width:1280,height:720});
 }
}
await writeFile('docs/scene-review/browser-results.json',JSON.stringify({kind:'Browser preview, NOT packaged Electron acceptance',viewport:'1280x720',errors,results},null,2));
console.log(JSON.stringify({errors,count:results.length,results}));
await browser.close();
