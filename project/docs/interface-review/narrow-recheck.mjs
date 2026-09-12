import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
try {
  await page.goto('http://127.0.0.1:5173');
  await page.getByPlaceholder('Твоё имя').fill('Алексей');
  await page.getByRole('button', { name: 'Начнём знакомство', exact: true }).click();
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await page.getByRole('button', { name: 'Неон и движение', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(600);
  const geometry = await page.locator('.preference-demo').evaluate(e => {
    const icon = e.querySelector(':scope > svg').getBoundingClientRect();
    const title = e.querySelector('h2').getBoundingClientRect();
    return {
      icon: { top: icon.top, bottom: icon.bottom, width: icon.width },
      title: { top: title.top, bottom: title.bottom },
      overlap: icon.bottom > title.top && icon.top < title.bottom,
      overflow: document.documentElement.scrollWidth > innerWidth,
    };
  });
  assert.equal(geometry.overlap, false);
  assert.equal(geometry.overflow, false);
  await page.locator('.preference-demo').screenshot({ path: 'docs/interface-review/narrow-demo-resolved.png' });
  await page.screenshot({ path: 'docs/interface-review/motion-settings-390-resolved.png', fullPage: true });
  await writeFile('docs/interface-review/narrow-recheck-results.json', JSON.stringify({
    at: new Date().toISOString(), kind: 'Source browser, not EXE', width: 390, ...geometry,
  }, null, 2));
  console.log(geometry);
} finally {
  await browser.close();
}
