import { describe, expect, it, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { AppServerTransport } = require('../desktop/openai-protocol.cjs');
const {
  OpenAIService,
  isolatedEnvironment,
  validAuthUrl,
  serverArgs,
} = require('../desktop/openai-service.cjs');
const {
  parseTutorOutput,
  validateTutorRequest,
  OUTPUT_SCHEMA,
} = require('../desktop/openai-tutor.cjs');

const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});
function childFixture(onMessage: (message: any, emit: (m: any) => void) => void = () => {}) {
  const child: any = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.killed = false;
  const messages: any[] = [];
  const emit = (m: any) => child.stdout.write(JSON.stringify(m) + '\n');
  child.stdin = new Writable({
    write(chunk, _encoding, done) {
      for (const line of String(chunk).trim().split('\n')) {
        const message = JSON.parse(line);
        messages.push(message);
        queueMicrotask(() => onMessage(message, emit));
      }
      done();
    },
  });
  child.kill = () => {
    child.killed = true;
    child.emit('exit', 0);
    return true;
  };
  return { child, messages, emit };
}
const request = {
  conversationId: 'lesson-1',
  subject: 'math',
  instructions: 'Подготовка к ЕГЭ, 10 класс.',
  messages: [{ role: 'user', content: 'Почему умножение?' }],
};
const reply = {
  text: 'В каждой строке одинаковое число клеток.',
  title: 'Площадь',
  question: null,
  phase: 'explain',
  summary: null,
  scene: {
    kind: 'geometry',
    title: 'Прямоугольник',
    steps: [
      { caption: 'Одна строка', formula: null, values: [7], labels: ['клетки'] },
      { caption: 'Четыре строки', formula: '7 \\cdot 4', values: [7, 4], labels: null },
    ],
  },
};
async function serviceFixture({
  hangTurn = false,
  loginUrl = 'https://auth.openai.com/authorize?state=TEST',
  failRead = false,
  account = true,
  turnTimeoutMs = 250,
} = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'cosmos-openai-test-'));
  cleanups.push(() => fs.rm(directory, { recursive: true, force: true }));
  const rt = path.join(directory, 'runtime/openai');
  await fs.mkdir(path.join(rt, 'vendor/x86_64-pc-windows-msvc/bin'), { recursive: true });
  await fs.writeFile(path.join(rt, 'vendor/x86_64-pc-windows-msvc/bin/codex.exe'), 'fixture');
  await fs.writeFile(path.join(rt, 'manifest.json'), JSON.stringify({ version: '0.153.4' }));
  let thread = 0;
  const fixture = childFixture((m, emit) => {
    const result = (value: any) => emit({ id: m.id, result: value });
    if (m.method === 'initialize')
      result({ userAgent: 'test', codexHome: path.join(directory, 'profile', 'openai-cosmos') });
    if (m.method === 'config/read')
      result({
        config: {
          model_provider: 'openai',
          cli_auth_credentials_store: 'file',
          features: Object.fromEntries(
            [
              'shell_tool',
              'unified_exec',
              'apps',
              'plugins',
              'browser_use',
              'computer_use',
              'multi_agent',
              'hooks',
            ].map((k) => [k, false]),
          ),
        },
      });
    if (m.method === 'account/read') {
      if (failRead) emit({ id: m.id, error: { code: -32000, message: 'DO-NOT-LEAK-TOKEN' } });
      else
        result({
          account: account
            ? { type: 'chatgpt', email: 'fixture@example.invalid', planType: 'test' }
            : null,
        });
    }
    if (m.method === 'model/list')
      result({
        data: [{ model: 'fixture-model', displayName: 'Fixture only', isDefault: true }],
        nextCursor: null,
      });
    if (m.method === 'account/login/start')
      result({ type: 'chatgpt', loginId: 'login-1', authUrl: loginUrl });
    if (m.method === 'thread/start')
      result({ thread: { id: 'thread-' + ++thread }, model: 'fixture-model' });
    if (m.method === 'turn/start') {
      const id = 'turn-' + thread;
      result({ turn: { id } });
      if (!hangTurn)
        setTimeout(
          () =>
            emit({
              method: 'turn/completed',
              params: {
                threadId: m.params.threadId,
                turn: {
                  id,
                  status: 'completed',
                  items: [
                    {
                      type: 'agentMessage',
                      id: 'answer',
                      phase: 'final_answer',
                      text: JSON.stringify(reply),
                    },
                  ],
                },
              },
            }),
          5,
        );
    }
    if (
      ['account/login/cancel', 'account/logout', 'thread/unsubscribe', 'turn/interrupt'].includes(
        m.method,
      )
    )
      result({});
  });
  const opened: string[] = [];
  const logs: unknown[] = [];
  const progress: any[] = [];
  const svc = new OpenAIService({
    runtimeDir: path.join(directory, 'runtime'),
    userData: path.join(directory, 'profile'),
    spawnProcess: () => fixture.child,
    openExternal: async (url: string) => opened.push(url),
    log: (...args: unknown[]) => logs.push(args),
    onProgress: (value: any) => progress.push({ ...value, observedAt: Date.now() }),
    requestTimeoutMs: 150,
    turnTimeoutMs,
  });
  cleanups.push(() => svc.stop());
  return { svc, ...fixture, opened, logs, directory, progress };
}

describe('official app-server transport boundaries', () => {
  it('matches out-of-order responses and handles a split JSON line', async () => {
    const f = childFixture();
    const rpc = new AppServerTransport(f.child, { timeoutMs: 300 });
    cleanups.push(() => rpc.stop());
    const first = rpc.request('first'),
      second = rpc.request('second');
    f.child.stdout.write('{"id":2,"res');
    f.child.stdout.write('ult":"two"}\n');
    f.emit({ id: 1, result: 'one' });
    expect(await first).toBe('one');
    expect(await second).toBe('two');
    expect(rpc.pending.size).toBe(0);
  });
  it('rejects pending requests on exit and does not reveal raw server errors', async () => {
    const f = childFixture();
    const rpc = new AppServerTransport(f.child);
    cleanups.push(() => rpc.stop());
    const first = rpc.request('read');
    f.emit({ id: 1, error: { code: 1, message: 'secret-token' } });
    await expect(first).rejects.toThrow('OpenAI server rejected request');
    const second = rpc.request('read');
    f.child.kill();
    await expect(second).rejects.toThrow('stopped');
  });
  it('times out and removes pending entries', async () => {
    const f = childFixture();
    const rpc = new AppServerTransport(f.child, { timeoutMs: 10 });
    cleanups.push(() => rpc.stop());
    await expect(rpc.request('read')).rejects.toThrow('timeout');
    expect(rpc.pending.size).toBe(0);
  });
  it('declines file and command approvals and rejects every other server tool', async () => {
    const f = childFixture();
    const rpc = new AppServerTransport(f.child);
    cleanups.push(() => rpc.stop());
    f.emit({
      id: 100,
      method: 'item/commandExecution/requestApproval',
      params: { command: 'rm -rf ~' },
    });
    f.emit({ id: 101, method: 'item/fileChange/requestApproval' });
    f.emit({ id: 102, method: 'item/tool/call', params: { tool: 'evil' } });
    expect(f.messages[0].result.decision).toBe('decline');
    expect(f.messages[1].result.decision).toBe('decline');
    expect(f.messages[2].error.code).toBe(-32601);
  });
});

async function beginProgressFixture(f: any, input: any = request) {
  const pending = f.svc.generate(input);
  for (let count = 0; count < 40 && !f.svc.active?.turnId; count++)
    await new Promise((resolve) => setTimeout(resolve, 2));
  expect(f.svc.active?.turnId).toBeTruthy();
  const { threadId, turnId } = f.svc.active;
  const event = (method: string, extra: any = {}) =>
    f.emit({ method, params: { threadId, turnId, ...extra } });
  const start = (id = 'answer', phase = 'final_answer') =>
    event('item/started', { item: { id, type: 'agentMessage', phase } });
  const delta = (text: string, extra: any = {}) =>
    event('item/agentMessage/delta', { itemId: 'answer', delta: text, ...extra });
  const complete = (text = JSON.stringify(reply)) =>
    event('turn/completed', {
      turn: {
        id: turnId,
        status: 'completed',
        items: [{ id: 'answer', type: 'agentMessage', phase: 'final_answer', text }],
      },
    });
  return { pending, event, start, delta, complete, threadId, turnId };
}

describe('temporary streamed tutor text isolation', () => {
  it('emits only the active final-message text and validates the authoritative complete response', async () => {
    const f = await serviceFixture({ hangTurn: true, turnTimeoutMs: 1000 });
    const run = await beginProgressFixture(f, { ...request, requestId: 'request-one' });
    run.start('commentary', 'commentary');
    run.delta('{"text":"Служебное"}', { itemId: 'commentary' });
    run.event('item/reasoning/textDelta', { delta: 'private reasoning' });
    expect(f.progress).toHaveLength(0);
    run.start();
    run.delta('{"text":"Чужое"}', { threadId: 'foreign-room' });
    run.delta('{"text":"Чужое"}', { turnId: 'foreign-turn' });
    run.delta('{"text":"Чужое"}', { itemId: 'foreign-item' });
    expect(f.progress).toHaveLength(0);
    run.delta('{"title":"not shown","text":"Считаем клетки');
    expect(f.progress).toHaveLength(1);
    expect(f.progress[0]).toMatchObject({
      requestId: 'request-one',
      conversationId: 'lesson-1',
      state: 'writing',
      text: 'Разбираю вопрос и сверяю ответ…',
    });
    expect(f.progress[0]).not.toHaveProperty('scene');
    run.complete();
    const final = await run.pending;
    expect(final.ok).toBe(true);
    expect(final.text).toBe(reply.text);
    expect(final.verification.version).toBe(1);
    expect(final.scene.steps).toHaveLength(2);
    expect(final.firstVisibleTextMs).toBeGreaterThanOrEqual(0);
    expect(final.firstVisibleTextMs).toBeLessThanOrEqual(final.elapsedMs);
    expect(f.svc.active).toBeNull();
  });
  it('throttles bursts to at most ten callbacks per second and drops pending callbacks on cancel', async () => {
    const f = await serviceFixture({ hangTurn: true, turnTimeoutMs: 1000 });
    const run = await beginProgressFixture(f);
    run.start();
    run.delta('{"text":"А');
    for (let i = 0; i < 30; i++) run.delta('б');
    expect(f.progress).toHaveLength(1);
    await new Promise((resolve) => setTimeout(resolve, 125));
    expect(f.progress).toHaveLength(1);
    expect(f.progress[0].text).toBe('Разбираю вопрос и сверяю ответ…');
    run.delta('НЕ ПОКАЗЫВАТЬ ПОСЛЕ ОТМЕНЫ');
    await f.svc.cancel();
    expect((await run.pending).ok).toBe(false);
    run.delta('stale');
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(f.progress).toHaveLength(1);
  });
  it('isolates consecutive retries of the same conversation by request UUID and worker generation', async () => {
    const f = await serviceFixture({ hangTurn: true, turnTimeoutMs: 1000 });
    const old = await beginProgressFixture(f, { ...request, requestId: 'old-request' });
    old.start();
    old.delta('{"text":"Старое');
    old.delta(' pending');
    await f.svc.cancel();
    await old.pending;
    const next = await beginProgressFixture(f, { ...request, requestId: 'new-request' });
    old.delta('stale must not appear');
    old.complete();
    next.start();
    next.delta('{"text":"Новое');
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(f.progress.map((event) => event.requestId)).toEqual(['old-request', 'new-request']);
    expect(f.progress[1].text).toBe('Разбираю вопрос и сверяю ответ…');
    next.complete();
    expect((await next.pending).ok).toBe(true);
  });
  it.each(['{"text":123', '{"text":"bad\\q', '{"text":"' + 'x'.repeat(16001)])(
    'does not publish malformed or oversized envelopes',
    async (raw) => {
      const f = await serviceFixture({ hangTurn: true, turnTimeoutMs: 1000 });
      const run = await beginProgressFixture(f);
      run.start();
      run.delta(raw);
      expect(f.progress).toHaveLength(0);
      run.complete(raw);
      const final = await run.pending;
      expect(final.ok).toBe(false);
      expect(final.text).toBeUndefined();
    },
  );
  it('invalidates a later broken prefix without delivering queued text or treating it as a completed response', async () => {
    const f = await serviceFixture({ hangTurn: true, turnTimeoutMs: 1000 });
    const run = await beginProgressFixture(f);
    run.start();
    run.delta('{"text":"Первая часть');
    run.delta(' ещё текст');
    run.delta('\\q');
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(f.progress).toHaveLength(1);
    expect(f.progress[0].text).toBe('Разбираю вопрос и сверяю ответ…');
    run.complete('{"text":"Первая часть\\q"}');
    expect((await run.pending).ok).toBe(false);
    expect(request.messages).toHaveLength(1);
  });
});
describe('Cosmos managed auth isolation', () => {
  it('strips inherited API keys, Codex auth environment and user home', () => {
    const env = isolatedEnvironment(
      {
        CODEX_HOME: 'private',
        OPENAI_API_KEY: 'secret',
        CODEX_ACCESS_TOKEN: 'secret2',
        USERPROFILE: 'private',
        PATH: 'binary-path',
      },
      'cosmos-home',
    );
    expect(env.CODEX_HOME).toBe('cosmos-home');
    expect(env.USERPROFILE).toBe('cosmos-home');
    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(env.CODEX_ACCESS_TOKEN).toBeUndefined();
    expect(serverArgs()).toContain('features.shell_tool=false');
    expect(serverArgs()).toContain('features.skip_host_skill_discovery=true');
  });
  it('accepts exact official HTTPS auth origins only', () => {
    expect(validAuthUrl('https://auth.openai.com/authorize')).toBe(true);
    for (const url of [
      'file:///secret',
      'http://auth.openai.com/',
      'https://auth.openai.com.evil.test/',
      'https://auth.openai.com@evil.test/',
      'javascript:alert(1)',
    ])
      expect(validAuthUrl(url)).toBe(false);
  });
  it('reads account and runtime model list without logging in or opening browser', async () => {
    const f = await serviceFixture({ account: false });
    const status = await f.svc.getStatus();
    expect(status.authenticated).toBe(false);
    expect(status.state).toBe('signed-out');
    expect(status.models[0].id).toBe('fixture-model');
    expect(f.opened).toEqual([]);
    expect(f.messages.some((m) => m.method === 'account/login/start')).toBe(false);
  });
  it('browser login is explicit and a cancelled attempt never logs out', async () => {
    const f = await serviceFixture({ account: false });
    expect((await f.svc.login()).ok).toBe(true);
    expect(f.opened).toHaveLength(1);
    expect((await f.svc.login()).ok).toBe(false);
    expect(await f.svc.cancelLogin()).toBe(true);
    expect(f.messages.filter((m) => m.method === 'account/login/cancel')).toHaveLength(1);
    expect(f.messages.some((m) => m.method === 'account/logout')).toBe(false);
  });
  it('probe errors preserve already known login state and never disclose server detail', async () => {
    const f = await serviceFixture({ failRead: true });
    f.svc.authenticated = true;
    const status = await f.svc.getStatus();
    expect(status.state).toBe('offline');
    expect(status.authenticated).toBe(true);
    expect(f.messages.some((m) => m.method === 'account/logout')).toBe(false);
    expect(JSON.stringify(status)).not.toContain('DO-NOT-LEAK');
  });
  it('does not open an unexpected server-provided login address', async () => {
    const f = await serviceFixture({ loginUrl: 'https://evil.invalid/' });
    expect((await f.svc.login()).ok).toBe(false);
    expect(f.opened).toHaveLength(0);
  });
});
describe('free tutor requests and completion', () => {
  it('only accepts completion from the active thread and turn', async () => {
    const f = await serviceFixture({ hangTurn: true });
    const promise = f.svc.generate(request);
    for (let count = 0; count < 30 && !f.svc.active?.turnId; count++)
      await new Promise((r) => setTimeout(r, 2));
    const active = f.svc.active;
    const completion = (threadId: string, id: string, text: string) =>
      f.emit({
        method: 'turn/completed',
        params: {
          threadId,
          turn: { id, status: 'completed', items: [{ type: 'agentMessage', id: 'answer', text }] },
        },
      });
    completion('foreign-room', active.turnId, 'чужой ответ');
    completion(active.threadId, 'foreign-turn', 'другой ответ');
    expect(f.svc.busy).toBe(true);
    completion(active.threadId, active.turnId, JSON.stringify(reply));
    const response = await promise;
    expect(response.text).toBe(reply.text);
  });
  it('explicit cancel sends an interrupt for its own IDs and releases the next send', async () => {
    const f = await serviceFixture({ hangTurn: true });
    const promise = f.svc.generate(request);
    for (let count = 0; count < 30 && !f.svc.active?.turnId; count++)
      await new Promise((r) => setTimeout(r, 2));
    const owned = { threadId: f.svc.active.threadId, turnId: f.svc.active.turnId };
    expect(await f.svc.cancel()).toBe(true);
    const response = await promise;
    expect(response.ok).toBe(false);
    expect(response.error).toBe('Ответ остановлен.');
    expect(f.messages.find((m) => m.method === 'turn/interrupt').params).toEqual(owned);
    expect(f.svc.busy).toBe(false);
    expect(f.svc.authenticated).toBe(true);
  });
  it('a model selection must come from the server catalog and is persisted outside credentials', async () => {
    const f = await serviceFixture();
    await f.svc.getStatus();
    expect((await f.svc.selectModel('invented-model')).ok).toBe(false);
    expect((await f.svc.selectModel('fixture-model')).ok).toBe(true);
    const preferences = JSON.parse(
      await fs.readFile(path.join(f.svc.home, 'cosmos-preferences.json'), 'utf8'),
    );
    expect(preferences).toEqual({ model: 'fixture-model' });
    expect(f.messages.some((m) => /config\/.*write/.test(m.method))).toBe(false);
  });
  it('shutdown terminates only its child and does not invoke logout', async () => {
    const f = await serviceFixture();
    await f.svc.getStatus();
    f.svc.stop();
    expect(f.child.killed).toBe(true);
    expect(f.messages.some((m) => m.method === 'account/logout')).toBe(false);
  });
  it('supports two consecutive completed turns with isolated full histories and disabled environments', async () => {
    const f = await serviceFixture();
    const a = await f.svc.generate(request);
    const b = await f.svc.generate({
      ...request,
      subject: 'history',
      conversationId: 'different',
      messages: [{ role: 'user', content: 'Почему реформа?' }],
    });
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(f.svc.busy).toBe(false);
    const starts = f.messages.filter((m) => m.method === 'thread/start');
    expect(starts).toHaveLength(2);
    expect(
      starts.every(
        (m) =>
          m.params.ephemeral &&
          m.params.environments.length === 0 &&
          m.params.dynamicTools.length === 0,
      ),
    ).toBe(true);
    const turns = f.messages.filter((m) => m.method === 'turn/start');
    expect(turns[0].params.threadId).not.toBe(turns[1].params.threadId);
    expect(turns[1].params.input[0].text).not.toContain('умножение');
    expect(turns[1].params.outputSchema).toEqual(OUTPUT_SCHEMA);
  });
  it('missing login honestly refuses model generation', async () => {
    const f = await serviceFixture({ account: false });
    const response = await f.svc.generate(request);
    expect(response.ok).toBe(false);
    expect(response.text).toBeUndefined();
    expect(f.messages.some((m) => m.method === 'turn/start')).toBe(false);
  });
  it('keeps school class and subject independent from an EGE turn without enabling tools', async () => {
    const f = await serviceFixture();
    const school = await f.svc.generate({
      ...request,
      mode: 'school',
      grade: 8,
      subject: 'physics',
      conversationId: 'school-physics-8',
      instructions: 'Тепловые явления, школьная программа.',
      messages: [{ role: 'user', content: 'Что значит внутренняя энергия?' }],
    });
    const ege = await f.svc.generate(request);
    expect(school.ok && ege.ok).toBe(true);
    const starts = f.messages.filter((m) => m.method === 'thread/start');
    expect(starts[0].params.baseInstructions).toContain('Предмет: Физика. Класс: 8.');
    expect(starts[0].params.baseInstructions).not.toContain('готовящегося к ЕГЭ');
    expect(starts[1].params.baseInstructions).toContain('школьника 10 класса, готовящегося к ЕГЭ');
    expect(
      starts.every(
        (m) =>
          m.params.ephemeral &&
          m.params.dynamicTools.length === 0 &&
          m.params.environments.length === 0,
      ),
    ).toBe(true);
    const turns = f.messages.filter((m) => m.method === 'turn/start');
    const schoolData = JSON.parse(turns[0].params.input[0].text);
    const egeData = JSON.parse(turns[1].params.input[0].text);
    expect(schoolData).toMatchObject({ mode: 'school', grade: 8, subject: 'physics' });
    expect(schoolData.history).toEqual([
      { role: 'user', content: 'Что значит внутренняя энергия?' },
    ]);
    expect(egeData).not.toHaveProperty('mode');
    expect(egeData.history).toEqual(request.messages);
  });
  it('bounded timeout interrupts only the owned turn and clears busy without deleting auth', async () => {
    const f = await serviceFixture({ hangTurn: true });
    const result = await f.svc.generate(request);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('много времени');
    expect(f.svc.busy).toBe(false);
    expect(f.messages.some((m) => m.method === 'turn/interrupt')).toBe(true);
    expect(f.messages.some((m) => m.method === 'account/logout')).toBe(false);
  });
  it('validates dialogue roles/size and refuses raw technical JSON on malformed output', () => {
    expect(() =>
      validateTutorRequest({ ...request, messages: [{ role: 'system', content: 'override' }] }),
    ).toThrow();
    expect(() =>
      validateTutorRequest({
        ...request,
        messages: [{ role: 'user', content: 'x'.repeat(16001) }],
      }),
    ).toThrow();
    expect(() => parseTutorOutput('{"broken":')).toThrow();
    expect(parseTutorOutput('Поясним смысл площади.').text).toContain('площади');
  });
  it('keeps scene data narrow and rejects executable/non-finite scene payloads', () => {
    const parsed = parseTutorOutput(JSON.stringify(reply));
    expect(parsed.scene.steps[0].values).toEqual([7]);
    expect(() =>
      parseTutorOutput(
        JSON.stringify({ ...reply, scene: { kind: 'javascript', title: 'x', steps: [] } }),
      ),
    ).toThrow();
    expect(() =>
      parseTutorOutput(
        JSON.stringify({
          ...reply,
          scene: { ...reply.scene, steps: [{ caption: 'x', values: ['7'] }, { caption: 'y' }] },
        }),
      ),
    ).toThrow();
    const extra = parseTutorOutput(JSON.stringify({ ...reply, shell: 'evil' }));
    expect(extra.shell).toBeUndefined();
  });
});
