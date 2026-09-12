import { _electron as electron } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';

const source = path.resolve('test-results/homework-1788972098675');
const profile = path.resolve(`test-results/homework-recovery-${Date.now()}`);
const exe = path.resolve('release/win-unpacked/EGE Cosmos.exe');
const out = path.resolve('docs/verification/homework-recovery-0.7.3');
await fs.mkdir(profile, { recursive: true });
await fs.mkdir(out, { recursive: true });
for (const name of ['learning-state.v1.json', 'Local Storage', 'homework-images', 'assignment.png'])
  await fs.cp(path.join(source, name), path.join(profile, name), { recursive: true });
const statePath = path.join(profile, 'learning-state.v1.json');
const initial = JSON.parse(await fs.readFile(statePath, 'utf8'));
const target = Object.values(initial.homeworkDesk.lessons).find(l => l.assignment?.imageId);
assert(target);
const missingFile = path.resolve(profile, 'homework-images', target.assignment.imageId, 'image.bin');
assert(missingFile.startsWith(profile + path.sep));
await fs.rename(missingFile, missingFile + '.qa-missing');
const report = {
  status: 'running', exe, profile, source, checks: [], screenshots: [], errors: [],
  asarSha256: createHash('sha256').update(await fs.readFile(path.join(path.dirname(exe), 'resources/app.asar'))).digest('hex'),
  scope: 'Actual packaged EXE. Isolated copy of prior authentic QA learning data and ink. Lost file and unanswered user image message are explicitly simulated interruption fixtures. No assistant replies injected. No new model calls. IPC observer forwards any invocation unchanged and counts calls.',
};
assert.equal(report.asarSha256, '0fc972a2f3528c4ccd000d293e895ec25944f4cf339588949dadbe25403effc0');
let app, page;
const button = name => page.getByRole('button', { name, exact: true });
async function shot(name) { const file = path.join(out, `${name}.png`); await page.screenshot({ path: file }); report.screenshots.push(file); }
async function launch() {
  app = await electron.launch({ executablePath: exe, env: { ...process.env, COSMOS_USER_DATA: profile, COSMOS_OPENAI_USER_DATA: path.join(process.env.APPDATA, 'EGE Cosmos Studio'), COSMOS_DOCUMENTS_DIR: path.join(profile, 'documents') }, timeout: 45000 });
  page = await app.firstWindow();
  page.setDefaultTimeout(20000);
  page.on('pageerror', error => report.errors.push(error.message));
  await app.evaluate(({ BrowserWindow, ipcMain }) => {
    const w = BrowserWindow.getAllWindows()[0]; w.setIgnoreMouseEvents(true); w.setContentSize(1280, 720);
    globalThis.__recoveryTutorCalls = 0;
    const original = ipcMain._invokeHandlers.get('cosmos:openai-tutor');
    if (!original) throw Error('Expected actual tutor IPC handler');
    ipcMain.removeHandler('cosmos:openai-tutor');
    ipcMain.handle('cosmos:openai-tutor', (...args) => { globalThis.__recoveryTutorCalls++; return original(...args); });
  });
  await page.locator('.cosmos-studio').waitFor();
  await page.locator('.studio-sidebar').getByRole('button', { name: 'Домашние задания', exact: true }).click();
  await page.getByLabel('Поиск прошлых диалогов').fill('3(x');
  await page.locator('.conversation-history-list button').first().click();
  await page.locator('.school-room').waitFor();
}
async function close() { await app.close(); app = undefined; }
try {
  await launch();
  await page.getByText('Не удалось открыть сохранённое фото. Прикрепи условие снова.', { exact: false }).waitFor();
  await page.locator('.school-feedback').scrollIntoViewIfNeeded(); await shot('01-simulated-missing-original');
  await page.locator('.school-composer input[type=file]').setInputFiles(path.join(profile, 'assignment.png'));
  await page.getByAltText('Исходное фото домашнего задания', { exact: true }).waitFor();
  await page.waitForFunction(async id => (await window.cosmos.loadState()).homeworkDesk.lessons[id].assignment.imageId !== '473a673e-4cec-4c96-a072-9b8a45be8c48', target.id);
  const recovered = await page.evaluate(async id => (await window.cosmos.loadState()).homeworkDesk.lessons[id].assignment.imageId, target.id);
  assert.notEqual(recovered, target.assignment.imageId);
  const savedPhoto = await fs.readFile(path.join(profile, 'homework-images', recovered, 'image.bin'));
  assert.deepEqual(savedPhoto, await fs.readFile(path.join(profile, 'assignment.png')));
  await button('Лист для решения').click();
  await page.locator('.sheet-assignment-content img').waitFor(); await shot('02-recovered-pinned-photo');
  const inkBefore = await page.locator('.sheet-paper canvas').evaluate(c => c.toDataURL('image/png'));
  await button('Закрыть лист').click();
  assert.equal(await app.evaluate(() => globalThis.__recoveryTutorCalls), 0);
  await close();
  await launch();
  await page.getByAltText('Исходное фото домашнего задания', { exact: true }).waitFor();
  await button('Лист для решения').click();
  await page.locator('.sheet-assignment-content img').waitFor();
  assert.equal(await page.locator('.sheet-paper canvas').evaluate(c => c.toDataURL('image/png')), inkBefore);
  await shot('03-recovered-photo-after-process-restart');
  await button('Закрыть лист').click();
  await close();
  report.checks.push({ case: 'Lost original photo -> real attach/save IPC -> pinned photo -> actual process restart', status: 'pass', originalId: target.assignment.imageId, recoveredId: recovered, savedBytes: savedPhoto.length, inkUnchanged: true });

  const fixture = JSON.parse(await fs.readFile(statePath, 'utf8'));
  const lesson = fixture.homeworkDesk.lessons[target.id];
  const message = { id: randomUUID(), role: 'user', kind: 'student', at: new Date().toISOString(), imageName: 'Моё рукописное решение.png', text: 'Проверь моё рукописное решение. Сверху изображения условие, снизу мои самостоятельные шаги. [QA: имитация закрытия приложения до ответа, вложение не сохранено]' };
  lesson.messages.push(message); lesson.updatedAt = message.at;
  await fs.writeFile(statePath, JSON.stringify(fixture));
  report.simulatedInterruption = { userMessageId: message.id, lessonId: lesson.id, assistantMessagesInjected: 0, originalPhotoAvailable: true };
  await launch();
  await page.getByAltText('Исходное фото домашнего задания', { exact: true }).waitFor();
  await page.getByText('Диалог с OpenAI · Enter — отправить, Shift + Enter — новая строка', { exact: true }).waitFor({timeout:60000});
  const before = await page.evaluate(async id => (await window.cosmos.loadState()).homeworkDesk.lessons[id].messages.length, target.id);
  await page.getByLabel('Сообщение школьному преподавателю', { exact: true }).fill('Продолжи проверку моего листа');
  await button('Отправить').click();
  await page.getByText('Проверка листа не успела завершиться.', { exact: false }).waitFor();
  await page.locator('.school-feedback').scrollIntoViewIfNeeded(); await shot('04-interruption-requires-resend-from-sheet');
  await page.waitForTimeout(1200);
  assert.equal(await app.evaluate(() => globalThis.__recoveryTutorCalls), 0);
  assert.equal(await page.evaluate(async id => (await window.cosmos.loadState()).homeworkDesk.lessons[id].messages.length, target.id), before);
  await button('Лист для решения').click();
  assert.equal(await page.locator('.sheet-paper canvas').evaluate(c => c.toDataURL('image/png')), inkBefore);
  assert(await button('Проверить решение').isEnabled());
  await shot('05-saved-ink-ready-for-real-resend');
  report.checks.push({ case: 'Simulated unanswered sheet after actual restart', status: 'pass', tutorIpcCalls: 0, studentMessagesAdded: 0, savedInkAvailableForResend: true });
  assert.deepEqual(report.errors, []); report.status = 'passed';
} catch(error) { report.status = 'failed'; report.error = String(error.stack || error); process.exitCode = 1; if (page) await shot('failure').catch(() => {}); }
finally { await app?.close().catch(() => {}); await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2)); }

