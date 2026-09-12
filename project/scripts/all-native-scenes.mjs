import { _electron as electron } from 'playwright';
import path from 'node:path';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const root = process.cwd();
const executable = path.resolve(process.env.COSMOS_EXE || path.join(root, 'release/win-unpacked/EGE Cosmos.exe'));
const installedReview = Boolean(process.env.COSMOS_EXE);
const app = await electron.launch({
  executablePath: executable,
  args: ['--disable-backgrounding-occluded-windows'],
  env: {
    ...process.env,
    COSMOS_USER_DATA: path.join(root, 'test-results/scenes-' + Date.now()),

  },
  timeout: 45000,
});
const page = await app.firstWindow(),
  results = [];
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const appAsarSha256 = createHash('sha256').update(await fs.readFile(path.join(path.dirname(executable), 'resources/app.asar'))).digest('hex');
const folder = installedReview ? 'docs/screenshots/installed-final/scenes' : 'docs/screenshots/scenes';
const journal = installedReview ? 'docs/verification/installed-final-scenes.json' : 'docs/verification/all-native-scenes.json';
await fs.mkdir(folder, { recursive: true });
let failure;
try {
  await page.getByPlaceholder('Твоё имя').fill('Алексей');
  await page.getByRole('button', { name: 'Начнём знакомство' }).click();
  await app.evaluate(({ BrowserWindow }) => { const window=BrowserWindow.getAllWindows()[0];window.setSize(1920,1080);window.show();window.focus(); });
  for (const subject of ['Математика', 'Русский язык', 'История', 'Обществознание']) {
    await page
      .getByRole('navigation', { name: 'Предметы' })
      .getByRole('button', { name: subject, exact: true })
      .click();
    const titles = await page.locator('.topic-card h3').allTextContents();
    for (let i = 0; i < titles.length; i++) {
      if (i)
        await page
          .getByRole('navigation', { name: 'Предметы' })
          .getByRole('button', { name: subject, exact: true })
          .click();
      await page
        .locator('.topic-card')
        .filter({ has: page.getByRole('heading', { name: titles[i], exact: true }) })
        .click();
      await page.getByRole('button', { name: 'Пауза', exact: true }).waitFor();
      const ticks = page.locator('.sc-tick');
      const step = Math.max(1, (await ticks.count()) - 2);
      await ticks.nth(step).click();
      await page.waitForTimeout(1900);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      const filename = `${String(results.length + 1).padStart(2, '0')}.png`;
      await page.screenshot({ path: path.join(folder, filename), fullPage: true });
      results.push({
        subject,
        title: titles[i],
        selectedStep: step + 1,
        screenshot: filename,
        packagedExe: true,
        autoplay: true,
        overflow: false,
      });
      console.log('CAPTURED', titles[i]);
    }
  }
  assert.equal(results.length,13,'The authored scene set must contain exactly 13 scenes');
  assert.deepEqual(errors,[]);
} catch(error) {
  failure=String(error?.stack??error);
  throw error;
} finally {
  await app.close();
  await fs.writeFile(
    journal,
    JSON.stringify(
      { at: new Date().toISOString(), executable, source:installedReview?'COSMOS_EXE installed application':'Unpacked application', resolution: '1920x1080 outer window', appAsarSha256, errors, results, failure, passed:!failure&&results.length===13&&errors.length===0 },
      null,
      2,
    ),
  );
}
