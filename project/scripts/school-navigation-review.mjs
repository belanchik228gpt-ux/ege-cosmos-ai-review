import { _electron as electron } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const exe = path.resolve(process.env.COSMOS_EXE || 'release/win-unpacked/EGE Cosmos.exe');
const profile = path.resolve(`test-results/school-navigation-${Date.now()}`);
const out = path.resolve('docs/verification/school-navigation-0.7.0');
await fs.mkdir(out, { recursive: true });
const report = { status: 'running', at: new Date().toISOString(), exe, profile, checks: [], screenshots: [], errors: [], limitations: ['Real packaged EXE; isolated profile; actions performed through UI. No model calls or injected learning results. New local scenes are authored material.'] };
report.asarSha256 = createHash('sha256').update(await fs.readFile(path.join(path.dirname(exe), 'resources/app.asar'))).digest('hex');
let app, page;
const nav = name => page.locator('.studio-sidebar').getByRole('button', {name, exact:true});
const button = name => page.getByRole('button', {name, exact:true});
async function poll(fn, ms = 30000) { const until=Date.now()+ms; while(Date.now()<until) { if(await fn()) return; await new Promise(r=>setTimeout(r,150)); } throw Error('Poll timed out'); }
async function shot(name) { const file=path.join(out,`${name}.png`);await page.screenshot({path:file});report.screenshots.push(file); }
async function state() { return await page.evaluate(()=>window.cosmos.loadState()); }
async function launch() {
  app=await electron.launch({executablePath:exe,env:{...process.env,COSMOS_USER_DATA:profile,COSMOS_DOCUMENTS_DIR:path.join(profile,'documents')},timeout:45000});
  await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.setIgnoreMouseEvents(true);w.setContentSize(1600,1000);});
  page=await app.firstWindow();page.setDefaultTimeout(20000);page.on('pageerror',e=>report.errors.push(e.message));await page.locator('.cosmos-studio').waitFor();
}
async function subjects(grade) {
  await nav('Все школьные предметы').click();
  await page.getByLabel('Школьный класс',{exact:true}).selectOption(String(grade));
  if(await button('Все предметы').isVisible()) await button('Все предметы').click();
  await page.getByLabel('Поиск школьных тем',{exact:true}).fill('');
}
try {
  await launch();await page.locator('.welcome-modal input').fill('Проверка навигации');await button('Начнём знакомство').click();await nav('Школа').click();
  for(const grade of [7,8,9,10,11]) {
    await subjects(grade);const names=await page.locator('.school-subject-card h2').allTextContents();
    assert(!names.some(n=>/музык|физическая культур|ОБЗР/i.test(n)));if(grade===7) { assert(names.includes('Физика'));assert(!names.includes('Химия'));await shot('subjects-7'); }
    report.checks.push({grade,subjects:names});
  }
  await subjects(7);await nav('Мой школьный план').click();
  await page.getByLabel('Дата школьного плана').fill('2026-10-05');
  const minute=page.getByLabel('Минут в школьном дне');await minute.fill('');await minute.pressSequentially('120');await minute.press('Tab');
  assert.equal(await minute.inputValue(),'120');
  await page.getByLabel('Тема для школьного плана').fill('выражения');
  await page.locator('.school-plan-search button').first().click();
  const card=page.locator('.school-plan-items article').first();
  const duration=card.locator('input[type=number]');await duration.fill('');await duration.pressSequentially('45');await duration.press('Tab');
  const note=card.locator('input').last();await note.pressSequentially('Мой учебник: упражнение 17, объяснить подстановку');await note.press('Tab');
  const originalTabs=await page.locator('.school-day-tabs strong').allTextContents();
  await page.locator('.school-day-tabs button').nth(1).click();assert.deepEqual(await page.locator('.school-day-tabs strong').allTextContents(),originalTabs);
  await page.locator('.school-day-tabs button').first().click();assert.equal(await duration.inputValue(),'45');assert.match(await note.inputValue(),/упражнение 17/);
  await button('Следующая неделя →').click();await button('← Предыдущая неделя').click();assert.deepEqual(await page.locator('.school-day-tabs strong').allTextContents(),originalTabs);
  await shot('editable-school-plan');
  await poll(async()=>{const s=await state();return s.school.days['2026-10-05']?.[0]?.note.includes('упражнение 17')&&s.school.days['2026-10-05'][0].minutes===45;});
  report.checks.push('Plan accepts clear/type/blur for 120 and 45 minutes; own note persisted; seven-day strip stable; previous/next week work.');
  await subjects(7);await page.locator('.school-subject-card').filter({has:page.getByRole('heading',{name:'Математика',exact:true})}).click();await page.locator('.school-topic-title').first().click();
  const subtopic=page.locator('.school-subtopics button').first();const focus=await subtopic.locator('.school-subtopic-copy').innerText();await subtopic.click();await page.locator('.school-room').waitFor();
  await button('Завершить без подключения').click();await poll(async()=>Object.values((await state()).school.lessons).some(l=>l.completedAt));
  await subjects(7);await page.locator('.school-subject-card').filter({has:page.getByRole('heading',{name:'Математика',exact:true})}).click();await page.locator('.school-topic-title').first().click();
  assert.match(await page.locator('.school-subtopics button').first().innerText(),/100%/);assert.match(await page.locator('.school-subtopics button').nth(1).innerText(),/0%/);await shot('subtopic-progress');
  await subjects(10);await page.getByLabel('Поиск прошлых диалогов').fill('дроби');await page.locator('.conversation-history-list button').first().click();await page.getByLabel('Поиск прошлых диалогов').fill('');await page.locator('.school-room').waitFor();assert.match(await page.locator('.school-room').innerText(),/7 класс/);
  await shot('history-restores-grade-and-topic');report.checks.push({subtopic:focus,progress:'100% after explicit completion; neighbouring subtopic remains 0%; history returns from grade 10 to grade 7.'});
  for(const [grade,name,query] of [[10,'Биология','клетка'],[8,'Химия','строени атом']]) {
    await subjects(grade);await page.locator('.school-subject-card').filter({has:page.getByRole('heading',{name,exact:true})}).click();await page.getByLabel('Поиск школьных тем',{exact:true}).fill(query);await page.locator('.school-topic-title').first().click();if(name==='Химия') await page.locator('.school-subtopics button').first().click(); else await button('Изучать раздел').click();
    await page.locator('#school-local-material summary').click();const scene=page.locator('#school-local-material .dialogue-scene');await scene.scrollIntoViewIfNeeded();
    await scene.getByRole('button',{name:'Повторить рисунок',exact:true}).click();
    if(await scene.getByRole('button',{name:'Пауза',exact:true}).isEnabled()) await scene.getByRole('button',{name:'Пауза',exact:true}).click();
    await scene.getByRole('button',{name:'Следующий кадр',exact:true}).click();const caption=await scene.locator('.ds-caption').innerText();await scene.getByRole('button',{name:'Предыдущий кадр',exact:true}).click();assert.notEqual(await scene.locator('.ds-caption').innerText(),caption);
    await scene.locator('.ds-dots button').last().click();if(name==='Химия') await scene.getByRole('img',{name:'Нейтральный атом водорода: один протон и один электрон',exact:true}).waitFor();await shot(`local-scene-${name==='Биология'?'biology':'chemistry'}`);
    report.checks.push({scene:name,caption,controls:'replay/pause/next/back/frame'});
  }
  await poll(async()=>Object.keys((await state()).school.lessons).length===3);await app.close();app=null;await launch();
  await page.locator('.conversation-history-list button').first().waitFor();assert.equal(await page.locator('.conversation-history-list button').count(),3);
  const restored=await state();assert.equal(restored.school.days['2026-10-05'][0].minutes,45);assert.match(restored.school.days['2026-10-05'][0].note,/упражнение 17/);report.checks.push('Actual EXE restart preserves three dialogues, exact plan note and 45-minute duration.');
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1280,720));await nav('Мой школьный план').click();await page.getByLabel('Школьный класс',{exact:true}).selectOption('7');await page.getByLabel('Дата школьного плана').fill('2026-10-05');await page.locator('.school-plan-items article').first().scrollIntoViewIfNeeded();assert.equal(await page.locator('.school-plan-items article input[type=number]').first().inputValue(),'45');await shot('plan-1280x720');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(report.errors,[]);report.status='pass';
} catch(e) { report.status='failed';report.failure=String(e.stack||e);if(page) await shot('failure').catch(()=>{});process.exitCode=1; }
finally { if(app) await app.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2)); }
