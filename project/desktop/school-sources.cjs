const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { schoolSubject } = require('./school-subjects.cjs');
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const idPattern = /^[a-z0-9][a-z0-9._-]{1,120}$/;
const sourceStatuses = {
  program: 'official-program',
  guidance: 'official-guidance',
  standard: 'official-standard',
  'textbook-reference': 'textbook-reference',
};
const inside = (root, file) => {
  const relative = path.relative(root, file);
  return (
    !!relative &&
    !path.isAbsolute(relative) &&
    relative !== '..' &&
    !relative.startsWith('..' + path.sep)
  );
};
const publicError =
  'Не удалось прочитать школьный источник. Проверь установленную библиотеку материалов.';
function validSourceUrl(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      ['edsoo.ru', 'www.edsoo.ru'].includes(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.port
    );
  } catch {
    return false;
  }
}
async function resourceFile(root, relative, extension, expectedBytes) {
  if (
    typeof relative !== 'string' ||
    relative.length > 180 ||
    !/^[a-z0-9][a-z0-9/._-]+$/.test(relative) ||
    path.extname(relative) !== extension ||
    path.isAbsolute(relative)
  )
    throw new Error('Invalid school resource path');
  const candidate = path.resolve(root, relative);
  if (!inside(root, candidate)) throw new Error('School resource path escape');
  const file = await fs.realpath(candidate),
    stat = await fs.stat(file);
  if (!inside(root, file) || !stat.isFile() || stat.size !== expectedBytes)
    throw new Error('School resource integrity');
  return file;
}
async function schoolIndex(directory, log) {
  const root = await fs.realpath(directory),
    manifestFile = await fs.realpath(path.join(root, 'manifest.json'));
  const manifestStat = await fs.stat(manifestFile);
  if (!inside(root, manifestFile) || !manifestStat.isFile() || manifestStat.size > 2000000)
    throw new Error('School manifest limit');
  const manifest = JSON.parse(await fs.readFile(manifestFile, 'utf8'));
  if (
    manifest.version !== 1 ||
    !Array.isArray(manifest.documents) ||
    manifest.documents.length > 100
  )
    throw new Error('Invalid school manifest');
  const index = new Map();
  for (const entry of manifest.documents) {
    try {
      const subject = schoolSubject(entry?.subject);
      if (
        !entry ||
        !idPattern.test(entry.id) ||
        index.has(entry.id) ||
        !subject ||
        typeof entry.title !== 'string' ||
        !entry.title.trim() ||
        entry.title.length > 400 ||
        !Array.isArray(entry.grades) ||
        !entry.grades.length ||
        entry.grades.some((grade) => !subject.grades.includes(grade)) ||
        !validSourceUrl(entry.url) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(entry.checkedAt) ||
        !Object.hasOwn(sourceStatuses, entry.kind) ||
        entry.status !== sourceStatuses[entry.kind] ||
        !Number.isInteger(entry.year) ||
        entry.year < 2000 ||
        entry.year > 2100 ||
        !Number.isInteger(entry.pageCount) ||
        entry.pageCount < 1 ||
        entry.pageCount > 1000 ||
        !/^[a-f0-9]{64}$/.test(entry.pdfSha256) ||
        !/^[a-f0-9]{64}$/.test(entry.textSha256) ||
        !Number.isSafeInteger(entry.pdfBytes) ||
        entry.pdfBytes < 10 ||
        entry.pdfBytes > 40 * 1024 * 1024 ||
        !Number.isSafeInteger(entry.textBytes) ||
        entry.textBytes < 1 ||
        entry.textBytes > 10 * 1024 * 1024 ||
        !Number.isSafeInteger(entry.textChars) ||
        entry.textChars < 1 ||
        entry.textChars > 10 * 1024 * 1024 ||
        !Array.isArray(entry.pageRanges) ||
        entry.pageRanges.length !== entry.pageCount
      )
        throw new Error('Invalid school source metadata');
      let end = 0;
      for (const range of entry.pageRanges) {
        if (
          !Array.isArray(range) ||
          range.length !== 2 ||
          !Number.isSafeInteger(range[0]) ||
          !Number.isSafeInteger(range[1]) ||
          range[0] < end ||
          range[1] < 0 ||
          range[0] + range[1] > entry.textChars
        )
          throw new Error('Invalid school source page offsets');
        end = range[0] + range[1];
      }
      const pdf = await resourceFile(root, entry.file, '.pdf', entry.pdfBytes);
      const text = await resourceFile(root, entry.textFile, '.txt', entry.textBytes);
      index.set(entry.id, {
        root,
        pdf,
        text,
        entry,
        metadata: {
          id: entry.id,
          subject: entry.subject,
          title: entry.title,
          grades: [...new Set(entry.grades)],
          url: entry.url,
          checkedAt: entry.checkedAt,
          year: entry.year,
          kind: entry.kind,
          status: entry.status,
          pageCount: entry.pageCount,
          pdfSha256: entry.pdfSha256,
          textSha256: entry.textSha256,
        },
      });
    } catch (error) {
      log(
        'school-source-entry',
        `${String(entry?.id || 'unknown').slice(0, 140)}: ${error.message}`,
      );
    }
  }
  return index;
}
function sourceFragments(text, ranges, input) {
  const maxChars = input.maxChars ?? 4500;
  if (
    !Number.isInteger(maxChars) ||
    maxChars < 1 ||
    maxChars > 6000 ||
    (input.page !== undefined &&
      (!Number.isInteger(input.page) || input.page < 1 || input.page > ranges.length)) ||
    (input.query !== undefined && (typeof input.query !== 'string' || input.query.length > 300))
  )
    throw new Error('Invalid school excerpt request');
  const words = [
    ...new Set((input.query || '').toLocaleLowerCase('ru').match(/[\p{L}\p{N}]{3,}/gu) || []),
  ].slice(0, 20);
  const candidates = ranges.map(([start, length], i) => {
    const value = text.slice(start, start + length),
      lower = value.toLocaleLowerCase('ru');
    return {
      page: i + 1,
      text: value,
      score: words.reduce((n, word) => n + (lower.includes(word) ? 1 : 0), 0),
    };
  });
  const selected = [];
  if (input.page) selected.push(candidates[input.page - 1]);
  selected.push(
    ...candidates
      .filter(
        (c) =>
          c.page !== input.page &&
          (words.length ? c.score > 0 : !input.page || c.page === input.page + 1),
      )
      .sort((a, b) => b.score - a.score || a.page - b.page),
  );
  const fragments = [];
  let remaining = maxChars,
    truncated = selected.length > 3;
  for (const candidate of selected.slice(0, 3)) {
    if (!remaining) {
      truncated = true;
      break;
    }
    if (!candidate.text.trim()) continue;
    let start = 0;
    if (candidate.text.length > remaining && words.length) {
      const lower = candidate.text.toLocaleLowerCase('ru'),
        matches = words.map((word) => lower.indexOf(word)).filter((index) => index >= 0);
      if (matches.length) start = Math.max(0, Math.min(...matches) - 180);
    }
    const value = candidate.text.slice(start, start + remaining);
    truncated ||= start > 0 || value.length < candidate.text.length;
    fragments.push({ page: candidate.page, text: value });
    remaining -= value.length;
  }
  return { fragments, truncated };
}
function createSchoolSourceLibrary({
  directory,
  BrowserWindow,
  session,
  parent = () => undefined,
  log = () => {},
}) {
  let indexPromise,
    preview,
    currentUrl = '',
    closed = false,
    openQueue = Promise.resolve();
  const index = () =>
    (indexPromise ||= schoolIndex(directory, log).catch((error) => {
      log('school-sources', error.message);
      return new Map();
    }));
  async function find(id) {
    if (typeof id !== 'string' || !idPattern.test(id)) throw new Error('Invalid school source id');
    const item = (await index()).get(id);
    if (!item) throw new Error('School source unavailable');
    return item;
  }
  async function read(input) {
    try {
      if (!input || typeof input !== 'object' || Array.isArray(input))
        throw new Error('Invalid excerpt');
      const item = await find(input.id);
      const currentFile = await resourceFile(
        item.root,
        item.entry.textFile,
        '.txt',
        item.entry.textBytes,
      );
      const bytes = await fs.readFile(currentFile),
        text = bytes.toString('utf8');
      if (
        bytes.length !== item.entry.textBytes ||
        text.length !== item.entry.textChars ||
        digest(bytes) !== item.entry.textSha256
      )
        throw new Error('School text hash mismatch');
      const excerpt = sourceFragments(text, item.entry.pageRanges, input);
      return { ok: true, source: item.metadata, ...excerpt };
    } catch (error) {
      log('school-source-read', error.message);
      return { ok: false, error: publicError };
    }
  }
  async function open(id) {
    try {
      if (closed) return { ok: false, error: publicError };
      const item = await find(id);
      const currentFile = await resourceFile(
        item.root,
        item.entry.file,
        '.pdf',
        item.entry.pdfBytes,
      );
      const bytes = await fs.readFile(currentFile);
      if (
        bytes.length !== item.entry.pdfBytes ||
        digest(bytes) !== item.entry.pdfSha256 ||
        bytes.subarray(0, 5).toString() !== '%PDF-'
      )
        throw new Error('School PDF hash mismatch');
      if (closed) return { ok: false, error: publicError };
      if (!preview || preview.isDestroyed()) {
        const pdfSession = session.fromPartition('cosmos-school-source-preview');
        pdfSession.setPermissionRequestHandler((_contents, _permission, cb) => cb(false));
        pdfSession.setPermissionCheckHandler(() => false);
        pdfSession.webRequest.onBeforeRequest((details, cb) =>
          cb({
            cancel: !(
              details.url === currentUrl ||
              /^(chrome-extension:|chrome:|blob:|data:)/.test(details.url)
            ),
          }),
        );
        preview = new BrowserWindow({
          width: 1120,
          height: 940,
          minWidth: 620,
          minHeight: 520,
          parent: parent(),
          show: false,
          autoHideMenuBar: true,
          title: 'Cosmos · Школьная программа',
          backgroundColor: '#100b1c',
          webPreferences: {
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false,
            webSecurity: true,
            plugins: true,
            session: pdfSession,
          },
        });
        preview.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
        preview.webContents.on('will-attach-webview', (event) => event.preventDefault());
        preview.webContents.on('will-navigate', (event, url) => {
          if (url !== currentUrl) event.preventDefault();
        });
        preview.webContents.on('page-title-updated', (event) => event.preventDefault());
      }
      currentUrl = pathToFileURL(currentFile).href;
      const window = preview;
      let timer;
      try {
        await Promise.race([
          window.loadURL(currentUrl),
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('School PDF timeout')), 15000);
          }),
        ]);
        if (closed || window.isDestroyed()) return { ok: false, error: publicError };
        window.setTitle(`Cosmos · ${item.metadata.title}`);
        window.show();
        window.focus();
        return { ok: true };
      } catch (error) {
        if (!window.isDestroyed()) window.destroy();
        throw error;
      } finally {
        clearTimeout(timer);
      }
    } catch (error) {
      log('school-source-open', error.message);
      return { ok: false, error: publicError };
    }
  }
  return {
    list: async () =>
      [...(await index()).values()].map((item) => ({
        ...item.metadata,
        grades: [...item.metadata.grades],
      })),
    read,
    open: (id) => {
      const result = openQueue.catch(() => {}).then(() => open(id));
      openQueue = result.catch(() => {});
      return result;
    },
    close: () => {
      closed = true;
      if (preview && !preview.isDestroyed()) preview.destroy();
    },
  };
}
module.exports = { createSchoolSourceLibrary, sourceFragments, schoolIndex, validSourceUrl };
