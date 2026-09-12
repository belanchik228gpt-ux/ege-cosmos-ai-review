import { _electron as electron } from 'playwright';
import { createServer } from 'vite';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const out = path.resolve('docs/verification/subject-scenes-0.7.1');
const profile = path.resolve(`test-results/subject-scenes-${Date.now()}`),
  exe = path.resolve(process.env.COSMOS_EXE || 'release/win-unpacked/EGE Cosmos.exe');
const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});
let cases;
try {
  const { schoolUnits, schoolSubjects } = await server.ssrLoadModule(
    '/src/domain/school-program.ts',
  );
  const { mathInformaticsDrawing } = await server.ssrLoadModule(
    '/src/domain/topic-scenes/math-informatics.ts',
  );
  const { naturalSciencesDrawing } = await server.ssrLoadModule(
    '/src/domain/topic-scenes/natural-sciences.ts',
  );
  const { humanitiesDrawing } = await server.ssrLoadModule(
    '/src/domain/topic-scenes/humanities.ts',
  );
  const unique = new Map();
  for (const unit of schoolUnits)
    for (const focus of [...unit.topics, unit.title]) {
      const d =
        mathInformaticsDrawing(unit, focus) ||
        naturalSciencesDrawing(unit, focus) ||
        humanitiesDrawing(unit, focus);
      if (d && !unique.has(d.title))
        unique.set(d.title, {
          unitId: unit.id,
          unit: unit.title,
          focus: focus === unit.title ? '' : focus,
          subject: unit.subject,
          subjectTitle: schoolSubjects.find((s) => s.id === unit.subject).title,
          grade: unit.grade,
          title: d.title,
          frames: d.steps.length,
          figure: d.figure,
        });
    }
  cases = [...unique.values()];
  if (process.env.COSMOS_SCENE_LIMIT)
    cases = cases.slice(0, Number(process.env.COSMOS_SCENE_LIMIT));
} finally {
  await server.close();
}
await fs.mkdir(out, { recursive: true });
const report = {
  status: 'running',
  at: new Date().toISOString(),
  exe,
  profile,
  scope:
    'Real packaged Electron EXE. Author-created local material selected through the actual school catalog; no injected learning results, no model calls in this script.',
  checks: [],
  screenshots: [],
  documents: [],
  errors: [],
};
report.asarSha256 = createHash('sha256')
  .update(await fs.readFile(path.join(path.dirname(exe), 'resources/app.asar')))
  .digest('hex');
let app, page;
const nav = (name) => page.locator('.studio-sidebar').getByRole('button', { name, exact: true });
const button = (name) => page.getByRole('button', { name, exact: true });
async function poll(fn, timeout = 30000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw Error('Timed out');
}
async function shot(locator, name) {
  const file = path.join(out, `${name}.png`);
  await locator.screenshot({ path: file });
  report.screenshots.push(file);
}
async function open(c) {
  await nav('Все школьные предметы').click();
  await page.getByLabel('Школьный класс', { exact: true }).selectOption(String(c.grade));
  if (await button('Все предметы').isVisible()) await button('Все предметы').click();
  await page.getByLabel('Поиск школьных тем', { exact: true }).fill('');
  await page
    .locator('.school-subject-card')
    .filter({ has: page.getByRole('heading', { name: c.subjectTitle, exact: true }) })
    .click();
  await page.getByLabel('Поиск школьных тем', { exact: true }).fill(c.unit);
  const heading = page
    .locator('.school-topic-title')
    .filter({ has: page.getByText(c.unit, { exact: true }) })
    .first();
  await heading.click();
  const card = page.locator('.school-topic-card.expanded');
  if (c.focus) {
    const show = card.getByRole('button', { name: /Показать всё содержание/ });
    if (await show.isVisible()) await show.click();
    const choices = card.locator('.school-subtopics button');
    const names = await choices.locator('.school-subtopic-copy').evaluateAll((nodes) =>
      nodes.map((el) =>
        Array.from(el.childNodes)
          .filter((n) => n.nodeType === Node.TEXT_NODE)
          .map((n) => n.textContent)
          .join('')
          .trim(),
      ),
    );
    const index = names.indexOf(c.focus);
    assert(index >= 0, `Subtopic not found: ${c.focus}`);
    await choices.nth(index).click();
  } else await card.getByRole('button', { name: 'Изучать раздел' }).click();
  await page.locator('.school-room').waitFor();
  await page.getByRole('link', { name: 'Учебная карточка', exact: true }).click();
  const scene = page.locator('#school-local-material .dialogue-scene');
  await scene.waitFor();
  assert.equal(await scene.getAttribute('aria-label'), c.title);
  return scene;
}
try {
  app = await electron.launch({
    executablePath: exe,
    env: {
      ...process.env,
      COSMOS_USER_DATA: profile,
      COSMOS_DOCUMENTS_DIR: path.join(profile, 'documents'),
    },
    timeout: 45000,
  });
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    w.setIgnoreMouseEvents(true);
    w.setContentSize(1600, 1000);
  });
  page = await app.firstWindow();
  page.setDefaultTimeout(15000);
  page.on('pageerror', (e) => report.errors.push(e.message));
  await page.locator('.welcome-modal input').fill('Предметные рисунки QA');
  await button('Начнём знакомство').click();
  await nav('Школа').click();
  const savedSubjects = new Set();
  for (const [i, c] of cases.entries()) {
    const scene = await open(c);
    const captions = [];
    // Every frame is selected through the player. Screenshots are real raster captures of the EXE.
    for (let frame = 0; frame < c.frames; frame++) {
      await scene.getByRole('button', { name: `Кадр ${frame + 1}`, exact: true }).click();
      assert.equal(await scene.getAttribute('data-step'), String(frame));
      captions.push(await scene.locator('.ds-caption').innerText());
      assert.equal(await scene.locator('.katex-error').count(), 0);
      if (frame === Math.min(2, c.frames - 1) || frame === c.frames - 1)
        await shot(scene, `${String(i + 1).padStart(3, '0')}-${c.subject}-frame-${frame + 1}`);
    }
    assert(new Set(captions).size >= 3);
    assert(
      captions.at(-1).includes('?') ||
        /попытка|самостоятельно|объясни|упрости|вычисли|найди|теперь|разложи/i.test(
          captions.at(-1),
        ),
    );
    if (c.figure)
      assert.equal(await scene.locator(`[data-subject-figure="${c.figure}"]`).count(), 1);
    await scene.getByRole('button', { name: 'Предыдущий кадр', exact: true }).click();
    assert.equal(await scene.getAttribute('data-step'), String(c.frames - 2));
    await scene.getByRole('button', { name: 'Следующий кадр', exact: true }).click();
    if (!savedSubjects.has(c.subject)) {
      savedSubjects.add(c.subject);
      await shot(page, `subject-${c.subject}`);
      await scene.getByRole('button', { name: 'Повторить рисунок', exact: true }).click();
      if ((await scene.getAttribute('data-motion')) === 'on') {
        await poll(async () => (await scene.getAttribute('data-playing')) === 'true');
        await scene.getByRole('button', { name: 'Пауза', exact: true }).click();
        assert.equal(await scene.getAttribute('data-playing'), 'false');
      }
    }
    report.checks.push({
      ...c,
      captions,
      controls: 'all frames, back, next; replay/pause once per subject',
    });
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    console.log(`${i + 1}/${cases.length} ${c.subject} ${c.title}`);
  }
  for (const figure of ['right-triangle', 'circuit']) {
    const c = cases.find((x) => x.figure === figure);
    assert(c, figure);
    await open(c);
    await button('Конспект').click();
    await page.locator('.school-document-preview').waitFor();
    await button('PDF').click();
    await poll(async () =>
      (await page.evaluate(() => window.cosmos.loadState())).school.documents.some(
        (d) => d.path?.endsWith('.pdf') && d.title.includes(c.focus || c.unit),
      ),
    );
    const docs = (await page.evaluate(() => window.cosmos.loadState())).school.documents;
    const doc = docs.filter((d) => d.path?.endsWith('.pdf')).at(-1);
    assert(doc.drawings.some((d) => d.figure === figure));
    const target = path.join(out, `${figure}.pdf`);
    await fs.copyFile(doc.path, target);
    report.documents.push(target);
  }
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setContentSize(1280, 720),
  );
  const small = cases.find((c) => c.figure === 'circuit');
  const scene = await open(small);
  await scene.getByRole('button', { name: 'Кадр 3', exact: true }).click();
  await shot(page, 'circuit-1280x720');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await poll(async () => (await scene.getAttribute('data-motion')) === 'off');
  await scene.getByRole('button', { name: 'Предыдущий кадр', exact: true }).click();
  assert.equal(await scene.getAttribute('data-step'), '1');
  await shot(scene, 'circuit-reduced-motion');
  report.reducedMotion = 'real renderer uses static frames and still supports navigation';
  assert.deepEqual(report.errors, []);
  report.status = 'pass';
} catch (e) {
  report.status = 'failed';
  report.failure = String(e.stack || e);
  process.exitCode = 1;
  if (page) await shot(page, 'failure').catch(() => {});
} finally {
  if (app) await app.close();
  await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        status: report.status,
        checked: report.checks.length,
        failure: report.failure,
        profile,
        out,
      },
      null,
      2,
    ),
  );
}
