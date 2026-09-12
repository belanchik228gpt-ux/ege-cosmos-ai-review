import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import { createServer } from 'vite';
import { chromium } from 'playwright';
const root = process.cwd(),
  out = path.join(root, 'docs/verification/studio-secondary-browser-0.5');
await fs.mkdir(out, { recursive: true });
const report = {
  at: new Date().toISOString(),
  scope:
    'Current App in headless browser, isolated blank browser profile, UI navigation only. No model or native export.',
  pages: [],
  errors: [],
  passed: false,
};
let server, browser, page;
try {
  server = await createServer({
    root,
    server: { port: 5177, host: '127.0.0.1', strictPort: true },
    logLevel: 'error',
  });
  await server.listen();
  browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
  });
  page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on('pageerror', (e) => report.errors.push(String(e)));
  await page.goto('http://127.0.0.1:5177');
  await page.locator('.welcome-modal input').fill('Проверка визуала');
  await page.getByRole('button', { name: 'Начнём знакомство', exact: true }).click();
  const nav = (name) => page.locator('.studio-sidebar').getByRole('button', { name, exact: true });
  const shot = async (id) => {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(out, id + '.png') });
    const width = await page.evaluate(() => ({
      viewport: innerWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    report.pages.push({ id, ...width });
    if (width.scroll > width.viewport) throw Error(id + ' horizontal overflow');
  };
  for (const [id, name] of [
    ['01-settings', 'Настройки'],
    ['02-documents', 'Мои конспекты'],
    ['03-plan', 'План подготовки'],
    ['04-memory', 'Память Cosmos'],
    ['05-progress', 'Мой прогресс'],
    ['06-backgrounds', 'Каталог фонов'],
  ]) {
    await nav(name).click();
    await shot(id);
  }
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Скачать TON 618 в PNG', exact: true }).click();
  const download=await downloadEvent;
  const downloadPath=path.join(root,'test-results','studio-background-download.png');
  await download.saveAs(downloadPath);
  const downloaded=await fs.readFile(downloadPath),original=await fs.readFile(path.join(root,'public/backgrounds/cosmos-blackhole.png'));
  if(!downloaded.equals(original))throw Error('Downloaded background differs from actual bundled asset');
  report.download={file:downloadPath,bytes:downloaded.length,sha256:createHash('sha256').update(downloaded).digest('hex'),exactBundledBytes:true};
  await page.getByRole('button', { name: 'Установить TON 618', exact: true }).click();
  await page.waitForFunction(()=>document.querySelector('.studio-ton-backdrop img')?.naturalWidth===1536);
  await shot('06b-ton618-installed');
  await page.waitForTimeout(600);await page.reload();
  await page.waitForFunction(()=>document.documentElement.dataset.background==='cosmos-ton618');
  await page.waitForFunction(()=>document.querySelector('.studio-ton-backdrop img')?.naturalWidth===1536);
  await shot('06c-ton618-restored');
  report.backgroundRestore=true;
  await nav('Мои конспекты').click();
  await page.getByRole('button', { name: 'Новый документ', exact: true }).click();
  await page.getByRole('button', { name: 'Создать документ', exact: true }).click();
  await page.getByRole('dialog', { name: 'Редактор документа' }).waitFor();
  await shot('07-document-preview');
  await page.getByRole('button', { name: 'Закрыть документ', exact: true }).click();
  await page.setViewportSize({ width: 700, height: 900 });
  for (const [id, name] of [
    ['08-settings-700', 'Настройки'],
    ['09-plan-700', 'План подготовки'],
    ['10-memory-700', 'Память Cosmos'],
    ['11-backgrounds-700', 'Каталог фонов'],
  ]) {
    await page.getByRole('button', { name: 'Открыть меню', exact: true }).click();
    await nav(name).click();
    await shot(id);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Открыть меню', exact: true }).click();
  await nav('Настройки').click();
  await shot('12-settings-390');
  report.passed = report.errors.length === 0;
} catch (error) {
  report.failure = String(error);
  process.exitCode = 1;
  await page?.screenshot({ path: path.join(out, 'failure.png'), fullPage: true }).catch(() => {});
} finally {
  await browser?.close();
  await server?.close();
  await fs.writeFile(path.join(out, 'results.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
