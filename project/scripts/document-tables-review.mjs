// File-only source export QA. Never opens Cosmos, starts a model, or edits learning data.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { renderDocument } from '../shared/document-renderer.mjs';

const root = path.resolve(import.meta.dirname, '..'),
  exec = promisify(execFile);
const out = path.join(root, 'docs/verification/document-tables-source-0.5.1');
const profile = path.resolve(
  process.env.COSMOS_DOCUMENT_QA_PROFILE ||
    path.join(root, 'test-results/exam-series-live-1788903437246'),
);
assert(
  profile.startsWith(path.join(root, 'test-results') + path.sep),
  'Only isolated QA learning data is allowed',
);
const stateBytes = await fs.readFile(path.join(profile, 'learning-state.v1.json'));
const state = JSON.parse(stateBytes);
const math = state.documents.find((d) => d.subject === 'math');
const russian = state.documents.find((d) => d.subject === 'russian');
assert(
  math?.content.includes('| Тариф |') &&
    math?.content.includes('| Время |') &&
    russian?.content.includes('придаточ'),
);
const items = [
  { name: 'math-series', input: math, expectedTables: 2 },
  { name: 'russian-lesson', input: russian, expectedTables: 0 },
  { name: 'math-series-large', input: { ...math, scale: 'large' }, expectedTables: 2 },
  {
    name: 'long-table-large-fixture',
    fixture: true,
    input: {
      title: 'Проверка длинной таблицы · авторская QA fixture',
      style: 'cosmos',
      scale: 'large',
      content:
        '# Проверка длинной таблицы\n\nАвторские данные только для проверки экспорта, не ответы и не достижения ученика.\n\n' +
        '| Строка | Проверяемое значение |\n|---|---:|\n' +
        Array.from({ length: 25 }, (_, i) => `| Запись_${i + 1} | ${i + 1} · сохранено |`).join(
          '\n',
        ) +
        '\n\n## Формулы в ячейках\n\n| Выражение | Смысл |\n|---|---|\n' +
        '| $\\frac{6}{24}=\\frac{1}{4}$ | Числитель и знаменатель делим на 6 |\n' +
        '| $|x|=3$ | Значение модуля равно 3 |\n\n' +
        'КОНЕЦ_ВСЕХ_СТРОК',
    },
  },
];
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const result = {
  at: new Date().toISOString(),
  scope:
    'Shared source renderer -> headless Chromium -> PDF -> Poppler; not installed EXE acceptance',
  sourceLearningFileSha256: hash(stateBytes),
  sourceHashes: {},
  outputs: [],
  status: 'running',
};
for (const file of ['shared/document-renderer.mjs', 'shared/document-scenes.mjs'])
  result.sourceHashes[file] = hash(await fs.readFile(path.join(root, file)));
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--disable-gpu'],
});
try {
  for (const item of items) {
    const html = renderDocument(item.input),
      htmlPath = path.join(out, item.name + '.html');
    await fs.writeFile(htmlPath, html);
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.route('**/*', (route) => route.abort());
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const geometry = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.album-page')).map((el, i) => {
        const frame = el.getBoundingClientRect(),
          footer = el.querySelector('.page-footer').getBoundingClientRect();
        const overflow = [];
        for (const node of el.querySelectorAll(
          '.text-column > *, .scene-print-note > *, .document-table th, .document-table td',
        )) {
          const rect = node.getBoundingClientRect();
          if (
            rect.bottom > footer.top - 3 ||
            rect.right > frame.right - 30 ||
            rect.left < frame.left + 25 ||
            node.scrollWidth > node.clientWidth + 2
          )
            overflow.push({
              text: node.textContent.slice(0, 100),
              bottom: rect.bottom - footer.top,
              width: node.scrollWidth - node.clientWidth,
            });
        }
        return {
          page: i + 1,
          overflow,
          tables: Array.from(el.querySelectorAll('table')).map((t) => ({
            header: t.tHead.textContent,
            rows: Array.from(t.tBodies[0].rows).map((r) =>
              Array.from(r.cells).map((c) => c.textContent),
            ),
          })),
        };
      }),
    );
    const tableCount = geometry.reduce((n, p) => n + p.tables.length, 0);
    if (item.expectedTables !== undefined) assert.equal(tableCount, item.expectedTables);
    if (item.fixture) {
      assert(tableCount >= 4, 'Long fixture did not span repeated header groups');
      const rows = geometry.flatMap((p) => p.tables).flatMap((t) => t.rows);
      for (let i = 1; i <= 25; i++) assert(rows.some((r) => r[0] === `Запись_${i}`));
    }
    const pdfPath = path.join(out, item.name + '.pdf');
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      landscape: true,
      printBackground: true,
      preferCSSPageSize: true,
    });
    await page.close();
    const bytes = await fs.readFile(pdfPath);
    assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
    const toolRoot = path.join(
      process.env.USERPROFILE,
      '.cache/codex-runtimes/codex-primary-runtime/dependencies',
    );
    const pngDirectory = path.join(out, item.name);
    await fs.mkdir(pngDirectory, { recursive: true });
    await exec(
      path.join(toolRoot, 'native/poppler/Library/bin/pdftoppm.exe'),
      ['-r', '105', '-png', pdfPath, path.join(pngDirectory, 'page')],
      { windowsHide: true, timeout: 60000, maxBuffer: 3000 },
    );
    await exec(
      path.join(toolRoot, 'python/python.exe'),
      [
        '-c',
        'from pypdf import PdfReader; import pathlib,sys; pathlib.Path(sys.argv[2]).write_text("\\n\\n".join(p.extract_text() or "" for p in PdfReader(sys.argv[1]).pages),encoding="utf-8")',
        pdfPath,
        path.join(pngDirectory, 'extracted.txt'),
      ],
      { windowsHide: true, timeout: 15000 },
    );
    const pngs = (await fs.readdir(pngDirectory))
      .filter((f) => /^page-\d+\.png$/.test(f))
      .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
    const extracted = await fs.readFile(path.join(pngDirectory, 'extracted.txt'), 'utf8');
    if (item.fixture) assert(extracted.includes('КОНЕЦ_ВСЕХ_СТРОК'));
    result.outputs.push({
      name: item.name,
      fixture: !!item.fixture,
      inputContentSha256: hash(item.input.content),
      inputTitle: item.input.title,
      pdf: pdfPath,
      html: htmlPath,
      bytes: bytes.length,
      sha256: hash(bytes),
      pages: pngs.length,
      images: pngs.map((p) => path.join(pngDirectory, p)),
      geometry,
      visualReview: 'pending personal inspection',
    });
    assert(
      geometry.every((p) => p.overflow.length === 0),
      'Source overflow: ' + JSON.stringify(geometry.filter((p) => p.overflow.length)),
    );
  }
  result.status = 'rendered-needs-visual-review';
} catch (error) {
  result.status = 'fail';
  result.error = error.stack;
  process.exitCode = 1;
} finally {
  await browser.close();
  await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
}
