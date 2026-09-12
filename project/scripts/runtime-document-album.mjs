import { _electron as electron } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { documentTopics, authoredTopicMarkdown } from '../shared/document-topics.mjs';
import { renderDocument } from '../shared/document-renderer.mjs';

const root = process.cwd();
const profile = path.join(root, 'test-results', 'document-album-' + Date.now());
const evidence = path.join(root, 'docs', 'verification');
await fs.mkdir(evidence, { recursive: true });
const app = await electron.launch({
  executablePath:
    process.env.COSMOS_TEST_EXE || path.join(root, 'node_modules/electron/dist/electron.exe'),
  args: process.env.COSMOS_TEST_EXE ? [] : ['.'],
  env: {
    ...process.env,
    COSMOS_USER_DATA: profile,
    COSMOS_DOCUMENTS_DIR: path.join(profile, 'documents'),
    COSMOS_RUNTIME_DIR: path.join(profile, 'no-model'),
  },
  timeout: 45000,
});
const results = [];
try {
  const page = await app.firstWindow();
  await page.waitForFunction(() => !!window.cosmos, { timeout: 30000 });
  for (const [topicId, topic] of Object.entries(documentTopics)) {
    const variants = [
      { style: 'cosmos', scale: 'comfortable' },
      ...(topicId === 'math-rectangle' ? [{ style: 'paper', scale: 'comfortable' }] : []),
      ...(['math-rectangle', 'russian-commas', 'history-reform', 'social-groups'].includes(topicId)
        ? [{ style: 'cosmos', scale: 'large' }]
        : []),
    ];
    for (const { style, scale } of variants) {
      const content = `# Конспект · ${topic.title}\n\n${authoredTopicMarkdown(topicId)}\n\n## Данные занятия\nЭтот проверочный файл создан без занятия. Успехи ученика не подставлены.\n\n## Проверка сохранения текста\n${Array.from({ length: 24 }, (_, index) => `Строка ${index + 1}. Короткая заметка для проверки переходов между страницами. Все строки должны оставаться в PDF.`).join('\n\n')}\n\n## Источники\nЭто авторский демонстрационный документ для проверки оформления, не официальный материал ФИПИ.\nКонец документа: ${topicId}.`;
      const input = {
        title: `Конспект · ${topic.title}`,
        subject: topicId.split('-')[0],
        topicId,
        content,
        documentType: 'Конспект занятия',
        style,
        scale,
        format: 'pdf',
      };
      const html = renderDocument(input);
      const measurements = await app.evaluate(async ({ BrowserWindow }, html) => {
        const win = new BrowserWindow({
          show: false,
          width: 1200,
          height: 900,
          webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
        });
        try {
          await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
          return await win.webContents.executeJavaScript(
            `Array.from(document.querySelectorAll('.album-page')).map((page, index) => {const footer=page.querySelector('.page-footer').getBoundingClientRect();const elements=Array.from(page.querySelectorAll('.page-body p,.page-body h1,.page-body h2,.page-body h3,.illustration,.formula'));return {page:index+1, teaching:page.classList.contains('teaching'), overflow:elements.filter(e=>e.getBoundingClientRect().bottom>footer.top-8).map(e=>e.textContent.slice(0,100))};})`,
          );
        } finally {
          win.destroy();
        }
      }, html);
      const output = await page.evaluate((input) => window.cosmos.exportDocument(input), input);
      assert(output.ok && output.path, JSON.stringify(output));
      const localFile = path.join(
        profile,
        `${topicId}-${style}${scale === 'large' ? '-large' : ''}.pdf`,
      );
      await fs.copyFile(output.path, localFile);
      await fs.writeFile(localFile.replace('.pdf', '.html'), html);
      results.push({
        topicId,
        style,
        scale,
        file: path.relative(root, localFile),
        bytes: (await fs.stat(localFile)).size,
        measurements,
      });
    }
  }
  const status = await page.evaluate(() => window.cosmos.modelStatus());
  assert.notEqual(status.state, 'starting');
  assert.notEqual(status.state, 'ready');
  await fs.writeFile(
    path.join(evidence, 'document-album-render-checks.json'),
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        profile: path.relative(root, profile),
        nativeElectron: true,
        modelStarted: false,
        results,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ profile, results }, null, 2));
  assert(
    results.every((result) => result.measurements.every((page) => page.overflow.length === 0)),
    'Visible text crosses page footer: inspect evidence',
  );
} finally {
  await app.close();
}
