const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { pathToFileURL } = require('node:url');

const inside = (root, target) => {
  const relative = path.relative(root, target);
  return (
    !!relative &&
    !path.isAbsolute(relative) &&
    relative !== '..' &&
    !relative.startsWith('..' + path.sep)
  );
};
function createReferenceLibrary({ directory, BrowserWindow, session, parent, log }) {
  let indexPromise,
    previewWindow,
    previewSession,
    currentUrl = '';
  async function index() {
    if (!indexPromise)
      indexPromise = (async () => {
        const root = await fs.realpath(directory);
        const raw = await fs.readFile(path.join(root, 'manifest.json'), 'utf8');
        if (raw.length > 500000) throw new Error('Reference manifest too large');
        const manifest = JSON.parse(raw);
        if (
          manifest.version !== 1 ||
          !Array.isArray(manifest.documents) ||
          manifest.documents.length > 200
        )
          throw new Error('Invalid reference manifest');
        const result = new Map();
        for (const item of manifest.documents) {
          if (
            !item ||
            !/^[a-z0-9][a-z0-9._-]{1,100}$/.test(item.id) ||
            result.has(item.id) ||
            typeof item.sourceId !== 'string' ||
            !/^[a-z0-9][a-z0-9._-]{1,100}$/.test(item.sourceId) ||
            !Number.isSafeInteger(item.year) ||
            item.year < 2020 ||
            item.year > 2100 ||
            !['math', 'russian', 'history', 'social'].includes(item.subject) ||
            !['final', 'draft'].includes(item.status) ||
            !['codifier', 'specification', 'navigator'].includes(item.kind) ||
            typeof item.file !== 'string' ||
            path.isAbsolute(item.file) ||
            path.extname(item.file).toLowerCase() !== '.pdf' ||
            !/^[a-f0-9]{64}$/i.test(item.sha256) ||
            !Number.isSafeInteger(item.bytes) ||
            item.bytes < 10 ||
            item.bytes > 40 * 1024 * 1024
          )
            continue;
          const candidate = path.resolve(root, item.file);
          if (!inside(root, candidate)) continue;
          try {
            const file = await fs.realpath(candidate),
              stat = await fs.stat(file);
            if (!inside(root, file) || !stat.isFile() || stat.size !== item.bytes) continue;
            result.set(item.id, {
              file,
              sha256: item.sha256.toLowerCase(),
              bytes: item.bytes,
              metadata: {
                id: item.id,
                sourceId: String(item.sourceId || '').slice(0, 160),
                subject: item.subject,
                title: String(item.title || 'Учебный материал').slice(0, 240),
                year: Number(item.year),
                status: item.status,
                kind: item.kind,
                checkedAt: String(item.checkedAt || '').slice(0, 30),
              },
            });
          } catch {
            log('reference-unavailable', item.id);
          }
        }
        return result;
      })().catch((error) => {
        log('references', error.message);
        return new Map();
      });
    return indexPromise;
  }
  function window() {
    if (previewWindow && !previewWindow.isDestroyed()) return previewWindow;
    previewSession = session.fromPartition('cosmos-reference-preview');
    previewSession.setPermissionRequestHandler((_contents, _permission, callback) =>
      callback(false),
    );
    previewSession.setPermissionCheckHandler(() => false);
    previewSession.webRequest.onBeforeRequest((details, callback) => {
      const url = details.url;
      callback({
        cancel: !(url === currentUrl || /^(chrome-extension:|chrome:|blob:|data:)/.test(url)),
      });
    });
    previewWindow = new BrowserWindow({
      width: 1120,
      height: 940,
      minWidth: 620,
      minHeight: 520,
      parent: parent(),
      show: false,
      autoHideMenuBar: true,
      title: 'Cosmos · Учебный источник',
      backgroundColor: '#1a1722',
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        plugins: true,
        session: previewSession,
      },
    });
    previewWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    previewWindow.webContents.on('will-attach-webview', (event) => event.preventDefault());
    previewWindow.webContents.on('will-navigate', (event, url) => {
      if (url !== currentUrl) event.preventDefault();
    });
    previewWindow.webContents.on('page-title-updated', (event) => event.preventDefault());
    previewWindow.on('closed', () => {
      previewWindow = undefined;
    });
    return previewWindow;
  }
  let openQueue = Promise.resolve();
  async function open(id) {
    if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9._-]{1,100}$/.test(id))
      return { ok: false, error: 'Этот материал не найден в локальной библиотеке.' };
    const item = (await index()).get(id);
    if (!item) return { ok: false, error: 'PDF пока отсутствует в установленной библиотеке.' };
    const bytes = await fs.readFile(item.file);
    if (
      bytes.length !== item.bytes ||
      bytes.subarray(0, 5).toString() !== '%PDF-' ||
      createHash('sha256').update(bytes).digest('hex') !== item.sha256
    ) {
      log('reference-integrity', id);
      return {
        ok: false,
        error: 'Файл источника изменён или повреждён. Переустанови библиотеку материалов.',
      };
    }
    const win = window();
    currentUrl = pathToFileURL(item.file).href;
    let timer;
    try {
      await Promise.race([
        win.loadURL(currentUrl),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('PDF preview timeout')), 15000);
        }),
      ]);
      win.setTitle(`Cosmos · ${item.metadata.title}`);
      win.show();
      win.focus();
      return { ok: true };
    } catch (error) {
      log('reference-preview', error.message);
      if (!win.isDestroyed()) win.destroy();
      return { ok: false, error: 'Не получилось открыть PDF. Попробуй ещё раз.' };
    } finally {
      clearTimeout(timer);
    }
  }
  return {
    list: async () => [...(await index()).values()].map((item) => item.metadata),
    open: (id) => {
      const result = openQueue.catch(() => {}).then(() => open(id));
      openQueue = result.catch(() => {});
      return result;
    },
    close: () => {
      if (previewWindow && !previewWindow.isDestroyed()) previewWindow.destroy();
    },
  };
}
module.exports = { createReferenceLibrary };
