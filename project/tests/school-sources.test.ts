import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
const { createSchoolSourceLibrary, sourceFragments, validSourceUrl } = createRequire(
  import.meta.url,
)('../desktop/school-sources.cjs');
const parent = path.resolve('test-results');
const created: string[] = [];
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
// Deliberately synthetic guard bytes: these tests make no claim about native PDF rendering.
const pdf = Buffer.from('%PDF-1.7\nSchool source security fixture\n%%EOF');
const pages = [
  'Оглавление. Физика 8 класса.',
  'Тепловые явления. Температура и внутренняя энергия.',
  'Электрические явления. Закон Ома.',
];
const text = pages.join('\n\n'),
  textBytes = Buffer.from(text);
let end = 0;
const ranges = pages.map((page) => {
  const result = [end, page.length];
  end += page.length + 2;
  return result;
});
const metadata = {
  id: 'edsoo-program-physics-8-9-2025',
  subject: 'physics',
  title: 'Физика · рабочая программа',
  grades: [8, 9],
  year: 2025,
  kind: 'program',
  status: 'official-program',
  url: 'https://edsoo.ru/wp-content/uploads/test.pdf',
  checkedAt: '2026-09-09',
  file: 'test.pdf',
  pdfBytes: pdf.length,
  pdfSha256: hash(pdf),
  textFile: 'test.txt',
  textBytes: textBytes.length,
  textSha256: hash(textBytes),
  pageCount: pages.length,
  textChars: text.length,
  pageRanges: ranges,
};
async function fixture(changes = {}) {
  await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, 'school-sources-'));
  created.push(root);
  const directory = path.join(root, 'library');
  await fs.mkdir(directory);
  await fs.writeFile(path.join(directory, 'test.pdf'), pdf);
  await fs.writeFile(path.join(directory, 'test.txt'), textBytes);
  await fs.writeFile(path.join(root, 'outside.pdf'), pdf);
  await fs.writeFile(
    path.join(directory, 'manifest.json'),
    JSON.stringify({ version: 1, documents: [{ ...metadata, ...changes }] }),
  );
  let windows = 0,
    destroyed = 0;
  const urls: string[] = [],
    options: any[] = [],
    logs: string[] = [];
  const library = createSchoolSourceLibrary({
    directory,
    BrowserWindow: class {
      gone = false;
      webContents = { setWindowOpenHandler() {}, on() {} };
      constructor(input: unknown) {
        windows++;
        options.push(input);
      }
      loadURL = async (url: string) => {
        urls.push(url);
      };
      isDestroyed = () => this.gone;
      destroy = () => {
        this.gone = true;
        destroyed++;
      };
      setTitle() {}
      show() {}
      focus() {}
    },
    session: {
      fromPartition: () => ({
        setPermissionRequestHandler() {},
        setPermissionCheckHandler() {},
        webRequest: { onBeforeRequest() {} },
      }),
    },
    log: (scope: string) => logs.push(scope),
  });
  return {
    root,
    directory,
    library,
    logs,
    windows: () => windows,
    destroyed: () => destroyed,
    urls,
    options,
  };
}
afterEach(async () => {
  for (const root of created.splice(0)) {
    const relative = path.relative(parent, path.resolve(root));
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative))
      throw Error('Unsafe test cleanup');
    await fs.rm(root, { recursive: true, force: true });
  }
});
describe('offline school-source boundary', () => {
  it('exposes provenance and hashes but no filesystem paths', async () => {
    const { library } = await fixture();
    const [source] = await library.list();
    expect(source).toMatchObject({
      id: metadata.id,
      kind: 'program',
      status: 'official-program',
      pageCount: 3,
      pdfSha256: metadata.pdfSha256,
    });
    for (const field of ['file', 'textFile', 'root', 'text', 'pdf', 'pageRanges'])
      expect(source).not.toHaveProperty(field);
    source.grades.push(11);
    expect((await library.list())[0].grades).toEqual([8, 9]);
  });
  it('distinguishes a guidance letter from a working program', async () => {
    const { library } = await fixture({
      id: 'frp-social-transition-2026',
      subject: 'social',
      grades: [9, 10, 11],
      kind: 'guidance',
      status: 'official-guidance',
      title: 'Официальное методическое письмо',
    });
    expect((await library.list())[0]).toMatchObject({
      kind: 'guidance',
      status: 'official-guidance',
      title: 'Официальное методическое письмо',
    });
    const invalid = await fixture({ kind: 'guidance', status: 'official-program' });
    expect(await invalid.library.list()).toEqual([]);
  });
  it('returns exact physical-page fragments and does not invent missing answers', async () => {
    const { library } = await fixture();
    const result = await library.read({
      id: metadata.id,
      page: 2,
      query: 'температура',
      maxChars: 4500,
    });
    expect(result.ok).toBe(true);
    expect(result.fragments).toEqual([{ page: 2, text: pages[1] }]);
    expect(result.truncated).toBe(false);
    const none = await library.read({ id: metadata.id, query: 'НесуществующаяТема' });
    expect(none.ok).toBe(true);
    expect(none.fragments).toEqual([]);
  });
  it('keeps a project standard distinct from a curriculum, including the original order year', async () => {
    const { library } = await fixture({
      id: 'fgos-project-requirements',
      subject: 'project',
      grades: [10, 11],
      kind: 'standard',
      status: 'official-standard',
      year: 2012,
      title: 'ФГОС СОО · п. 11: индивидуальный проект',
    });
    expect((await library.list())[0]).toMatchObject({
      subject: 'project',
      year: 2012,
      kind: 'standard',
      status: 'official-standard',
    });
    expect((await library.read({ id: 'fgos-project-requirements', page: 2 })).ok).toBe(true);
  });
  it('searches prepared text without URL fetching and honours a strict shared character budget', async () => {
    const { library } = await fixture();
    const result = await library.read({ id: metadata.id, query: 'электрические', maxChars: 21 });
    expect(result.fragments).toEqual([{ page: 3, text: pages[2].slice(0, 21) }]);
    expect(result.truncated).toBe(true);
    expect(
      result.fragments.reduce((sum: number, f: any) => sum + f.text.length, 0),
    ).toBeLessThanOrEqual(21);
  });
  it.each([
    { page: 0 },
    { page: 4 },
    { page: '1' },
    { maxChars: 0 },
    { maxChars: 6001 },
    { maxChars: Infinity },
    { query: 'x'.repeat(301) },
  ])('rejects invalid excerpt limits %j', async (input) => {
    const { library } = await fixture();
    const result = await library.read({ id: metadata.id, ...input });
    expect(result.ok).toBe(false);
    expect(result).not.toHaveProperty('fragments');
    expect(result.error).not.toMatch(/RPC|JSON|[A-Z]:\\/);
  });
  it.each(['../outside.pdf', 'https://edsoo.ru/file.pdf', 'unknown', 'C:\\secret.txt'])(
    'rejects arbitrary identifier %s without opening a window',
    async (id) => {
      const { library, windows } = await fixture();
      expect((await library.read({ id })).ok).toBe(false);
      expect((await library.open(id)).ok).toBe(false);
      expect(windows()).toBe(0);
    },
  );
  it.each([
    { file: '../outside.pdf' },
    { file: 'C:/secret.pdf' },
    { textFile: '../secret.txt' },
    { subject: 'unknown' },
    { grades: [6] },
    { url: 'https://evil.invalid/test.pdf' },
    { pageRanges: [[0, 9999]] },
  ])('rejects malformed source manifest %j', async (changes) => {
    const { library } = await fixture(changes);
    expect(await library.list()).toEqual([]);
  });
  it('detects a same-size text mutation instead of attributing it to the official PDF', async () => {
    const { library, directory, logs } = await fixture();
    expect(await library.list()).toHaveLength(1);
    const changed = Buffer.from(textBytes);
    changed[0] ^= 1;
    await fs.writeFile(path.join(directory, 'test.txt'), changed);
    expect((await library.read({ id: metadata.id, page: 2 })).ok).toBe(false);
    expect(logs).toContain('school-source-read');
  });
  it('detects a same-size PDF mutation before renderer creation', async () => {
    const { library, directory, windows } = await fixture();
    expect(await library.list()).toHaveLength(1);
    const changed = Buffer.from(pdf);
    changed[15] ^= 1;
    await fs.writeFile(path.join(directory, 'test.pdf'), changed);
    expect((await library.open(metadata.id)).ok).toBe(false);
    expect(windows()).toBe(0);
  });
  it('rejects a directory junction that escapes the library', async () => {
    const { library, root, directory } = await fixture({ file: 'escape/outside.pdf' });
    await fs.symlink(
      root,
      path.join(directory, 'escape'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    expect(await library.list()).toEqual([]);
  });
  it('keeps PDF preview sandboxed and closes only its own window', async () => {
    const { library, windows, destroyed, urls, options } = await fixture();
    expect((await library.open(metadata.id)).ok).toBe(true);
    expect(windows()).toBe(1);
    expect(urls[0]).toMatch(/^file:/);
    expect(options[0].webPreferences).toMatchObject({
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    });
    library.close();
    expect(destroyed()).toBe(1);
    expect((await library.open(metadata.id)).ok).toBe(false);
    expect(windows()).toBe(1);
  });
  it('treats a missing library as optional unavailable material', async () => {
    const { library, directory } = await fixture();
    await fs.unlink(path.join(directory, 'manifest.json'));
    expect(await library.list()).toEqual([]);
    expect((await library.read({ id: metadata.id })).ok).toBe(false);
  });
  it('does not silently claim a full result after omitting fourth and later matching pages', () => {
    const content = 'Тема1Тема2Тема3Тема4';
    const result = sourceFragments(
      content,
      [
        [0, 5],
        [5, 5],
        [10, 5],
        [15, 5],
      ],
      { query: 'Тема', maxChars: 100 },
    );
    expect(result.fragments).toHaveLength(3);
    expect(result.truncated).toBe(true);
  });
  it('accepts only official source metadata URLs, without credentials or foreign ports', () => {
    expect(validSourceUrl('https://edsoo.ru/path.pdf')).toBe(true);
    expect(validSourceUrl('https://www.edsoo.ru/path.pdf')).toBe(true);
    for (const url of [
      'http://edsoo.ru/a',
      'https://edsoo.ru.evil.invalid/a',
      'https://user:pass@edsoo.ru/a',
      'file:///x.pdf',
      'https://edsoo.ru:444/a',
    ])
      expect(validSourceUrl(url)).toBe(false);
  });
});
