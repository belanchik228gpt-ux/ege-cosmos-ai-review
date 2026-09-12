import { _electron as electron } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
const root = process.cwd();
await fs.mkdir('docs/screenshots', { recursive: true });
const exe = path.resolve('release/win-unpacked/EGE Cosmos.exe');
const app = await electron.launch({
  executablePath: exe,
  args: [],
  env: {
    ...process.env,
    COSMOS_USER_DATA: path.join(root, 'test-results/visual-profile'),
    COSMOS_DOCUMENTS_DIR: path.join(root, 'test-results/documents'),
    COSMOS_RUNTIME_DIR: path.join(root, 'runtime'),
  },
  timeout: 45000,
});
const page = await app.firstWindow();
page.on('pageerror', (e) => console.log('PAGE_ERROR', e.message));
await page.waitForSelector('.home-intro');
if (await page.locator('.welcome-modal').count()) {
  await page.getByPlaceholder('Твоё имя').fill('Алексей');
  await page.getByRole('button', { name: 'Начнём знакомство' }).click();
}
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 1000));
await page.waitForTimeout(1000);
await page.screenshot({ path: 'docs/screenshots/01-home-desktop.png', fullPage: true });
console.log('EXE', await page.evaluate(() => window.cosmos.getAppInfo()));
console.log(
  'SIZE',
  await page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
    scroll: document.documentElement.scrollWidth,
  })),
);
console.log('MODEL', await page.evaluate(() => window.cosmos.modelStatus()));
await app.close();
