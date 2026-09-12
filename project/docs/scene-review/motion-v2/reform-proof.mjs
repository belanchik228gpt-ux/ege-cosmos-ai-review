import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const page=await browser.newPage({viewport:{width:1280,height:720}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
try {
 await page.goto('http://127.0.0.1:5173');await page.getByPlaceholder('Твоё имя').fill('Саша');await page.getByRole('button',{name:'Начнём знакомство',exact:true}).click();
 await page.getByRole('navigation',{name:'Предметы',exact:true}).getByRole('button',{name:'История',exact:true}).click();
 await page.locator('.topic-card').filter({has:page.getByRole('heading',{name:'Отмена крепостного права',exact:true})}).click();
 await page.locator('.sc-tick').nth(2).click();await page.getByRole('combobox',{name:'Скорость воспроизведения',exact:true}).selectOption('2');await page.getByRole('button',{name:'Воспроизвести',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.sc-counter')?.textContent?.startsWith('04'),{},{timeout:6000});
 await page.waitForTimeout(800);await page.getByRole('button',{name:'Пауза',exact:true}).click();
 assert.equal(await page.locator('.sc-explanation h3').innerText(),'Документы реформы');
 const rects=await page.locator('.sc-visual').evaluate(svg=>{const texts=[...svg.querySelectorAll('text')];const cause=texts.find(t=>t.textContent.includes('Назрела необходимость'));const doc=texts.find(t=>t.textContent.includes('МАНИФЕСТ'));return {cause:cause.getBoundingClientRect().toJSON(),doc:doc.getBoundingClientRect().toJSON()};});assert(rects.cause.bottom<rects.doc.top);
 await page.locator('.scene-player').screenshot({path:'docs/scene-review/motion-v2/reform-key.png'});
 await page.setViewportSize({width:390,height:844});await page.locator('.scene-player').screenshot({path:'docs/scene-review/motion-v2/reform-key-390.png'});
 await writeFile('docs/scene-review/motion-v2/reform-results.json',JSON.stringify({at:new Date().toISOString(),errors,rects,kind:'Full app browser, animated step 3 to 4 at 2x; not packaged exe'},null,2));console.log(JSON.stringify({errors,rects}));
}finally{await browser.close();}
