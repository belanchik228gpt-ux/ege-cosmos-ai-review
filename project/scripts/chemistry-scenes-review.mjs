import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { renderChemistryScene, chemistryScenario } from '../shared/chemistry-scenes.mjs';

const out = path.resolve(process.env.COSMOS_QA_OUT || 'docs/verification/chemistry-scenes-0.7.2');
await fs.mkdir(out, { recursive: true });
const report = {
  status: 'running',
  scope:
    'Headless Chromium rendering of local shared SVG source: 48 authored frames. Not packaged EXE or model acceptance.',
  createdAt: new Date().toISOString(),
  sourceHashes: {},
  screenshots: [],
  overflow: [],
};
for (const file of [
  'shared/chemistry-scenes.mjs',
  'shared/chemistry-atoms.cjs',
  'src/domain/topic-scenes/chemistry-expanded.ts',
])
  report.sourceHashes[file] = createHash('sha256')
    .update(await fs.readFile(file))
    .digest('hex');
let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({
    viewport: { width: 1700, height: 1530 },
    deviceScaleFactor: 1,
  });
  for (let scenario = 0; scenario < 8; scenario++) {
    const html = `<!doctype html><html lang="ru"><meta charset="utf-8"><style>body{margin:0;padding:16px;background:#090710;color:#e6dcfa;font:20px 'Segoe UI',Arial}h1{font-size:24px;margin:0 0 12px}main{display:grid;grid-template-columns:820px 820px;gap:12px}section{width:820px}section p{margin:0 0 4px;font-size:17px}svg{display:block;width:820px;height:460px}</style><h1>Авторский пример ${scenario + 1}: ${chemistryScenario(scenario).title}</h1><main>${Array.from({ length: 6 }, (_, stage) => `<section data-stage="${stage}"><p>Кадр ${stage + 1} из 6</p>${renderChemistryScene([scenario, stage])}</section>`).join('')}</main></html>`;
    await fs.writeFile(path.join(out, `scenario-${scenario}.html`), html);
    await page.setContent(html);
    await page.evaluate(() => document.fonts.ready);
    const overflow = await page.locator('svg').evaluateAll((svgs) =>
      svgs.flatMap((svg) => {
        const outer = svg.getBoundingClientRect();
        return [...svg.querySelectorAll('text')]
          .map((el) => ({ text: el.textContent, box: el.getBoundingClientRect() }))
          .filter(
            ({ box: b }) =>
              b.left < outer.left - 2 ||
              b.right > outer.right + 2 ||
              b.top < outer.top - 2 ||
              b.bottom > outer.bottom + 2,
          )
          .map(({ text }) => ({ stage: svg.getAttribute('data-chemistry-stage'), text }));
      }),
    );
    report.overflow.push(...overflow.map((x) => ({ scenario, ...x })));
    const file = `scenario-${scenario}.png`;
    await page.screenshot({ path: path.join(out, file), fullPage: true });
    report.screenshots.push({ scenario, file, frames: 6 });
  }
  assert.deepEqual(report.overflow, [], 'SVG text must remain within its viewport');
  report.status = 'pass';
} catch (error) {
  report.status = 'failed';
  report.failure = String(error.stack || error);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
