import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

// Official, version-pinned npm distribution; no access to any Codex account.
const version = '0.153.4';
const target = path.resolve('runtime/openai');
const cache = path.resolve('test-results/openai-protocol/download');
await fs.mkdir(cache, { recursive: true });
await fs.mkdir(target, { recursive: true });
const metadata = await (
  await fetch(`https://registry.npmjs.org/@openai/codex/${version}-win32-x64`)
).json();
const archive = Buffer.from(await (await fetch(metadata.dist.tarball)).arrayBuffer());
const integrity = 'sha512-' + createHash('sha512').update(archive).digest('base64');
if (integrity !== metadata.dist.integrity)
  throw new Error('Official npm package integrity mismatch');
const file = path.join(cache, 'codex.tgz');
await fs.writeFile(file, archive);
const members = execFileSync('tar.exe', ['-tzf', file], { windowsHide: true, encoding: 'utf8' })
  .trim()
  .split(/\r?\n/);
if (members.some((name) => !name.startsWith('package/') || name.split(/[\\/]/).includes('..')))
  throw new Error('Unexpected package paths');
execFileSync('tar.exe', ['-xzf', file, '-C', target, '--strip-components=1'], {
  windowsHide: true,
});
for (const licenseFile of ['LICENSE', 'NOTICE']) {
  const response = await fetch(
    `https://raw.githubusercontent.com/openai/codex/rust-v${version}/${licenseFile}`,
  );
  if (!response.ok) throw new Error(`Official ${licenseFile} unavailable`);
  await fs.writeFile(path.join(target, licenseFile), await response.text());
}
const files = [];
async function inventory(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const item = path.join(directory, entry.name);
    if (entry.isDirectory()) await inventory(item);
    else if (entry.name !== 'manifest.json') {
      const bytes = await fs.readFile(item);
      files.push({
        file: path.relative(target, item).replaceAll('\\', '/'),
        bytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      });
    }
  }
}
await inventory(target);
await fs.writeFile(
  path.join(target, 'manifest.json'),
  JSON.stringify(
    {
      version,
      package: '@openai/codex',
      license: metadata.license,
      source: metadata.dist.tarball,
      integrity,
      checkedAt: new Date().toISOString(),
      files,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify(
    { version, bytes: files.reduce((n, f) => n + f.bytes, 0), files: files.map((f) => f.file) },
    null,
    2,
  ),
);
