import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const buildRequire = createRequire(require.resolve('electron-builder'));
const { extractFile } = buildRequire('@electron/asar');
const asar = process.env.COSMOS_EXE && path.join(path.dirname(process.env.COSMOS_EXE), 'resources/app.asar');
const manifest = JSON.parse(await fs.readFile('resources/ton618-transfer/ASSET-MANIFEST.json', 'utf8'));
const checks = [];
for (const asset of manifest.assets) {
  assert(asset.file.startsWith('public/ton618/') && !asset.file.includes('..'));
  for (const file of [asset.file, asset.file.replace(/^public\//, 'dist/')]) {
    const content = await fs.readFile(file);
    const sha256 = createHash('sha256').update(content).digest('hex');
    assert.equal(content.length, asset.bytes, file);
    assert.equal(sha256, asset.sha256, file);
    checks.push({ file, bytes: content.length, sha256 });
  }
  if (asar) {
    const file = asset.file.replace(/^public\//, 'dist/');
    const content = extractFile(asar, path.normalize(file));
    const sha256 = createHash('sha256').update(content).digest('hex');
    assert.equal(content.length, asset.bytes, file);
    assert.equal(sha256, asset.sha256, file);
    checks.push({ asar, file, bytes: content.length, sha256 });
  }
}
const report = { status: 'pass', checkedAt: new Date().toISOString(), assets: manifest.assets.length, checks };
await fs.mkdir('docs/verification', { recursive: true });
await fs.writeFile(path.join('docs/verification', 'ton618-assets-'+JSON.parse(await fs.readFile('package.json','utf8')).version+'.json'), JSON.stringify(report, null, 2));
console.log(`PASS: ${manifest.assets.length} assets match the transfer manifest in source, production dist${asar ? ' and installed ASAR' : ''}.`);
