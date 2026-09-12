import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
const { createReferenceLibrary } = createRequire(import.meta.url)('../desktop/references.cjs');
const parent = path.resolve('test-results');
const created: string[] = [];
const bytes = Buffer.from('%PDF-1.7\nreference guard fixture\n%%EOF');
const digest = createHash('sha256').update(bytes).digest('hex');
const metadata = {
  id: 'test-reference',
  sourceId: 'fipi-demo',
  subject: 'math',
  title: 'Тест источника',
  year: 2026,
  status: 'final',
  kind: 'codifier',
  file: 'test.pdf',
  bytes: bytes.length,
  sha256: digest,
  checkedAt: '2026-09-08',
};
async function fixture(changes = {}) {
  await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, 'reference-guard-'));
  created.push(root);
  const directory = path.join(root, 'library');
  await fs.mkdir(directory);
  await fs.writeFile(path.join(directory, 'test.pdf'), bytes);
  await fs.writeFile(path.join(root, 'outside.pdf'), bytes);
  await fs.writeFile(
    path.join(directory, 'manifest.json'),
    JSON.stringify({ version: 1, documents: [{ ...metadata, ...changes }] }),
  );
  let windows = 0;
  const log: string[] = [];
  const library = createReferenceLibrary({
    directory,
    BrowserWindow: class {
      constructor() {
        windows++;
        throw Error('Renderer must not be created by guard tests');
      }
    },
    session: {
      fromPartition: () => ({
        setPermissionRequestHandler() {},
        setPermissionCheckHandler() {},
        webRequest: { onBeforeRequest() {} },
      }),
    },
    parent: () => undefined,
    log: (scope: string) => log.push(scope),
  });
  return { root, directory, library, log, windows: () => windows };
}
afterEach(async () => {
  for (const directory of created.splice(0)) {
    const relative = path.relative(parent, path.resolve(directory));
    if (relative && !relative.startsWith('..') && !path.isAbsolute(relative))
      await fs.rm(directory, { recursive: true, force: true });
  }
});
describe('local PDF reference boundary', () => {
  it('lists only metadata, never exposes a path or arbitrary renderer URL', async () => {
    const { library } = await fixture();
    const listed = await library.list();
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe(metadata.id);
    expect(listed[0]).not.toHaveProperty('file');
    expect(listed[0]).not.toHaveProperty('sha256');
  });
  it('rejects traversal and unknown ids before creating a renderer', async () => {
    const { library, windows } = await fixture();
    expect((await library.open('../outside.pdf')).ok).toBe(false);
    expect((await library.open('unknown-id')).ok).toBe(false);
    expect(windows()).toBe(0);
  });
  it('does not accept a manifest entry outside its resource directory', async () => {
    const { library } = await fixture({ file: '../outside.pdf' });
    expect(await library.list()).toEqual([]);
  });
  it('detects modified bytes on opening even when size still matches', async () => {
    const { directory, library, log, windows } = await fixture();
    expect(await library.list()).toHaveLength(1);
    const modified = Buffer.from(bytes);
    modified[12] = modified[12] === 65 ? 66 : 65;
    await fs.writeFile(path.join(directory, 'test.pdf'), modified);
    expect((await library.open(metadata.id)).ok).toBe(false);
    expect(log).toContain('reference-integrity');
    expect(windows()).toBe(0);
  });
  it('treats a missing library as an empty optional resource, without blocking the app', async () => {
    const { directory, library } = await fixture();
    await fs.unlink(path.join(directory, 'manifest.json'));
    expect(await library.list()).toEqual([]);
    expect((await library.open(metadata.id)).ok).toBe(false);
  });
});
