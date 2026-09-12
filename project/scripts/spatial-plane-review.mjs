import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { renderSpatialPlane } from '../shared/spatial-plane.mjs';
const out = path.resolve('docs/verification/spatial-plane');
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const report = {
  scope: 'Actual Chromium SVG rendering; not packaged EXE or live model output',
  frames: 0,
  issues: [],
  screenshots: [],
};
try {
  for (let scenario = 0; scenario < 4; scenario++)
    for (let stage = 0; stage < 4; stage++) {
      await page.setContent(
        `<style>body{margin:0;background:#090711;padding:24px}svg{width:100%;height:820px}</style>${renderSpatialPlane([scenario, stage])}`,
      );
      const issues = await page.locator('svg').evaluate((svg) =>
        [...svg.querySelectorAll('text')].flatMap((text) => {
          const b = text.getBBox();
          return b.x < 0 || b.y < 0 || b.x + b.width > 1000 || b.y + b.height > 650
            ? [text.textContent]
            : [];
        }),
      );
      if (issues.length) report.issues.push({ scenario, stage, issues });
      const file = path.join(out, `case-${scenario}-step-${stage}.png`);
      await page.screenshot({ path: file });
      report.screenshots.push(file);
      report.frames++;
    }
  for (let scenario = 0; scenario < 4; scenario++) {
    await page.setContent(
      renderSpatialPlane([scenario, 3], ['αααα', 'MMMM', 'NNNN', 'PPPP', 'bbbb', 'ββββ']),
    );
    const issues = await page.locator('svg').evaluate((svg) =>
      [...svg.querySelectorAll('text')].flatMap((text) => {
        const b = text.getBBox();
        return b.x < 0 || b.y < 0 || b.x + b.width > 1000 || b.y + b.height > 650
          ? [text.textContent]
          : [];
      }),
    );
    if (issues.length) report.issues.push({ scenario, longNames: true, issues });
  }
  report.status = report.issues.length ? 'failed' : 'passed';
  await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify({ status: report.status, frames: report.frames, issues: report.issues }),
  );
  if (report.issues.length) process.exitCode = 1;
} finally {
  await browser.close();
}
