import { afterEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const { createHomeworkImageStore } = createRequire(import.meta.url)(
  '../desktop/homework-images.cjs',
);
const png =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXcAAAAASUVORK5CYII=';
const directories: string[] = [];
const nativeImage = {
  createFromBuffer: () => ({ isEmpty: () => false, getSize: () => ({ width: 1, height: 1 }) }),
};
async function setup(decoder = nativeImage) {
  const userData = await fs.mkdtemp(path.join(os.tmpdir(), 'cosmos-homework-image-test-'));
  directories.push(userData);
  return { userData, store: createHomeworkImageStore({ userData, nativeImage: decoder }) };
}
afterEach(async () => {
  for (const directory of directories.splice(0))
    await fs.rm(directory, { recursive: true, force: true });
});
describe('persistent homework image boundary', () => {
  it('stores original image bytes and restores the image after recreating the store', async () => {
    const { userData, store } = await setup();
    const saved = await store.save({ dataUrl: png, name: 'Уравнение.png' });
    expect(saved.ok).toBe(true);
    expect(saved.id).toMatch(/^[a-f0-9-]{36}$/);
    const disk = await fs.readFile(path.join(userData, 'homework-images', saved.id, 'image.bin'));
    expect(disk.equals(Buffer.from(png.split(',')[1], 'base64'))).toBe(true);
    const fresh = createHomeworkImageStore({ userData, nativeImage });
    expect(await fresh.read(saved.id)).toEqual({ ok: true, dataUrl: png, name: 'Уравнение.png' });
    expect(await fs.readdir(path.join(userData, 'homework-images'))).toEqual([saved.id]);
  });
  it('uses independent generated IDs for concurrent assignments', async () => {
    const { store } = await setup();
    const values = await Promise.all(
      ['A.png', 'B.png'].map((name) => store.save({ dataUrl: png, name })),
    );
    expect(values.every((value) => value.ok)).toBe(true);
    expect(values[0].id).not.toBe(values[1].id);
    expect((await store.read(values[0].id)).name).toBe('A.png');
    expect((await store.read(values[1].id)).name).toBe('B.png');
  });
  it('never accepts paths, remote URLs or arbitrary identifiers', async () => {
    const { store } = await setup();
    for (const id of [
      '../learning-state.v1.json',
      'C:\\private.png',
      'https://example.test/a.png',
      {},
      null,
    ])
      expect((await store.read(id)).ok).toBe(false);
    for (const dataUrl of [
      'file:///private.png',
      'https://example.test/a.png',
      'data:image/svg+xml;base64,PHN2Zy8+',
      png.replace('png', 'jpeg'),
    ])
      expect((await store.save({ dataUrl, name: 'photo.png' })).ok).toBe(false);
  });
  it('requires successful native image decoding in addition to a valid header', async () => {
    const { userData, store } = await setup({
      createFromBuffer: () => ({ isEmpty: () => true, getSize: () => ({ width: 1, height: 1 }) }),
    });
    expect((await store.save({ dataUrl: png, name: 'broken.png' })).ok).toBe(false);
    expect(await fs.readdir(userData)).toEqual([]);
  });
  it('rejects input beyond 10 MB before any file is created', async () => {
    const { userData, store } = await setup();
    expect(
      (await store.save({ dataUrl: 'data:image/png;base64,' + 'A'.repeat(14 * 1024 * 1024) })).ok,
    ).toBe(false);
    expect(await fs.readdir(userData)).toEqual([]);
  });
  it('removes path parts and controls from display names', async () => {
    const { store } = await setup();
    const saved = await store.save({ dataUrl: png, name: 'C:\\fakepath\\task\n.png' });
    expect((await store.read(saved.id)).name).toBe('task.png');
  });
  it('reports missing or partially written images without losing other stored images', async () => {
    const { userData, store } = await setup();
    const saved = await store.save({ dataUrl: png, name: 'task.png' });
    await fs.writeFile(
      path.join(userData, 'homework-images', saved.id, 'image.bin'),
      Buffer.from([1, 2]),
    );
    expect((await store.read(saved.id)).ok).toBe(false);
    expect((await store.read('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')).ok).toBe(false);
    const other = await store.save({ dataUrl: png, name: 'valid.png' });
    expect((await store.read(other.id)).ok).toBe(true);
  });
  it('bounds disk metadata before parsing', async () => {
    const { userData, store } = await setup();
    const saved = await store.save({ dataUrl: png, name: 'task.png' });
    await fs.writeFile(
      path.join(userData, 'homework-images', saved.id, 'metadata.json'),
      ' '.repeat(2049),
    );
    expect((await store.read(saved.id)).ok).toBe(false);
  });
});
