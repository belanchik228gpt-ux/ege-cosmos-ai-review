const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const crypto = require('node:crypto');
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const VIDEO_EXT = new Set(['.mp4', '.webm']);
function relativeAsset(root, value, allowed) {
  if (
    typeof value !== 'string' ||
    !value ||
    path.isAbsolute(value) ||
    value.includes('..') ||
    value.includes(':') ||
    value.includes('\0')
  )
    throw new Error('Unsafe asset name');
  const resolved = path.resolve(root, value);
  if (
    !resolved.startsWith(path.resolve(root) + path.sep) ||
    !allowed.has(path.extname(resolved).toLowerCase())
  )
    throw new Error('Unsupported asset path');
  return resolved;
}
async function validateManifest(directory) {
  const raw = await fs.readFile(path.join(directory, 'manifest.json'), 'utf8');
  if (raw.length > 64000) throw new Error('Manifest too large');
  const source = JSON.parse(raw);
  if (
    !/^[a-z0-9][a-z0-9_-]{0,70}$/i.test(source.id) ||
    typeof source.title !== 'string' ||
    !source.title.trim()
  )
    throw new Error('Missing id/title');
  const manifest = {
    id: source.id,
    title: source.title.slice(0, 120),
    version: String(source.version || '1').slice(0, 40),
    author: String(source.author || '').slice(0, 120),
    createdWith: String(source.createdWith || '').slice(0, 100),
    preview: source.preview,
    static: source.static,
    variants: {},
  };
  const assets = new Map();
  for (const key of ['preview', 'static'])
    assets.set(source[key], relativeAsset(directory, source[key], IMAGE_EXT));
  for (const quality of ['high', 'medium', 'low'])
    if (source.variants?.[quality]) {
      manifest.variants[quality] = source.variants[quality];
      assets.set(
        source.variants[quality],
        relativeAsset(directory, source.variants[quality], VIDEO_EXT),
      );
    }
  let total = 0;
  for (const file of assets.values()) {
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Asset must be a regular file');
    const real = await fs.realpath(file),
      realRoot = await fs.realpath(directory);
    if (!real.startsWith(realRoot + path.sep)) throw new Error('Asset escapes directory');
    total += stat.size;
    if (total > 25 * 1024 ** 3) throw new Error('Background exceeds 25 GiB');
  }
  return { manifest, assets };
}
function publicManifest(directory, m) {
  return {
    ...m,
    previewUrl: pathToFileURL(path.join(directory, m.preview)).href,
    staticUrl: pathToFileURL(path.join(directory, m.static)).href,
    variants: Object.fromEntries(
      Object.entries(m.variants).map(([quality, file]) => [
        quality,
        pathToFileURL(path.join(directory, file)).href,
      ]),
    ),
  };
}
async function importBackground(directory, backgroundsDir) {
  const { manifest, assets } = await validateManifest(directory);
  const destination = path.join(
    backgroundsDir,
    `${manifest.id}-${crypto.randomBytes(4).toString('hex')}`,
  );
  await fs.mkdir(destination, { recursive: true });
  for (const [name, original] of assets) {
    const file = path.join(destination, name);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.copyFile(original, file);
  }
  await fs.writeFile(path.join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return { ok: true, background: publicManifest(destination, manifest) };
}
async function listBackgrounds(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []),
    result = [];
  for (const entry of entries)
    if (entry.isDirectory()) {
      const root = path.join(directory, entry.name);
      try {
        const { manifest } = await validateManifest(root);
        result.push(publicManifest(root, manifest));
      } catch {}
    }
  return result;
}
module.exports = { importBackground, listBackgrounds, validateManifest };
