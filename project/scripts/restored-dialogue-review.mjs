import { _electron as electron } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const source = JSON.parse(await fs.readFile('docs/verification/spatial-live-0.7.5/report.json', 'utf8'));
const exe = path.resolve(process.env.COSMOS_EXE || 'test-results/installed-app/EGE Cosmos.exe');
const out = path.resolve('docs/verification/restored-dialogue-installed-0.7.5');
await fs.mkdir(out, { recursive: true });
const report = { status: 'running', exe, profile: source.profile, realResponsesRestored: 3, errors: [], screenshots: [], asarSha256: createHash('sha256').update(await fs.readFile(path.join(path.dirname(exe), 'resources/app.asar'))).digest('hex') };
let app, page;
const button = name => page.getByRole('button', { name, exact: true });
async function shot(name) { const file = path.join(out, name + '.png'); await page.screenshot({ path: file }); report.screenshots.push(file); }
try {
  app = await electron.launch({ executablePath: exe, env: { ...process.env, COSMOS_USER_DATA: source.profile }, timeout: 45000 });
  page = await app.firstWindow(); page.setDefaultTimeout(25000); page.on('pageerror', e => report.errors.push(e.message));
  await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.setIgnoreMouseEvents(true); w.setContentSize(1280, 720); });
  await page.locator('.cosmos-studio').waitFor();
  await page.locator('.studio-sidebar').getByRole('button', { name: 'Домашние задания', exact: true }).click();
  if (!(await page.locator('.school-room').isVisible())) await page.locator('.conversation-history-list button').first().click();
  await page.locator('.school-room').waitFor();
  const saved = await page.evaluate(() => window.cosmos.loadState());
  const lesson = Object.values(saved.homeworkDesk.lessons).find(l => l.messages.some(m => m.id === source.turns[2].answer.id));
  assert(lesson); assert.equal(lesson.messages.filter(m => m.role === 'assistant').length, 3);
  assert.equal(lesson.messages.at(-1).learningStep.currentPlanId, 'p2');
  await shot('01-restored-plan');
  await button('Лист для решения').click();
  const reference = page.getByRole('region', { name: 'Условие над листом' });
  assert.match(await reference.innerText(), /BC/);
  report.sheetReference = await reference.innerText();
  await shot('02-latest-step-on-sheet');
  await button('Закрыть лист').click();
  const scene = page.locator('article.school-message.assistant').last().locator('.dialogue-scene');
  await scene.getByRole('button', { name: 'Рисунок целиком', exact: true }).click();
  await scene.locator('.ds-dots button').last().click(); await page.waitForTimeout(400);
  assert(await scene.locator('.ds-main-formula .katex').count());
  assert.equal(await scene.locator('.ds-figure-labels').count(), 0);
  assert(!(await scene.innerText()).includes('ШАГ 4 / 4'));
  await shot('03-typeset-spatial-diagram');
  assert.deepEqual(report.errors, []); report.status = 'pass';
} catch (e) { report.status = 'failed'; report.failure = String(e.stack || e); process.exitCode = 1; }
finally { if (app) await app.close(); await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report)); }
