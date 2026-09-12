import { _electron as electron } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = process.cwd();
const manifest = JSON.parse(
  await fs.readFile(path.join(root, 'resources/knowledge-sources/manifest.json'), 'utf8'),
);
const selected = manifest.documents.find(
  (document) => document.subject === 'math' && document.kind === 'codifier',
);
const pdf = path.join(root, 'resources/knowledge-sources', selected.file);
const app = await electron.launch({
  executablePath: path.join(root, 'node_modules/electron/dist/electron.exe'),
  args: ['.'],
  env: {
    ...process.env,
    COSMOS_USER_DATA: path.join(root, 'test-results/pdf-viewer-' + Date.now()),
    COSMOS_RUNTIME_DIR: path.join(root, 'test-results/no-model'),
  },
});
try {
  const main = await app.firstWindow();
  await main.waitForSelector('.home-intro');
  const entries = await main.evaluate(() => window.cosmos.listReferences());
  assert.equal(entries.length, manifest.documents.length);
  const rejected = await main.evaluate(async () => [
    await window.cosmos.openReference('../desktop/main.cjs'),
    await window.cosmos.openReference('missing-source-id'),
  ]);
  assert.equal(
    rejected.every((result) => !result.ok),
    true,
  );
  const event = app.waitForEvent('window');
  const opened = await main.evaluate((id) => window.cosmos.openReference(id), selected.id);
  assert.equal(opened.ok, true);
  const settings = await app.evaluate(async ({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[1];
    const preferences = win.webContents.getLastWebPreferences();
    return {
      sandbox: preferences.sandbox,
      contextIsolation: preferences.contextIsolation,
      nodeIntegration: preferences.nodeIntegration,
      preload: preferences.preload || null,
    };
  });
  const page = await event;
  await page.waitForTimeout(2800);
  await page.screenshot({
    path: path.join(root, 'docs/verification/reference-pdf-preview.png'),
    fullPage: true,
  });
  assert.equal(settings.sandbox, true);
  assert.equal(settings.contextIsolation, true);
  assert.equal(settings.nodeIntegration, false);
  assert.equal(settings.preload, null);
  const bridge = await page.evaluate(() => ({
    cosmos: typeof window.cosmos,
    node: typeof window.require,
  }));
  assert.deepEqual(bridge, { cosmos: 'undefined', node: 'undefined' });
  const blocked = await page.evaluate(async () => {
    try {
      await fetch('https://fipi.ru/');
      return false;
    } catch {
      return true;
    }
  });
  assert.equal(blocked, true);
  const next = entries.find((item) => item.id !== selected.id);
  assert.equal((await main.evaluate((id) => window.cosmos.openReference(id), next.id)).ok, true);
  assert.equal(app.windows().length, 2);
  const report = {
    checkedAt: new Date().toISOString(),
    file: path.relative(root, pdf),
    count: entries.length,
    settings,
    bridge,
    externalRequestsBlocked: blocked,
    invalidIdsRejected: true,
    reusedViewer: true,
  };
  await fs.writeFile(
    path.join(root, 'docs/verification/reference-pdf-checks.json'),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await app.close();
}
