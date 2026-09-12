import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
const { ImageReader, readImageData, parseTranscription, transcriptionRequest, MAX_BYTES } =
  createRequire(import.meta.url)('../desktop/image-reader.cjs');
const { LocalModel } = createRequire(import.meta.url)('../desktop/local-model.cjs');
const png =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXcAAAAASUVORK5CYII=';
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('local image input boundary', () => {
  it('decodes a PNG header while retaining actual bytes and dimensions', () => {
    const image = readImageData({ dataUrl: png });
    expect(image).toMatchObject({ width: 1, height: 1, mime: 'image/png' });
    expect(image.bytes.subarray(1, 4).toString()).toBe('PNG');
  });
  it('rejects arbitrary paths, URLs, non-images and mismatching signatures', () => {
    for (const dataUrl of [
      'file:///secret',
      'https://example.test/a.png',
      'data:image/svg+xml;base64,PHN2Zy8+',
      png.replace('png', 'jpeg'),
      'data:image/png;base64,AAAA',
      png + '!',
    ])
      expect(() => readImageData({ dataUrl })).toThrow();
    expect(() =>
      readImageData({ dataUrl: 'a'.repeat(Math.ceil(MAX_BYTES / 3) * 4 + 41) }),
    ).toThrow();
  });
  it('rejects oversized decoded dimensions before invoking the native decoder', () => {
    const image = readImageData({ dataUrl: png }).bytes;
    image.writeUInt32BE(10000, 16);
    image.writeUInt32BE(10000, 20);
    expect(() =>
      readImageData({ dataUrl: 'data:image/png;base64,' + image.toString('base64') }),
    ).toThrow(/20 мегапикселей/);
  });
  it('bounds corrupt JPEG segment lengths', () => {
    const invalid = Buffer.from([255, 216, 255, 224, 255, 255, 0, 0, 0, 0, 0, 0]);
    expect(() =>
      readImageData({ dataUrl: 'data:image/jpeg;base64,' + invalid.toString('base64') }),
    ).toThrow();
  });
});
describe('transcription is editable evidence, not invented certainty', () => {
  it('preserves literal numbers and marks every real transcription for user review', () => {
    const result = parseTranscription(
      JSON.stringify({ text: 'Прямоугольник: 7 × 4 см. Найди S.', unclear: [] }),
      'stop',
    );
    expect(result.text).toContain('7 × 4');
    expect(result.uncertain).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.confidence).toBeUndefined();
  });
  it('retains uncertain fragments and warns about output truncation', () => {
    const result = parseTranscription(
      JSON.stringify({ text: 'x = [неразборчиво]', unclear: ['знак перед 2'] }),
      'length',
    );
    expect(result.text).toContain('[неразборчиво]');
    expect(result.warnings.join(' ')).toContain('только часть');
    expect(result.warnings.join(' ')).toContain('знак перед 2');
  });
  it('rejects missing, malformed, oversized or empty transcription output', () => {
    for (const value of [
      'not json',
      '{}',
      JSON.stringify({ text: '', unclear: [] }),
      JSON.stringify({ text: 'a'.repeat(6001), unclear: [] }),
      JSON.stringify({ text: 'a', unclear: [{}] }),
    ])
      expect(() => parseTranscription(value)).toThrow();
  });
  it('sends the actual image as an image content part and uses transcription-only instructions', () => {
    const request = transcriptionRequest(png);
    expect(request.messages[1].content[1]).toEqual({ type: 'image_url', image_url: { url: png } });
    expect(request.messages[0].content).toContain('без решения');
    expect(request.response_format.type).toBe('json_object');
  });
});
function fixture() {
  const textModel = {
    config: vi.fn(),
    reserveForImage: vi.fn().mockResolvedValue(true),
    releaseImage: vi.fn(),
  };
  const reader = new ImageReader({
    runtimeDir: 'NEVER_READ',
    userData: 'NEVER_READ',
    log: vi.fn(),
    textModel,
    nativeImage: {
      createFromBuffer: () => ({
        isEmpty: () => false,
        getSize: () => ({ width: 1, height: 1 }),
        toDataURL: () => png,
      }),
    },
  });
  vi.spyOn(reader, 'status').mockResolvedValue({ available: true });
  vi.spyOn(reader.worker, 'start').mockImplementation(async () => {
    reader.worker.url = 'http://127.0.0.1:1';
  });
  vi.spyOn(reader.worker, 'stop').mockImplementation(() => {});
  vi.spyOn(reader.worker, 'stopAndWait').mockResolvedValue(true);
  return { reader, textModel };
}
describe('vision lifecycle without starting a model process', () => {
  it('refuses a busy text runtime without sending an image or interrupting the answer', async () => {
    const { reader, textModel } = fixture();
    textModel.reserveForImage.mockResolvedValue(false);
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect((await reader.read({ dataUrl: png })).ok).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    expect(reader.worker.start).not.toHaveBeenCalled();
    expect(textModel.releaseImage).not.toHaveBeenCalled();
    expect(reader.busy).toBe(false);
  });
  it('returns genuine response content and releases the reserved runtime after success', async () => {
    const { reader, textModel } = fixture();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({
              choices: [
                {
                  message: { content: JSON.stringify({ text: '7 × 4', unclear: [] }) },
                  finish_reason: 'stop',
                },
              ],
            }),
          ),
        ),
    );
    expect(await reader.read({ dataUrl: png })).toMatchObject({
      ok: true,
      text: '7 × 4',
      method: 'local-vision',
      uncertain: true,
    });
    expect(reader.worker.stopAndWait).toHaveBeenCalledOnce();
    expect(textModel.releaseImage).toHaveBeenCalledOnce();
    expect(reader.busy).toBe(false);
  });
  it('cancels the actual pending request, refuses concurrent images and releases the lock', async () => {
    const { reader, textModel } = fixture();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementation(
          (_url, options) =>
            new Promise((_resolve, reject) =>
              options.signal.addEventListener('abort', () => reject(new Error('Cancelled'))),
            ),
        ),
    );
    const pending = reader.read({ dataUrl: png });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect((await reader.read({ dataUrl: png })).ok).toBe(false);
    expect(reader.cancel()).toBe(true);
    expect(await pending).toMatchObject({ ok: false });
    expect(textModel.releaseImage).toHaveBeenCalledOnce();
    expect(reader.busy).toBe(false);
  });
  it('text model photo reservation blocks model requests until release', async () => {
    const model = new LocalModel({
      runtimeDir: 'NEVER_READ',
      userData: 'NEVER_READ',
      log: () => {},
    });
    expect(await model.reserveForImage()).toBe(true);
    expect(model.configurationBusy()).toBe(true);
    expect((await model.ask({ subject: 'math', message: '7*4' })).ok).toBe(false);
    model.releaseImage();
    expect(model.configurationBusy()).toBe(false);
    expect(model.cancel()).toBe(false);
  });
  it('waits for its already-cancelled worker exit before releasing a model reservation', async () => {
    const model = new LocalModel({
      runtimeDir: 'NEVER_READ',
      userData: 'NEVER_READ',
      log: () => {},
    });
    const child = Object.assign(new EventEmitter(), {
      exitCode: null,
      signalCode: null,
      kill: vi.fn(),
    });
    model.child = child;
    model.busy = true;
    expect(model.cancel()).toBe(true);
    expect(child.kill).toHaveBeenCalledOnce();
    expect(model.child).toBeNull();
    let ended = false;
    const waiting = model.stopAndWait().then(() => {
      ended = true;
    });
    await Promise.resolve();
    expect(ended).toBe(false);
    child.emit('exit', 0);
    await waiting;
    expect(ended).toBe(true);
    expect(model.terminatingChildren.size).toBe(0);
    expect(child.listenerCount('exit')).toBe(0);
  });
  it('cancelAskModel aborts a pending real transport request instead of only changing the UI flag', async () => {
    const model = new LocalModel({
      runtimeDir: 'NEVER_READ',
      userData: 'NEVER_READ',
      log: () => {},
    });
    vi.spyOn(model, 'start').mockResolvedValue(undefined);
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementation(
          (_url, options) =>
            new Promise((_resolve, reject) =>
              options.signal.addEventListener('abort', () => reject(new Error('Cancelled'))),
            ),
        ),
    );
    const pending = model.ask({
      subject: 'math',
      message: 'Объясни 7 × 4',
      evidence: [
        {
          id: 'fact',
          text: 'Произведение семи и четырёх равно двадцати восьми.',
          sourceIds: ['cosmos-training'],
        },
      ],
    });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(model.cancel()).toBe(true);
    expect(await pending).toMatchObject({ ok: false, verification: { status: 'unavailable' } });
    expect(model.busy).toBe(false);
    expect(model.requestController).toBeNull();
  });
});
