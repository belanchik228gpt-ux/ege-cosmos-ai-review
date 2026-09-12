import { chromium } from 'playwright';
import { createServer } from 'vite';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { lessonLabExamples, renderLessonLab } from '../shared/lesson-lab.mjs';
const out = path.resolve('docs/verification/lesson-lab-expansion');
await fs.mkdir(out, { recursive: true });
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
const { schoolUnits } = await server.ssrLoadModule('/src/domain/school-program.ts');
const { topicDrawing } = await server.ssrLoadModule('/src/domain/school-topic-drawings.ts');
const matches = [];
for (const u of schoolUnits)
  for (const topic of [u.title, ...u.topics]) {
    const d = topicDrawing(u, topic);
    if (d.figure === 'lesson-lab')
      matches.push({
        unitId: u.id,
        grade: u.grade,
        subject: u.subject,
        topic,
        scenario: d.steps[0].values[0],
      });
  }
await server.close();
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1280, height: 930 } });
const report = {
  scope: 'Actual Chromium-rendered local SVG frames; not packaged EXE and not model responses.',
  status: 'running',
  examples: lessonLabExamples.length,
  frames: 0,
  subjects: [...new Set(lessonLabExamples.map((e) => e.subject))],
  catalogMatches: matches,
  issues: [],
  screenshots: [],
};
try {
  for (const [index, e] of lessonLabExamples.entries())
    for (let stage = 0; stage < e.steps.length; stage++) {
      const svg = renderLessonLab([index, stage], 1);
      const caption = e.steps[stage].caption.replace(
        /[&<>]/g,
        (k) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[k],
      );
      await page.setContent(
        `<html lang="ru"><meta charset="utf-8"><style>body{margin:0;background:#100c19;color:#efe9ff;font:22px Segoe UI,sans-serif;padding:24px}h1{font-size:26px;margin:0 0 12px}svg{width:100%;max-height:650px;display:block}p{padding:18px;background:#251b37;border-radius:14px;font-size:22px;line-height:1.5;margin:12px 0}</style><h1>${e.title}</h1>${svg}<p>${caption}</p></html>`,
      );
      const errors = await page.locator('svg').evaluate((svg) =>
        [...svg.querySelectorAll('text')].flatMap((t) => {
          const b = t.getBBox();
          return b.x < 0 || b.y < 0 || b.x + b.width > 1000 || b.y + b.height > 590
            ? [{ text: t.textContent, x: b.x, y: b.y, width: b.width, height: b.height }]
            : [];
        }),
      );
      if (errors.length) report.issues.push({ example: e.id, stage, errors });
      const file = path.join(out, `${String(index).padStart(2, '0')}-${e.id}-${stage}.png`);
      await page.screenshot({ path: file });
      report.screenshots.push(file);
      report.frames++;
    }
  assert.equal(report.issues.length, 0, JSON.stringify(report.issues));
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = String(error);
  process.exitCode = 1;
} finally {
  await browser.close();
  await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify({
      status: report.status,
      examples: report.examples,
      frames: report.frames,
      catalogMatches: matches.length,
      reachableScenarios: new Set(matches.map((m) => m.scenario)).size,
      issues: report.issues,
    }),
  );
}
