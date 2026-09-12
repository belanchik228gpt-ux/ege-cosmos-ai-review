const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createHash, randomUUID } = require('node:crypto');
const { extractPartialTutorText } = require('./openai-progress.cjs');
const { reviewAnswer, reviewContext } = require('./fast-answer-review.cjs');
const { AppServerTransport } = require('./openai-protocol.cjs');
const {
  tutorBaseInstructions,
  OUTPUT_SCHEMA,
  validateTutorRequest,
  parseTutorOutput,
} = require('./openai-tutor.cjs');

const DISABLED_FEATURES = [
  'shell_tool',
  'unified_exec',
  'shell_snapshot',
  'apps',
  'plugins',
  'remote_plugin',
  'multi_agent',
  'multi_agent_v2',
  'goals',
  'memories',
  'hooks',
  'browser_use',
  'browser_use_external',
  'computer_use',
  'code_mode',
  'code_mode_host',
  'image_generation',
  'view_image',
  'workspace_dependencies',
  'skill_search',
  'skill_mcp_dependency_install',
  'skip_host_skill_discovery',
  'tool_suggest',
  'sleep_tool',
  'in_app_local_automation',
  'unbounded_connection_retries',
];
// skip_host_skill_discovery is deliberately enabled; every other listed feature
// is disabled. These exact names were enumerated by pinned codex 0.153.4.
const CONFIG = {
  model_provider: 'openai',
  cli_auth_credentials_store: 'file',
  approval_policy: 'on-request',
  sandbox_mode: 'read-only',
  web_search: 'disabled',
  check_for_update_on_startup: false,
  project_doc_max_bytes: 0,
  include_environment_context: false,
  include_apps_instructions: false,
  include_collaboration_mode_instructions: false,
  'analytics.enabled': false,
  'feedback.enabled': false,
  'apps._default.enabled': false,
  'features.code_mode.enabled': false,
};
function serverArgs() {
  const values = { ...CONFIG };
  for (const feature of DISABLED_FEATURES)
    if (feature !== 'code_mode')
      values[`features.${feature}`] = feature === 'skip_host_skill_discovery';
  return [
    'app-server',
    '--listen',
    'stdio://',
    ...Object.entries(values).flatMap(([key, value]) => ['-c', `${key}=${JSON.stringify(value)}`]),
  ];
}
function isolatedEnvironment(base, home) {
  const env = {};
  for (const key of [
    'SystemRoot',
    'SYSTEMROOT',
    'WINDIR',
    'windir',
    'PATH',
    'Path',
    'PATHEXT',
    'COMSPEC',
    'ComSpec',
    'OS',
    'PROCESSOR_ARCHITECTURE',
    'NUMBER_OF_PROCESSORS',
    'HTTPS_PROXY',
    'HTTP_PROXY',
    'NO_PROXY',
  ])
    if (base[key]) env[key] = base[key];
  Object.assign(env, {
    CODEX_HOME: home,
    HOME: home,
    USERPROFILE: home,
    APPDATA: path.join(home, 'appdata'),
    LOCALAPPDATA: path.join(home, 'local'),
    TEMP: path.join(home, 'tmp'),
    TMP: path.join(home, 'tmp'),
  });
  return env;
}
function validAuthUrl(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      ['auth.openai.com', 'chatgpt.com'].includes(url.hostname) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}
function publicError(error) {
  if (error?.userMessage) return error.userMessage;
  if (/timeout/i.test(error?.message || ''))
    return 'Ответ занял слишком много времени. Попробуй отправить вопрос ещё раз.';
  if (/cancel/i.test(error?.message || '')) return 'Ответ остановлен.';
  return 'Сейчас не удалось связаться с OpenAI. Сохранённый вход остаётся на этом компьютере; попробуй ещё раз.';
}
function userError(message) {
  const error = new Error(message);
  error.userMessage = message;
  return error;
}

class OpenAIService {
  constructor({
    runtimeDir,
    userData,
    log = () => {},
    openExternal,
    prepareImage,
    onProgress = () => {},
    spawnProcess = spawn,
    requestTimeoutMs = 15000,
    turnTimeoutMs = 100000,
  }) {
    this.runtimeDir = path.join(runtimeDir, 'openai');
    this.home = path.join(userData, 'openai-cosmos');
    this.workspace = path.join(this.home, 'empty-workspace');
    this.executable = path.join(
      this.runtimeDir,
      'vendor',
      'x86_64-pc-windows-msvc',
      'bin',
      'codex.exe',
    );
    this.log = log;
    this.openExternal = openExternal;
    this.prepareImage = prepareImage;
    this.onProgress = onProgress;
    this.spawnProcess = spawnProcess;
    this.requestTimeoutMs = requestTimeoutMs;
    this.turnTimeoutMs = turnTimeoutMs;
    this.transport = null;
    this.starting = null;
    this.statusPromise = null;
    this.account = undefined;
    this.authenticated = null;
    this.models = [];
    this.selectedModel = undefined;
    this.state = 'unavailable';
    this.available = false;
    this.busy = false;
    this.loginPending = null;
    this.active = null;
    this.lastProbe = 0;
    this.lastModelRead = 0;
    this.loadedPreferences = false;
    this.generation = 0;
  }
  snapshot() {
    return {
      available: this.available,
      runtimeAvailable: this.available,
      authenticated: this.authenticated,
      state: this.state,
      busy: this.busy,
      ...(this.account ? { account: this.account } : {}),
      models: this.models.map(({ id, displayName, isDefault }) => ({ id, displayName, isDefault })),
      ...(this.selectedModel ? { selectedModel: this.selectedModel } : {}),
      ...(this.detail ? { detail: this.detail } : {}),
      ...(this.version ? { runtimeVersion: this.version } : {}),
    };
  }
  async ensureStarted() {
    if (this.transport && !this.transport.closed) return this.transport;
    if (this.starting) return this.starting;
    this.starting = (async () => {
      const generation = this.generation;
      try {
        await fs.access(this.executable);
        const manifest = JSON.parse(
          await fs.readFile(path.join(this.runtimeDir, 'manifest.json'), 'utf8'),
        );
        if (manifest.version !== '0.153.4') throw new Error('Unsupported runtime version');
        this.version = manifest.version;
        this.available = true;
        this.state = 'connecting';
        for (const dir of [
          this.home,
          this.workspace,
          path.join(this.home, 'tmp'),
          path.join(this.home, 'appdata'),
          path.join(this.home, 'local'),
        ])
          await fs.mkdir(dir, { recursive: true });
        // This home belongs exclusively to Cosmos. We never read auth.json, copy
        // credentials, inspect the user's ~/.codex, or inherit its configuration.
        if (!this.loadedPreferences) {
          this.loadedPreferences = true;
          try {
            const p = JSON.parse(
              await fs.readFile(path.join(this.home, 'cosmos-preferences.json'), 'utf8'),
            );
            if (typeof p.model === 'string' && p.model.length <= 120) this.selectedModel = p.model;
          } catch {}
        }
        if (generation !== this.generation) throw new Error('OpenAI startup canceled');
        const child = this.spawnProcess(this.executable, serverArgs(), {
          cwd: this.workspace,
          env: isolatedEnvironment(process.env, this.home),
          windowsHide: true,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        const rpc = new AppServerTransport(child, {
          timeoutMs: this.requestTimeoutMs,
          maxLineBytes: 20 * 1024 * 1024,
        });
        this.transport = rpc;
        rpc.on('notification', (method, params) => this.notification(method, params));
        rpc.on('blockedRequest', (method) => {
          this.log('openai-tool-blocked', String(method).slice(0, 100));
          this.failActive(
            userError(
              'Преподаватель запросил недоступное действие. Переформулируй учебный вопрос.',
            ),
          );
          this.cancel().catch(() => {});
        });
        rpc.on('closed', (error) => {
          if (this.transport === rpc) {
            this.transport = null;
            if (this.state !== 'signed-out') this.state = 'offline';
            this.failActive(error);
          }
        });
        const initialized = await rpc.request('initialize', {
          clientInfo: { name: 'ege_cosmos', title: 'EGE Cosmos', version: '0.5.0' },
          capabilities: {
            experimentalApi: true,
            optOutNotificationMethods: [
              'item/reasoning/textDelta',
              'item/reasoning/summaryTextDelta',
            ],
          },
        });
        if (
          typeof initialized?.codexHome !== 'string' ||
          path.resolve(initialized.codexHome).toLowerCase() !==
            path.resolve(this.home).toLowerCase()
        )
          throw new Error('OpenAI home isolation not confirmed');
        rpc.notify('initialized');
        // Check effective values rather than assuming command-line flags won a
        // conflict with machine-managed requirements. Fail closed if changed.
        const effective = await rpc.request('config/read', { includeLayers: false });
        const config = effective?.config;
        if (
          !config ||
          config.model_provider !== 'openai' ||
          config.cli_auth_credentials_store !== 'file'
        )
          throw new Error('OpenAI configuration isolation not confirmed');
        for (const name of [
          'shell_tool',
          'unified_exec',
          'apps',
          'plugins',
          'browser_use',
          'computer_use',
          'multi_agent',
          'hooks',
        ])
          if (config.features?.[name] !== false)
            throw new Error('OpenAI tool restrictions not confirmed');
        if (Object.keys(config.mcp_servers || {}).length)
          throw new Error('Unexpected MCP configuration');
        this.log(
          'openai-runtime',
          `Started official Codex ${this.version}; isolated home; environment access disabled`,
        );
        return rpc;
      } catch (error) {
        this.transport?.stop();
        this.transport = null;
        this.state = this.available ? 'offline' : 'unavailable';
        this.detail = this.available
          ? 'Не удалось запустить связь с OpenAI.'
          : 'Модуль входа OpenAI отсутствует в этой сборке.';
        this.log('openai-start', error.code || String(error.message).slice(0, 200));
        throw error;
      }
    })().finally(() => {
      this.starting = null;
    });
    return this.starting;
  }
  async readAccount(rpc) {
    const response = await rpc.request('account/read', { refreshToken: false });
    // Account/read alone reports auth, not model availability or remaining quota.
    this.authenticated = response?.account?.type === 'chatgpt';
    if (this.authenticated)
      this.account = {
        ...(typeof response.account.email === 'string'
          ? { email: response.account.email.slice(0, 320) }
          : {}),
        ...(typeof response.account.planType === 'string'
          ? { planType: response.account.planType.slice(0, 80) }
          : {}),
      };
    else this.account = undefined;
    this.state = this.loginPending ? 'signing-in' : this.authenticated ? 'ready' : 'signed-out';
    this.detail = undefined;
  }
  async readModels(rpc) {
    const models = [];
    let cursor;
    for (let page = 0; page < 4; page++) {
      const response = await rpc.request('model/list', {
        limit: 50,
        includeHidden: false,
        ...(cursor ? { cursor } : {}),
      });
      for (const model of response?.data || [])
        if (typeof model.model === 'string' && model.model.length <= 120 && !model.hidden)
          models.push({
            id: model.model,
            displayName: String(model.displayName || model.model).slice(0, 120),
            isDefault: model.isDefault === true,
            effort: model.defaultReasoningEffort,
          });
      cursor = response?.nextCursor;
      if (!cursor) break;
    }
    this.models = models;
    this.lastModelRead = Date.now();
    if (!this.selectedModel || !models.some((m) => m.id === this.selectedModel))
      this.selectedModel = (models.find((m) => m.isDefault) || models[0])?.id;
  }
  async getStatus() {
    if (this.statusPromise) return this.statusPromise;
    if (Date.now() - this.lastProbe < 2500 && this.transport && !this.transport.closed)
      return this.snapshot();
    this.statusPromise = (async () => {
      try {
        const rpc = await this.ensureStarted();
        await this.readAccount(rpc);
        if (!this.models.length || Date.now() - this.lastModelRead > 60000)
          await this.readModels(rpc);
      } catch {
        if (this.available) {
          this.state = this.loginPending ? 'signing-in' : 'offline';
          this.detail = 'Связь временно недоступна. Сохранённый вход не удалён.';
        }
      }
      this.lastProbe = Date.now();
      return this.snapshot();
    })().finally(() => {
      this.statusPromise = null;
    });
    return this.statusPromise;
  }
  async login() {
    if (this.loginPending || this.loginStarting)
      return { ok: false, error: 'Вход уже открыт. Заверши его в браузере или отмени.' };
    if (this.busy) return { ok: false, error: 'Сначала останови текущий ответ.' };
    this.loginStarting = true;
    try {
      const rpc = await this.ensureStarted();
      const response = await rpc.request('account/login/start', {
        type: 'chatgpt',
        useHostedLoginSuccessPage: true,
        appBrand: 'chatgpt',
      });
      if (
        response?.type !== 'chatgpt' ||
        typeof response.loginId !== 'string' ||
        response.loginId.length > 200 ||
        typeof response.authUrl !== 'string' ||
        response.authUrl.length > 12000 ||
        !validAuthUrl(response.authUrl)
      )
        throw new Error('Invalid official login response');
      this.loginPending = { id: response.loginId, url: response.authUrl };
      this.state = 'signing-in';
      this.loginTimer = setTimeout(() => this.cancelLogin(), 10 * 60 * 1000);
      this.loginTimer.unref?.();
      await this.openExternal(response.authUrl);
      return { ok: true, loginId: response.loginId, authUrl: response.authUrl };
    } catch (error) {
      return { ok: false, error: publicError(error) };
    } finally {
      this.loginStarting = false;
    }
  }
  async cancelLogin() {
    const pending = this.loginPending;
    if (!pending) return false;
    this.loginPending = null;
    clearTimeout(this.loginTimer);
    try {
      if (this.transport)
        await this.transport.request('account/login/cancel', { loginId: pending.id }, 5000);
    } catch {
      this.transport?.stop();
    }
    this.state = this.authenticated ? 'ready' : 'signed-out';
    return true;
  }
  async logout() {
    if (this.busy) return { ok: false, error: 'Сначала останови текущий ответ.' };
    try {
      await this.cancelLogin();
      const rpc = await this.ensureStarted();
      await rpc.request('account/logout');
      this.authenticated = false;
      this.account = undefined;
      this.state = 'signed-out';
      this.detail = undefined;
      this.models = [];
      this.lastProbe = 0;
      return { ok: true };
    } catch (error) {
      return { ok: false, error: publicError(error) };
    }
  }
  async selectModel(id) {
    if (this.busy) return { ok: false, error: 'Модель можно изменить после завершения ответа.' };
    if (typeof id !== 'string' || !this.models.some((m) => m.id === id))
      return { ok: false, error: 'Выбери модель из списка OpenAI.' };
    this.selectedModel = id;
    try {
      await fs.writeFile(
        path.join(this.home, 'cosmos-preferences.json'),
        JSON.stringify({ model: id }),
      );
      return { ok: true };
    } catch {
      return { ok: false, error: 'Не удалось сохранить выбор модели.' };
    }
  }
  notification(method, params) {
    if (method === 'account/login/completed' && this.loginPending?.id === params.loginId) {
      this.loginPending = null;
      clearTimeout(this.loginTimer);
      this.lastProbe = 0;
      if (params.success) {
        this.lastModelRead = 0;
        this.getStatus().catch(() => {});
      } else {
        this.state = this.authenticated ? 'ready' : 'signed-out';
        this.detail = 'Вход не завершён. Можно повторить.';
      }
    } else if (method === 'account/updated') {
      this.lastProbe = 0;
      this.lastModelRead = 0;
    }
    const active = this.active;
    if (!active || params.threadId !== active.threadId) return;
    if (active.settled || active.generation !== this.generation) return;
    if (params.turnId && active.turnId && params.turnId !== active.turnId) return;
    if (
      method === 'item/started' &&
      params.item?.type === 'agentMessage' &&
      params.item.phase !== 'commentary' &&
      typeof params.item.id === 'string' &&
      params.item.id.length > 0 &&
      params.item.id.length <= 200 &&
      !active.progressItemId
    )
      active.progressItemId = params.item.id;
    if (method === 'item/agentMessage/delta') {
      if (
        typeof params.turnId !== 'string' ||
        !params.turnId ||
        !active.progressItemId ||
        params.itemId !== active.progressItemId ||
        typeof params.delta !== 'string'
      )
        return;
      active.turnId ||= params.turnId;
      if (active.progressInvalid) return;
      active.progressRaw += params.delta;
      const extracted = extractPartialTutorText(active.progressRaw);
      if (!extracted.valid) {
        active.progressInvalid = true;
        active.progressRaw = '';
        clearTimeout(active.progressTimer);
        return;
      }
      // Hold candidate content until the mandatory final review. Never leak a
      // wrong equation through streaming before suppressing it at completion.
      if (extracted.text.trim()) this.queueProgress(active, 'Разбираю вопрос и сверяю ответ…');
      return;
    }
    if (
      method === 'item/started' &&
      [
        'commandExecution',
        'fileChange',
        'mcpToolCall',
        'dynamicToolCall',
        'collabToolCall',
        'imageView',
      ].includes(params.item?.type)
    ) {
      this.log('openai-tool-blocked', params.item.type);
      this.failActive(
        userError('В этом занятии доступны только учебные ответы и сцены. Повтори вопрос.'),
      );
      this.cancel().catch(() => {});
      return;
    }
    if (
      method === 'item/completed' &&
      params.item?.type === 'agentMessage' &&
      params.item.phase !== 'commentary'
    )
      active.messages.set(params.item.id, params.item.text);
    if (method === 'turn/completed') {
      if (active.turnId && params.turn?.id !== active.turnId) return;
      active.turnId ||= params.turn?.id;
      active.settled = true;
      clearTimeout(active.progressTimer);
      for (const item of params.turn?.items || [])
        if (item.type === 'agentMessage' && item.phase !== 'commentary')
          active.messages.set(item.id, item.text);
      if (params.turn?.status === 'completed')
        active.resolve([...active.messages.values()].join('\n'));
      else {
        const code = params.turn?.error?.codexErrorInfo;
        this.log(
          'openai-turn',
          typeof code === 'string' ? code.slice(0, 120) : 'turn-not-completed',
        );
        active.reject(
          params.turn?.status === 'interrupted'
            ? new Error('OpenAI canceled')
            : new Error('OpenAI turn failed'),
        );
      }
    }
  }
  queueProgress(active, text) {
    if (text === active.visibleText) return;
    active.pendingText = text;
    const emit = () => {
      active.progressTimer = undefined;
      if (
        this.active !== active ||
        active.settled ||
        active.progressInvalid ||
        active.generation !== this.generation
      )
        return;
      const now = Date.now();
      const remaining = 100 - (now - active.lastProgressAt);
      if (remaining > 0) {
        active.progressTimer = setTimeout(emit, remaining);
        return;
      }
      active.lastProgressAt = now;
      active.visibleText = active.pendingText;
      try {
        this.onProgress({
          requestId: active.requestId,
          conversationId: active.conversationId,
          state: 'writing',
          text: active.visibleText,
          elapsedMs: now - active.started,
        });
      } catch {
        /* A closed renderer cannot invalidate an otherwise valid model reply. */
      }
    };
    if (active.progressTimer) return;
    const delay = Math.max(0, 100 - (Date.now() - active.lastProgressAt));
    if (delay) active.progressTimer = setTimeout(emit, delay);
    else emit();
  }
  failActive(error) {
    if (this.active) {
      this.active.settled = true;
      clearTimeout(this.active.progressTimer);
    }
    this.active?.reject(error);
  }
  async cancel() {
    if (!this.busy) return false;
    const active = this.active;
    this.generation++;
    if (active?.threadId && active?.turnId && this.transport) {
      try {
        await this.transport.request(
          'turn/interrupt',
          { threadId: active.threadId, turnId: active.turnId },
          5000,
        );
      } catch {
        this.transport?.stop();
      }
    } else this.transport?.stop();
    this.failActive(new Error('OpenAI canceled'));
    return true;
  }
  async generate(input) {
    if (this.busy)
      return { ok: false, error: 'Преподаватель уже отвечает. Дождись ответа или останови его.' };
    let request;
    try {
      request = validateTutorRequest(input);
    } catch (error) {
      return { ok: false, error: error.message };
    }
    this.busy = true;
    const started = Date.now();
    const generation = this.generation;
    let threadId, timer, activeRequest;
    try {
      const rpc = await this.ensureStarted();
      if (this.authenticated !== true) await this.readAccount(rpc);
      if (!this.authenticated) throw userError('Войди через ChatGPT в настройках преподавателя.');
      const selected = request.model || this.selectedModel;
      if (request.model && this.models.length && !this.models.some((m) => m.id === request.model))
        throw userError('Эта модель отсутствует в списке OpenAI. Обнови список.');
      if (generation !== this.generation) throw new Error('OpenAI canceled');
      // A fresh ephemeral server thread receives exactly one room's persisted UI
      // history. Retry/restart cannot silently reuse another room or duplicate a
      // hidden previous user turn. Auth persistence is independent of threads.
      const thread = await rpc.request('thread/start', {
        ...(selected ? { model: selected } : {}),
        modelProvider: 'openai',
        cwd: this.workspace,
        approvalPolicy: 'on-request',
        approvalsReviewer: 'user',
        sandbox: 'read-only',
        baseInstructions: tutorBaseInstructions(request) + reviewContext(request),
        developerInstructions: request.instructions,
        ephemeral: true,
        environments: [],
        dynamicTools: [],
        selectedCapabilityRoots: [],
      });
      threadId = thread?.thread?.id;
      if (typeof threadId !== 'string' || !threadId) throw new Error('Missing OpenAI thread');
      if (generation !== this.generation) throw new Error('OpenAI canceled');
      const inputItems = [
        {
          type: 'text',
          text: JSON.stringify({
            subject: request.subject,
            history: request.messages,
            ...(request.mode === 'school' ? { mode: 'school', grade: request.grade } : {}),
          }),
          text_elements: [],
        },
      ];
      if (request.image) {
        if (!this.prepareImage) throw userError('Прикрепление фото недоступно в этой сборке.');
        inputItems.push({
          type: 'image',
          url: await this.prepareImage(request.image),
          detail: 'original',
        });
      }
      const completed = new Promise((resolve, reject) => {
        activeRequest = this.active = {
          threadId,
          turnId: null,
          resolve,
          reject,
          messages: new Map(),
          requestId: request.requestId || randomUUID(),
          conversationId: request.conversationId,
          started,
          generation,
          settled: false,
          progressRaw: '',
          progressInvalid: false,
          progressItemId: null,
          lastProgressAt: 0,
          pendingText: '',
          visibleText: '',
        };
      });
      // Attach rejection handler before turn/start can emit a completion or exit.
      completed.catch(() => {});
      timer = setTimeout(
        () => {
          this.failActive(new Error('OpenAI tutor timeout'));
          this.cancel().catch(() => {});
        },
        Math.max(1, this.turnTimeoutMs - (Date.now() - started)),
      );
      const turn = await rpc.request('turn/start', {
        threadId,
        input: inputItems,
        environments: [],
        approvalPolicy: 'on-request',
        sandboxPolicy: { type: 'readOnly', networkAccess: false },
        ...(selected ? { model: selected } : {}),
        outputSchema: OUTPUT_SCHEMA,
      });
      if (!turn?.turn?.id) throw new Error('Missing OpenAI turn');
      if (this.active?.turnId && this.active.turnId !== turn.turn.id)
        throw new Error('Mismatched OpenAI turn');
      if (this.active) this.active.turnId = turn.turn.id;
      const raw = await completed;
      const result = reviewAnswer(parseTutorOutput(raw), request);
      activeRequest.firstVisibleTextMs = Date.now() - started;
      this.state = 'ready';
      this.detail = undefined;
      this.log(
        'openai-tutor',
        `completed; room=${createHash('sha256')
          .update(request.subject + ':' + request.conversationId)
          .digest('hex')
          .slice(
            0,
            12,
          )}; elapsedMs=${Date.now() - started}; firstVisibleTextMs=${activeRequest?.firstVisibleTextMs ?? 'none'}; chars=${result.text.length}`,
      );
      return {
        ok: true,
        ...result,
        model: selected || thread.model,
        elapsedMs: Date.now() - started,
        ...(activeRequest?.firstVisibleTextMs !== undefined
          ? { firstVisibleTextMs: activeRequest.firstVisibleTextMs }
          : {}),
      };
    } catch (error) {
      this.log(
        'openai-tutor',
        /timeout/i.test(error.message)
          ? 'request-timeout'
          : error.userMessage
            ? 'not-ready'
            : 'request-failed',
      );
      return { ok: false, error: publicError(error), elapsedMs: Date.now() - started };
    } finally {
      clearTimeout(timer);
      clearTimeout(activeRequest?.progressTimer);
      if (activeRequest) activeRequest.settled = true;
      this.active = null;
      this.busy = false;
      if (threadId && this.transport && !this.transport.closed)
        this.transport.request('thread/unsubscribe', { threadId }, 3000).catch(() => {});
    }
  }
  stop() {
    this.generation++;
    clearTimeout(this.loginTimer);
    this.loginPending = null;
    this.transport?.stop();
    this.transport = null;
  }
}
module.exports = { OpenAIService, serverArgs, isolatedEnvironment, validAuthUrl };
