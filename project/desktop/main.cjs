const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  session,
  nativeTheme,
  nativeImage,
} = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { LocalModel } = require('./local-model.cjs');
const { ImageReader } = require('./image-reader.cjs');
const { readImageData } = require('./image-reader.cjs');
const { OpenAIService } = require('./openai-service.cjs');
const documents = require('./documents.cjs');
const backgrounds = require('./backgrounds.cjs');
const { createReferenceLibrary } = require('./references.cjs');
const { createSchoolSourceLibrary } = require('./school-sources.cjs');
const { createHomeworkImageStore } = require('./homework-images.cjs');

app.setName('EGE Cosmos');
nativeTheme.themeSource = 'dark';
if (process.env.COSMOS_DISABLE_GPU === '1') app.disableHardwareAcceleration();
const userData = process.env.COSMOS_USER_DATA
  ? path.resolve(process.env.COSMOS_USER_DATA)
  : path.join(app.getPath('appData'), 'EGE Cosmos Studio');
app.setPath('userData', userData);
const statePath = path.join(userData, 'learning-state.v1.json');
const backgroundsDir = path.join(userData, 'backgrounds');
const runtimeDir = process.env.COSMOS_RUNTIME_DIR
  ? path.resolve(process.env.COSMOS_RUNTIME_DIR)
  : app.isPackaged
    ? path.join(process.resourcesPath, 'runtime')
    : path.join(__dirname, '..', 'runtime');
let mainWindow,
  references,
  schoolSources,
  model,
  imageReader,
  openai,
  saveQueue = Promise.resolve(),
  diagnostics = [],
  quitting = false;
const diagnosticPath = path.join(userData, 'diagnostics.jsonl');
const documentsDir = process.env.COSMOS_DOCUMENTS_DIR
  ? path.resolve(process.env.COSMOS_DOCUMENTS_DIR)
  : path.join(app.getPath('documents'), 'EGE Cosmos');
function log(scope, message) {
  const entry = { at: new Date().toISOString(), scope, message: String(message).slice(0, 6000) };
  diagnostics.push(entry);
  if (diagnostics.length > 100) diagnostics = diagnostics.slice(-100);
  fs.appendFile(diagnosticPath, JSON.stringify(entry) + '\n').catch(() => {});
}
function validSender(event) {
  if (
    !mainWindow ||
    event.sender !== mainWindow.webContents ||
    event.senderFrame !== mainWindow.webContents.mainFrame
  )
    throw new Error('Untrusted IPC sender');
}
function handler(name, fn, fallback) {
  ipcMain.handle(`cosmos:${name}`, async (event, ...args) => {
    try {
      validSender(event);
      return await fn(...args);
    } catch (error) {
      log(name, error.stack || error.message);
      return typeof fallback === 'function' ? fallback() : fallback;
    }
  });
}
async function readState() {
  let readError = false;
  for (const file of [statePath, statePath + '.backup']) {
    try {
      const raw = await fs.readFile(file, 'utf8');
      if (raw.length > 16 * 1024 * 1024) throw new Error('State size limit');
      const data = JSON.parse(raw);
      if (!data || typeof data !== 'object' || Array.isArray(data))
        throw new Error('Invalid saved state');
      if (file.endsWith('.backup'))
        log('state-recovery', 'Recovered previous valid learning state from backup');
      return data;
    } catch (error) {
      if (error.code !== 'ENOENT') {
        readError = true;
        log('state-read', error.message);
      }
    }
  }
  return readError ? { loadError: true } : null;
}
async function writeState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return false;
  const raw = JSON.stringify(state);
  if (raw.length > 16 * 1024 * 1024) return false;
  const write = async () => {
    const file = await fs.open(statePath + '.tmp', 'w');
    try {
      await file.writeFile(raw, 'utf8');
      await file.sync();
    } finally {
      await file.close();
    }
    // Only a known valid state can replace the recovery file.
    try {
      const previous = await fs.readFile(statePath, 'utf8');
      JSON.parse(previous);
      await fs.copyFile(statePath, statePath + '.backup');
    } catch {}
    // Windows scanners and briefly open readers may hold the target. Keep the old
    // valid snapshot intact and retry the atomic replacement for a bounded time.
    for (let attempt = 0; ; attempt++) {
      try {
        await fs.rename(statePath + '.tmp', statePath);
        break;
      } catch (error) {
        if (attempt >= 4 || !['EPERM', 'EBUSY', 'EACCES'].includes(error.code)) throw error;
        await new Promise((resolve) => setTimeout(resolve, 40 * 2 ** attempt));
      }
    }
    return true;
  };
  const task = saveQueue.then(write);
  saveQueue = task.catch(() => {});
  return task;
}
function registerBridge() {
  const homeworkImages = createHomeworkImageStore({ userData, nativeImage, log });
  handler('save-homework-image', (input) => homeworkImages.save(input), {
    ok: false,
    error: 'Не удалось сохранить фото задания.',
  });
  handler('read-homework-image', (id) => homeworkImages.read(id), {
    ok: false,
    error: 'Не удалось открыть фото задания.',
  });
  handler('list-school-sources', () => schoolSources.list(), []);
  handler('open-school-source', (id) => schoolSources.open(id), {
    ok: false,
    error: 'Не удалось открыть школьный источник.',
  });
  handler('read-school-source', (input) => schoolSources.read(input), {
    ok: false,
    error: 'Не удалось прочитать школьный источник.',
  });
  const openaiFailure = {
    ok: false,
    error: 'Связь с OpenAI временно недоступна. Попробуй ещё раз.',
  };
  handler('openai-status', () => openai.getStatus(), {
    available: false,
    runtimeAvailable: false,
    authenticated: null,
    state: 'error',
    busy: false,
    models: [],
  });
  handler('openai-login', () => openai.login(), openaiFailure);
  handler('openai-login-cancel', () => openai.cancelLogin(), false);
  handler('openai-logout', () => openai.logout(), openaiFailure);
  handler('openai-model-select', (id) => openai.selectModel(id), openaiFailure);
  handler('openai-tutor', (input) => openai.generate(input), openaiFailure);
  handler('openai-tutor-cancel', () => openai.cancel(), false);
  handler(
    'load-state',
    () => {
      // Reads join the same queue as writes; rapid status queries cannot overlap
      // an atomic replacement or observe an earlier backup during an update.
      const task = saveQueue.then(readState);
      saveQueue = task.then(
        () => undefined,
        () => undefined,
      );
      return task;
    },
    { loadError: true },
  );
  handler('save-state', writeState, false);
  handler(
    'export-document',
    (input) => documents.exportDocument(input, { documentsDir, BrowserWindow }),
    { ok: false, error: 'Не удалось сохранить документ. Попробуй другой формат.' },
  );
  handler(
    'open-document',
    async (file) => {
      if (typeof file !== 'string') return false;
      const real = await fs.realpath(file),
        root = await fs.realpath(documentsDir);
      if (
        !real.startsWith(root + path.sep) ||
        !['.txt', '.md', '.html', '.pdf', '.docx'].includes(path.extname(real).toLowerCase())
      )
        return false;
      return !(await shell.openPath(real));
    },
    false,
  );
  handler('diagnostics', () => diagnostics, []);
  handler('model-status', () => model.status(), {
    available: false,
    detail: 'Учебный режим доступен.',
  });
  handler('update-model-backend', (backend) => model.updateBackend(backend), {
    ok: false,
    error: 'Не удалось сохранить режим модели. Попробуй ещё раз.',
  });
  handler(
    'record-tutor-check',
    (reason) => {
      if (typeof reason !== 'string' || !reason.trim() || reason.length > 400) return false;
      log('tutor-check', reason.trim());
      return true;
    },
    false,
  );
  handler('ask-model', (request) => model.ask(request), {
    ok: false,
    error: 'Ответ временно недоступен. Продолжай занятие с подсказками.',
  });
  handler('plan-tutor-turn', (request) => model.planTutorTurn(request), {
    ok: false,
    method: 'local-model-step-selection',
    error: 'Выбор шага временно недоступен. Продолжай с текущим условием.',
  });
  handler('cancel-ask-model', () => model.cancel(), false);
  handler('image-reader-status', () => imageReader.status(), {
    available: false,
    busy: false,
    method: 'local-vision',
    detail: 'Чтение фото пока недоступно. Условие можно ввести вручную.',
  });
  handler('read-problem-image', (request) => imageReader.read(request), {
    ok: false,
    error: 'Не удалось прочитать фото. Условие можно ввести вручную.',
  });
  handler('cancel-image-reading', () => imageReader.cancel(), false);
  handler(
    'window-activity',
    () => ({
      visible:
        !!mainWindow &&
        !mainWindow.isDestroyed() &&
        mainWindow.isVisible() &&
        !mainWindow.isMinimized(),
      focused: !!mainWindow && !mainWindow.isDestroyed() && mainWindow.isFocused(),
    }),
    { visible: false, focused: false },
  );
  handler(
    'choose-model',
    async () => {
      if (model.configurationBusy())
        return {
          ok: false,
          error: 'Дождись завершения ответа или запуска модели, затем выбери файл.',
        };
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Выбрать локальную модель Cosmos',
        properties: ['openFile'],
        filters: [{ name: 'Локальная модель', extensions: ['gguf'] }],
      });
      if (result.canceled) return { ok: false, canceled: true };
      return { ok: true, ...(await model.selectModel(result.filePaths[0])) };
    },
    { ok: false, error: 'Этот файл не подходит. Нужна совместимая модель GGUF.' },
  );
  handler(
    'import-background',
    async () => {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Выбрать папку фона с manifest.json',
        properties: ['openDirectory'],
      });
      if (result.canceled) return { ok: false, canceled: true };
      return backgrounds.importBackground(result.filePaths[0], backgroundsDir);
    },
    {
      ok: false,
      error: 'Не удалось импортировать фон. Проверь manifest.json и наличие изображений.',
    },
  );
  handler('list-backgrounds', () => backgrounds.listBackgrounds(backgroundsDir), []);
  handler(
    'export-builtin-background',
    async (id) => {
      if (id !== 'cosmos-ton618') return { ok: false, error: 'Этот фон недоступен.' };
      const source = path.join(
        __dirname,
        '..',
        app.isPackaged ? 'dist' : 'public',
        'backgrounds',
        'cosmos-blackhole.png',
      );
      const bytes = await fs.readFile(source);
      if (
        bytes.length > 25 * 1024 * 1024 ||
        bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
      )
        throw new Error('Invalid built-in background PNG');
      const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Сохранить фон Cosmos TON 618',
        defaultPath: path.join(app.getPath('downloads'), 'Cosmos-TON618.png'),
        filters: [{ name: 'Изображение PNG', extensions: ['png'] }],
      });
      if (result.canceled || !result.filePath) return { ok: false, canceled: true };
      await fs.writeFile(result.filePath, bytes);
      if ((await fs.stat(result.filePath)).size !== bytes.length)
        throw new Error('Incomplete background write');
      return { ok: true, path: result.filePath };
    },
    { ok: false, error: 'Не удалось сохранить фон. Попробуй выбрать другую папку.' },
  );
  handler(
    'save-math-sheet',
    async (input) => {
      const image = readImageData(input);
      if (
        image.mime !== 'image/png' ||
        image.width !== 1400 ||
        image.height < 900 ||
        image.height > 2200 ||
        nativeImage.createFromBuffer(image.bytes).isEmpty()
      )
        throw new Error('Invalid math sheet');
      const directory = path.join(
        documentsDir,
        'Математика',
        new Date().toISOString().slice(0, 10),
        'Черновики',
      );
      await fs.mkdir(directory, { recursive: true });
      const target = path.join(directory, `Решение-${require('node:crypto').randomUUID()}.png`);
      await fs.writeFile(target, image.bytes, { flag: 'wx' });
      if ((await fs.stat(target)).size !== image.bytes.length) throw new Error('Incomplete sheet');
      return { ok: true, path: target };
    },
    {
      ok: false,
      error: 'Не удалось сохранить PNG. Черновик остаётся в занятии — попробуй ещё раз.',
    },
  );
  handler('list-references', () => references.list(), []);
  handler('open-reference', (id) => references.open(id), {
    ok: false,
    error: 'Не получилось открыть учебный источник.',
  });
  handler(
    'app-info',
    () => ({
      name: app.getName(),
      version: app.getVersion(),
      packaged: app.isPackaged,
      userData,
      documentsDir,
      platform: process.platform,
    }),
    {},
  );
}
function isApprovedExternal(raw) {
  try {
    const url = new URL(raw);
    return (
      url.protocol === 'https:' &&
      [
        'fipi.ru',
        'www.fipi.ru',
        'ege.fipi.ru',
        'doc.fipi.ru',
        'github.com',
        'huggingface.co',
        'prlib.ru',
        'www.prlib.ru',
        'gramota.ru',
        'openstax.org',
        'foxford.ru',
        'edsoo.ru',
        'www.edsoo.ru',
        'prosv.ru',
        'www.prosv.ru',
        'media.prosv.ru',
        'learn.chatgpt.com',
        'en.chateauversailles.fr',
        'www.nalog.gov.ru',
        'duma.gov.ru',
        'www.hist.msu.ru',
      ].includes(url.hostname)
    );
  } catch {
    return false;
  }
}
async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 620,
    minHeight: 520,
    title: 'EGE Cosmos',
    backgroundColor: '#090b15',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
    },
  });
  for (const event of ['minimize', 'restore', 'hide', 'show']) {
    mainWindow.on(event, () => {
      if (!mainWindow.isDestroyed()) mainWindow.webContents.send('cosmos:window-visible', mainWindow.isVisible() && !mainWindow.isMinimized());
    });
  }
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isApprovedExternal(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow.webContents.getURL()) {
      event.preventDefault();
      if (isApprovedExternal(url)) shell.openExternal(url);
    }
  });
  mainWindow.webContents.on('will-attach-webview', (event) => event.preventDefault());
  mainWindow.webContents.on('render-process-gone', (_, details) =>
    log('renderer', JSON.stringify(details)),
  );
  mainWindow.once('ready-to-show', () => mainWindow.show());
  const devUrl = !app.isPackaged && process.env.COSMOS_DEV_URL;
  if (devUrl && /^http:\/\/127\.0\.0\.1:\d+\/?$/.test(devUrl)) await mainWindow.loadURL(devUrl);
  else await mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  mainWindow.show();
}
app
  .whenReady()
  .then(async () => {
    await fs.mkdir(userData, { recursive: true });
    await fs.mkdir(backgroundsDir, { recursive: true });
    try {
      const text = await fs.readFile(diagnosticPath, 'utf8');
      diagnostics = text
        .trim()
        .split('\n')
        .slice(-100)
        .flatMap((line) => {
          try {
            return [JSON.parse(line)];
          } catch {
            return [];
          }
        });
      if (text.length > 1024 * 1024)
        await fs.writeFile(
          diagnosticPath,
          diagnostics.map((d) => JSON.stringify(d)).join('\n') + '\n',
        );
    } catch {}
    session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) =>
      callback(
        permission === 'media' ||
          (permission === 'fullscreen' && _webContents === mainWindow?.webContents),
      ),
    );
    session.defaultSession.setPermissionCheckHandler(
      (_webContents, permission) =>
        permission === 'media' ||
        (permission === 'fullscreen' && _webContents === mainWindow?.webContents),
    );
    model = new LocalModel({ runtimeDir, userData, log });
    imageReader = new ImageReader({ runtimeDir, userData, log, nativeImage, textModel: model });
    openai = new OpenAIService({
      runtimeDir,
      // QA may isolate learning state while using the explicitly selected Cosmos auth home.
      userData: process.env.COSMOS_OPENAI_USER_DATA
        ? path.resolve(process.env.COSMOS_OPENAI_USER_DATA)
        : userData,
      log,
      openExternal: (url) => shell.openExternal(url),
      onProgress: (progress) => {
        if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed())
          mainWindow.webContents.send('cosmos:openai-progress', progress);
      },
      prepareImage: (input) => {
        const image = readImageData(input);
        let decoded = nativeImage.createFromBuffer(image.bytes);
        if (decoded.isEmpty()) throw new Error('Не удалось прочитать фотографию.');
        const size = decoded.getSize();
        if (size.width * size.height > 20000000) throw new Error('Фотография слишком большая.');
        if (Math.max(size.width, size.height) > 2048)
          decoded = decoded.resize(size.width >= size.height ? { width: 2048 } : { height: 2048 });
        return decoded.toDataURL();
      },
    });
    references = createReferenceLibrary({
      directory: process.env.COSMOS_REFERENCES_DIR
        ? path.resolve(process.env.COSMOS_REFERENCES_DIR)
        : app.isPackaged
          ? path.join(process.resourcesPath, 'knowledge-sources')
          : path.join(__dirname, '..', 'resources', 'knowledge-sources'),
      BrowserWindow,
      session,
      parent: () => mainWindow,
      log,
    });
    schoolSources = createSchoolSourceLibrary({
      directory: app.isPackaged
        ? path.join(process.resourcesPath, 'school-program')
        : path.join(__dirname, '..', 'resources', 'school-program'),
      BrowserWindow,
      session,
      parent: () => mainWindow,
      log,
    });
    registerBridge();
    await createWindow();
  })
  .catch((error) => {
    log('startup', error.stack || error.message);
    dialog.showErrorBox(
      'EGE Cosmos',
      'Не удалось открыть приложение. Переустановка сохранит учебные данные.',
    );
    app.quit();
  });
app.on('window-all-closed', () => app.quit());
app.on('before-quit', (event) => {
  schoolSources?.close();
  openai?.stop();
  imageReader?.cancel();
  model?.stop();
  if (!quitting) {
    event.preventDefault();
    quitting = true;
    Promise.race([saveQueue, new Promise((resolve) => setTimeout(resolve, 1500))]).finally(() =>
      app.quit(),
    );
  }
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
process.on('uncaughtException', (error) => log('uncaught', error.stack || error.message));
