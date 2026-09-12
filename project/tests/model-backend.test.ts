import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
const { LocalModel, backendModes } = createRequire(import.meta.url)('../desktop/local-model.cjs');
const parent = path.resolve('test-results'),
  created: string[] = [];
async function fixture() {
  await fs.mkdir(parent, { recursive: true });
  const directory = await fs.mkdtemp(path.join(parent, 'model-backend-'));
  created.push(directory);
  const userData = path.join(directory, 'profile'),
    runtimeDir = path.join(directory, 'runtime');
  await Promise.all(
    [userData, 'models', 'llama', 'llama-cpu'].map((name) =>
      fs.mkdir(name === userData ? userData : path.join(runtimeDir, name), { recursive: true }),
    ),
  );
  await fs.writeFile(
    path.join(runtimeDir, 'models/Qwen3-8B-Q4_K_M.gguf'),
    'GGUFfake model fixture',
  );
  await fs.writeFile(
    path.join(runtimeDir, 'llama/llama-server.exe'),
    'not executable - never launched',
  );
  await fs.writeFile(
    path.join(runtimeDir, 'llama-cpu/llama-server.exe'),
    'not executable - never launched',
  );
  const model = new LocalModel({ runtimeDir, userData, log: () => {} });
  // Every fixture forbids the real process launcher; individual tests replace
  // this mock to inspect mode ordering without starting a model or any process.
  vi.spyOn(model, 'launch').mockRejectedValue(new Error('Real launch forbidden in this unit test'));
  return { model, userData, runtimeDir };
}
afterEach(async () => {
  vi.restoreAllMocks();
  for (const directory of created.splice(0)) {
    const relative = path.relative(parent, path.resolve(directory));
    if (relative && !relative.startsWith('..') && !path.isAbsolute(relative))
      await fs.rm(directory, { recursive: true, force: true });
  }
});

describe('local model backend choice without launching inference', () => {
  it('defaults to auto and exposes the selected startup sequence', async () => {
    const { model, userData } = await fixture();
    expect((await model.status()).backend).toBe('auto');
    expect(backendModes('auto')).toEqual(['gpu', 'cpu']);
    expect(backendModes('gpu')).toEqual(['gpu']);
    expect(backendModes('cpu')).toEqual(['cpu']);
    await fs.writeFile(path.join(userData, 'model.json'), 'null');
    expect((await model.status()).backend).toBe('auto');
  });

  it('persists backend while leaving the default installed model path relocatable', async () => {
    const { model, userData } = await fixture();
    const result = await model.updateBackend('cpu');
    expect(result).toMatchObject({ ok: true, backend: 'cpu', busy: false });
    expect(JSON.parse(await fs.readFile(path.join(userData, 'model.json'), 'utf8'))).toEqual({
      backend: 'cpu',
    });
    expect((await model.status()).mode).toBeUndefined();
  });

  it('preserves backend during model selection and preserves an explicit model path during backend selection', async () => {
    const { model, userData } = await fixture();
    const custom = path.join(userData, 'custom.gguf');
    await fs.writeFile(custom, 'GGUF selected fixture');
    await model.updateBackend('cpu');
    expect((await model.selectModel(custom)).ok).toBe(true);
    expect(JSON.parse(await fs.readFile(path.join(userData, 'model.json'), 'utf8'))).toEqual({
      backend: 'cpu',
      modelPath: custom,
    });
    await model.updateBackend('gpu');
    expect(JSON.parse(await fs.readFile(path.join(userData, 'model.json'), 'utf8'))).toEqual({
      backend: 'gpu',
      modelPath: custom,
    });
  });

  it('rejects invalid, busy, starting and concurrent configuration changes without stopping a running answer', async () => {
    const { model, userData } = await fixture();
    const kill = vi.fn();
    model.child = { kill };
    expect((await model.updateBackend('unknown')).ok).toBe(false);
    for (const blocked of ['busy', 'starting', 'configUpdating']) {
      model[blocked] = true;
      expect((await model.updateBackend('cpu')).ok).toBe(false);
      expect((await model.selectModel('unused.gguf')).ok).toBe(false);
      model[blocked] = false;
    }
    expect(kill).not.toHaveBeenCalled();
    expect(await fs.stat(path.join(userData, 'model.json')).catch(() => null)).toBeNull();
    const first = model.updateBackend('cpu'),
      second = model.updateBackend('gpu');
    expect((await second).ok).toBe(false);
    expect((await first).ok).toBe(true);
    expect((await model.status()).backend).toBe('cpu');
  });

  it('stops only the owned idle child and clears stale execution/time status when the mode changes', async () => {
    const { model } = await fixture();
    const kill = vi.fn();
    model.child = { kill };
    model.url = 'http://127.0.0.1:1';
    model.lastElapsedMs = 1234;
    expect((await model.status()).mode).toBe('gpu');
    await model.updateBackend('cpu');
    expect(kill).toHaveBeenCalledTimes(1);
    expect(model.child).toBeNull();
    expect(model.url).toBeNull();
    expect((await model.status()).lastElapsedMs).toBeUndefined();
    await model.updateBackend('cpu');
    expect(kill).toHaveBeenCalledTimes(1);
  });

  it('auto tries CPU only after GPU startup failure while explicit modes stay explicit', async () => {
    const { model } = await fixture();
    const visited: string[] = [];
    model.launch.mockImplementation(async (_exe: string, _path: string, mode: string) => {
      visited.push(mode);
      if (mode === 'gpu') throw new Error('GPU startup failed');
    });
    await model.startInternal();
    expect(visited).toEqual(['gpu', 'cpu']);
    await model.updateBackend('gpu');
    model.stopping = false;
    visited.length = 0;
    await expect(model.startInternal()).rejects.toThrow('GPU startup failed');
    expect(visited).toEqual(['gpu']);
    await model.updateBackend('cpu');
    model.stopping = false;
    visited.length = 0;
    await model.startInternal();
    expect(visited).toEqual(['cpu']);
  });

  it('reports unavailable when an explicitly selected runtime is missing instead of silently using another backend', async () => {
    const { model, runtimeDir } = await fixture();
    await fs.unlink(path.join(runtimeDir, 'llama/llama-server.exe'));
    expect((await model.status()).available).toBe(true);
    await model.updateBackend('gpu');
    expect((await model.status()).available).toBe(false);
    await model.updateBackend('cpu');
    expect((await model.status()).available).toBe(true);
  });
});
