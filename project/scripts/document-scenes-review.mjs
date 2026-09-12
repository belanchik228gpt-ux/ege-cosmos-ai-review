// Headless Chromium rendering of the shared source exporter. Never launches Cosmos or a model.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { renderDocument } from '../shared/document-renderer.mjs';
const exec = promisify(execFile),
  root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'docs/verification/document-scenes-source-0.5');
const sourceReport = JSON.parse(
  await fs.readFile(
    path.join(root, 'docs/verification/studio-live-native-0.5/report.json'),
    'utf8',
  ),
);
const profile = path.resolve(process.env.COSMOS_SCENE_QA_PROFILE || sourceReport.profile);
assert(
  profile.startsWith(path.join(root, 'test-results') + path.sep),
  'Use only the isolated QA learning profile',
);
// Read exactly the authorised educational state file; never inspect credentials or browser data.
const stateBytes = await fs.readFile(path.join(profile, 'learning-state.v1.json'));
const state = JSON.parse(stateBytes);
const lessons = Object.values(state.cloudSessions || {});
const actual = [];
for (const subject of ['math', 'russian', 'history', 'social']) {
  const messages = lessons
    .filter((l) => l.subject === subject)
    .flatMap((l) => l.messages)
    .filter((m) => m.kind === 'openai' && m.drawing);
  if (subject === 'math') {
    actual.push(messages.find((m) => m.drawing.kind === 'number-line')?.drawing);
    actual.push(messages.find((m) => m.drawing.kind === 'geometry')?.drawing);
  } else actual.push(messages[0]?.drawing);
}
assert(actual.length === 5 && actual.every(Boolean), 'Actual saved drawings unavailable');
const longCaption =
  'Проверяем каждое преобразование и сохраняем объяснение целиком. '.repeat(26) +
  'ПОСЛЕДНЯЯ_СТРОКА_ПОЯСНЕНИЯ';
const stress = [
  {
    kind: 'algebra',
    title: 'Дроби и последовательность решения',
    steps: [
      {
        caption: 'Сокращаем числитель и знаменатель на один общий множитель.',
        formula: String.raw`\frac{6}{24}=\frac{1}{4}`,
      },
      {
        caption: longCaption,
        formula: String.raw`\begin{aligned}x+3&=7\\x+3-3&=7-3\\x&=4\end{aligned}`,
        labels: ['Проверка: ' + 'Сохраняем все слова. '.repeat(14) + 'КОНЕЦ_ПОДПИСИ'],
      },
    ],
  },
  {
    kind: 'geometry',
    title: 'Квадрат и его сторона',
    steps: [
      {
        caption: 'Все четыре стороны имеют длину 5. Численный ответ не добавляем.',
        values: [5],
        labels: ['квадрат'],
      },
    ],
  },
  {
    kind: 'geometry',
    title: 'Высота треугольника',
    steps: [
      {
        caption: 'Основание a = 7, перпендикулярная ему высота h = 4. Показываем прямой угол.',
        values: [7, 4],
        labels: ['треугольник'],
        formula: String.raw`S=\frac{a\cdot h}{2}`,
      },
    ],
  },
];
await fs.mkdir(out, { recursive: true });
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const result = {
  at: new Date().toISOString(),
  scope:
    'Shared source renderer -> headless Chromium PDF -> Poppler PNG; not installed EXE acceptance',
  sourceLearningFileSha256: hash(stateBytes),
  actualDrawingCount: actual.length,
  actualFrames: actual.reduce((sum, d) => sum + d.steps.length, 0),
  sourceHashes: {},
  outputs: [],
  status: 'running',
};
for (const file of ['shared/document-scenes.mjs', 'shared/document-renderer.mjs'])
  result.sourceHashes[file] = hash(await fs.readFile(path.join(root, file)));
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--disable-gpu'],
});
try {
  for (const item of [
    {
      name: 'actual-subject-scenes',
      scale: 'comfortable',
      drawings: actual,
      content:
        '# Рисунки из настоящего QA-разговора\n\nСцены получены ранее от OpenAI в изолированном учебном QA-профиле. Это проверка экспорта сохранённых данных, не новая генерация, не оценка знаний ученика.\n\nЧисловая прямая, геометрия, русский язык, история и спрос сохранены по кадрам. Полнота учебного курса этим образцом не подтверждается.',
    },
    {
      name: 'long-notes-large',
      scale: 'large',
      drawings: stress,
      content:
        '# Проверка длинных пояснений\n\nАвторская контрольная fixture оформления. Эти примеры не являются ответами или достижениями ученика.\n\nКонтрольная завершающая строка документа.',
    },
  ]) {
    const html = renderDocument({
      title: 'Конспект с рисунками по шагам',
      style: 'cosmos',
      ...item,
    });
    const htmlPath = path.join(out, item.name + '.html');
    await fs.writeFile(htmlPath, html);
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.route('**/*', (route) => route.abort());
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const geometry = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.album-page')).map((el, i) => {
        const page = el.getBoundingClientRect(),
          footer = el.querySelector('.page-footer').getBoundingClientRect();
        const overflow = [];
        for (const node of el.querySelectorAll(
          '.scene-print-row,.text-column,.scene-print-art>*,.scene-print-note>*',
        )) {
          const box = node.getBoundingClientRect();
          if (
            box.bottom > footer.top - 3 ||
            box.right > page.right - 30 ||
            box.left < page.left + 25
          )
            overflow.push({
              type: node.className,
              bottom: box.bottom - footer.top,
              right: box.right - page.right,
              text: node.textContent.slice(0, 100),
            });
        }
        for (const row of el.querySelectorAll('.scene-print-row')) {
          const b = row.getBoundingClientRect();
          for (const child of row.querySelectorAll('.scene-print-note>*')) {
            const c = child.getBoundingClientRect();
            if (c.bottom > b.bottom - 5)
              overflow.push({ type: 'row-overlap', text: child.textContent.slice(0, 100) });
          }
        }
        return { page: i + 1, overflow };
      }),
    );
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
    assert(bytes.subarray(0, 5).toString() === '%PDF-');
    const toolsDirectory =
      process.env.COSMOS_POPPLER_DIR ||
      path.join(
        process.env.USERPROFILE,
        '.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/Library/bin',
      );
    const pngDirectory = path.join(out, item.name);
    await fs.mkdir(pngDirectory, { recursive: true });
    await exec(
      path.join(toolsDirectory, 'pdftoppm.exe'),
      ['-r', '105', '-png', pdfPath, path.join(pngDirectory, 'page')],
      { windowsHide: true, timeout: 60000, maxBuffer: 3000 },
    );
    const pngs = (await fs.readdir(pngDirectory)).filter((f) => f.endsWith('.png')).sort();
    const python =
      process.env.COSMOS_PYTHON ||
      path.join(
        process.env.USERPROFILE,
        '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe',
      );
    await exec(
      python,
      [
        '-c',
        'from pypdf import PdfReader; import pathlib,sys; pathlib.Path(sys.argv[2]).write_text("\\n\\n".join(p.extract_text() or "" for p in PdfReader(sys.argv[1]).pages),encoding="utf-8")',
        pdfPath,
        path.join(pngDirectory, 'extracted.txt'),
      ],
      { windowsHide: true, timeout: 15000 },
    );
    const extracted = await fs.readFile(path.join(pngDirectory, 'extracted.txt'), 'utf8');
    if (item.name === 'long-notes-large')
      for (const needle of [
        'ПОСЛЕДНЯЯ_СТРОКА_ПОЯСНЕНИЯ',
        'КОНЕЦ_ПОДПИСИ',
        'Контрольная завершающая строка документа.',
      ])
        assert(extracted.includes(needle), `PDF lost ${needle}`);
    result.outputs.push({
      name: item.name,
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
      'Actual source layout overflow: ' + JSON.stringify(geometry.filter((p) => p.overflow.length)),
    );
  }
  result.status = 'rendered-needs-visual-review';
} catch (error) {
  result.status = 'fail';
  result.error = error.stack;
  process.exitCode = 1;
} finally {
  await browser.close();
  await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}
