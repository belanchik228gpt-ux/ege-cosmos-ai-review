const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { readImageData, MAX_BYTES } = require('./image-reader.cjs');

const IMAGE_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
function imageName(value) {
  return typeof value === 'string'
    ? value
        .replace(/\\/g, '/')
        .split('/')
        .pop()
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .trim()
        .slice(0, 160) || 'Задание'
    : 'Задание';
}
function validateNative(image, nativeImage) {
  const decoded = nativeImage.createFromBuffer(image.bytes);
  if (decoded.isEmpty()) throw new Error('Image cannot be decoded');
  const size = decoded.getSize();
  if (size.width !== image.width || size.height !== image.height)
    throw new Error('Image dimensions do not match');
}
async function readBounded(file, limit) {
  const entry = await fs.lstat(file);
  if (!entry.isFile() || entry.isSymbolicLink() || entry.size > limit)
    throw new Error('Invalid image asset file');
  const handle = await fs.open(file, 'r');
  try {
    const buffer = Buffer.alloc(limit + 1);
    let used = 0;
    while (used < buffer.length) {
      const { bytesRead } = await handle.read(buffer, used, buffer.length - used, null);
      if (!bytesRead) break;
      used += bytesRead;
    }
    if (used > limit) throw new Error('Image asset exceeds limit');
    return buffer.subarray(0, used);
  } finally {
    await handle.close();
  }
}
function createHomeworkImageStore({ userData, nativeImage, log = () => {} }) {
  const directory = path.join(userData, 'homework-images');
  return {
    async save(input) {
      let temporary;
      try {
        const image = readImageData(input);
        validateNative(image, nativeImage);
        const id = randomUUID();
        await fs.mkdir(directory, { recursive: true });
        temporary = path.join(directory, `.${id}.tmp`);
        await fs.mkdir(temporary);
        const handle = await fs.open(path.join(temporary, 'image.bin'), 'wx');
        try {
          await handle.writeFile(image.bytes);
          await handle.sync();
        } finally {
          await handle.close();
        }
        await fs.writeFile(
          path.join(temporary, 'metadata.json'),
          JSON.stringify({
            mime: image.mime,
            name: imageName(input.name),
            bytes: image.bytes.length,
          }),
          { flag: 'wx' },
        );
        // Publish the original bytes and their metadata together, so a interrupted
        // write never leaves a readable image ID with half its contents missing.
        await fs.rename(temporary, path.join(directory, id));
        return { ok: true, id };
      } catch (error) {
        log('homework-image-save', error.message);
        return {
          ok: false,
          error: 'Не удалось сохранить фото. Выбери читаемый PNG или JPEG до 10 МБ.',
        };
      } finally {
        if (temporary) {
          // Exact, generated filenames only; never recurse through caller paths.
          await fs.unlink(path.join(temporary, 'image.bin')).catch(() => {});
          await fs.unlink(path.join(temporary, 'metadata.json')).catch(() => {});
          await fs.rmdir(temporary).catch(() => {});
        }
      }
    },
    async read(id) {
      try {
        if (typeof id !== 'string' || !IMAGE_ID.test(id)) throw new Error('Invalid image ID');
        const folder = path.join(directory, id);
        const entry = await fs.lstat(folder);
        if (!entry.isDirectory() || entry.isSymbolicLink())
          throw new Error('Invalid image directory');
        const metadata = JSON.parse(
          (await readBounded(path.join(folder, 'metadata.json'), 2048)).toString('utf8'),
        );
        if (!metadata || !['image/png', 'image/jpeg'].includes(metadata.mime))
          throw new Error('Invalid image metadata');
        const bytes = await readBounded(path.join(folder, 'image.bin'), MAX_BYTES);
        if (metadata.bytes !== bytes.length) throw new Error('Incomplete image');
        const dataUrl = `data:${metadata.mime};base64,${bytes.toString('base64')}`;
        validateNative(readImageData({ dataUrl }), nativeImage);
        return { ok: true, dataUrl, name: imageName(metadata.name) };
      } catch (error) {
        log('homework-image-read', error.message);
        return {
          ok: false,
          error: 'Фото задания недоступно. Прикрепи его ещё раз — переписка сохранена.',
        };
      }
    },
  };
}
module.exports = { createHomeworkImageStore };
