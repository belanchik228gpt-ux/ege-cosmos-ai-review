// Verifier regression tests on tiny, explicitly synthetic files. No binary is executed.
// These checks test acceptance logic, never claim that a model or installer works.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const buildRequire = createRequire(require.resolve('electron-builder'));
const { createPackage } = buildRequire('@electron/asar');

const project = path.resolve(import.meta.dirname, '..');
const fixture = path.join(project, 'test-results', `release-verifier-fixture-${Date.now()}`);
const installed = path.join(fixture, 'test-results/installed-app');
const portable = path.join(fixture, 'release/win-unpacked');
const checksum = (text) => createHash('sha256').update(text).digest('hex');
async function put(file, content) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content);
}
async function copied(relative, content) {
  await put(path.join(installed, relative), content);
  await put(path.join(portable, relative), content);
}
const textModel = 'GGUF synthetic verifier fixture. Never executed.';
const manifest = {
  downloads: [['models/Qwen3-8B-Q4_K_M.gguf', 'synthetic-test-only', checksum(textModel)]],
};
const vision = {
  repository: 'Qwen/Qwen3-VL-4B-Instruct-GGUF',
  revision: 'synthetic-verifier-fixture',
  license: 'fixture',
  files: ['Qwen3VL-4B-Instruct-Q4_K_M.gguf', 'mmproj-Qwen3VL-4B-Instruct-F16.gguf'].map((file) => ({
    file,
    relative: `models/vision/${file}`,
    bytes: Buffer.byteLength(textModel),
    sha256: checksum(textModel),
  })),
};
const pdf = '%PDF-1.4 synthetic hash fixture, not a document for reading';
const sources = {
  checkedAt: '2000-01-01',
  documents: [
    {
      id: 'synthetic-reference',
      file: 'year/check.pdf',
      sha256: checksum(pdf),
      bytes: Buffer.byteLength(pdf),
    },
  ],
};
await put(path.join(fixture, 'package.json'), JSON.stringify({ version: '0.5.0' }));
for (const [file, content] of Object.entries({
  'artifacts.json': manifest,
  'vision-artifacts.json': vision,
})) {
  await put(path.join(fixture, 'runtime', file), JSON.stringify(content));
  await copied(`resources/runtime/${file}`, JSON.stringify(content));
}
await put(path.join(fixture, 'resources/knowledge-sources/manifest.json'), JSON.stringify(sources));
await copied('resources/knowledge-sources/manifest.json', JSON.stringify(sources));
await copied('resources/knowledge-sources/year/check.pdf', pdf);
await copied('resources/runtime/models/Qwen3-8B-Q4_K_M.gguf', textModel);
for (const file of vision.files) await copied(`resources/runtime/${file.relative}`, textModel);
for (const folder of ['llama', 'llama-cpu', 'licenses']) {
  for (const name of folder === 'licenses'
    ? ['LICENSE.txt']
    : ['llama-server.exe', 'llama-server-impl.dll', 'mtmd.dll']) {
    const content = `Synthetic ${folder}/${name}; never executed.`;
    await put(path.join(fixture, 'runtime', folder, name), content);
    await copied(`resources/runtime/${folder}/${name}`, content);
  }
}
await copied('EGE Cosmos.exe', 'Synthetic app executable; never executed.');
async function makeAsar(version) {
  const directory = path.join(fixture, 'asar-content');
  await put(path.join(directory, 'package.json'), JSON.stringify({ version }));
  const archive = path.join(fixture, 'fixture.asar');
  await createPackage(directory, archive);
  await copied('resources/app.asar', await fs.readFile(archive));
}
await makeAsar('0.5.0');
const openaiPackage = {
  name: '@openai/codex',
  version: '0.153.4-win32-x64',
  license: 'Apache-2.0',
  os: ['win32'],
  cpu: ['x64'],
};
const openaiContents = {
  'package.json': JSON.stringify(openaiPackage),
  LICENSE: 'Synthetic Apache license placeholder. This fixture is never distributed.',
  NOTICE: 'Synthetic OpenAI notice placeholder. This fixture is never distributed.',
  'vendor/x86_64-pc-windows-msvc/bin/codex.exe': 'Synthetic Codex executable; never executed.',
};
// Official identity metadata lets the verifier exercise its pinned metadata checks.
// File content and SHA-256 values below are synthetic, not evidence for the real runtime.
const openai = {
  package: '@openai/codex',
  version: '0.153.4',
  license: 'Apache-2.0',
  source: 'https://registry.npmjs.org/@openai/codex/-/codex-0.153.4-win32-x64.tgz',
  integrity:
    'sha512-lMkB43kJZH0VFr+hoXc11qqR7QtQIbkr07ALgj4urKL1osNyUyuy1iXd3Vzz2iCYvBUCSw7I0l/W1cEPGx9euQ==',
  checkedAt: '2000-01-01',
  files: Object.entries(openaiContents).map(([file, content]) => ({
    file,
    bytes: Buffer.byteLength(content),
    sha256: checksum(content),
  })),
};
async function openaiFile(file, content) {
  await put(path.join(fixture, 'runtime/openai', file), content);
  await copied(`resources/runtime/openai/${file}`, content);
}
for (const [file, content] of Object.entries(openaiContents)) await openaiFile(file, content);
await openaiFile('manifest.json', JSON.stringify(openai));
const installer = 'Synthetic installer executable; never executed.';
await put(path.join(fixture, 'release/EGE Cosmos Setup 0.5.0.exe'), installer);
await put(path.join(fixture, 'release/offline-kit/EGE Cosmos Setup 0.5.0.exe'), installer);
let count = 0;
async function check(name, expectedExit, expectedError) {
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(project, 'scripts/verify-release.mjs')], {
      cwd: fixture,
      windowsHide: true,
      env: { ...process.env, COSMOS_EXE: path.join(installed, 'EGE Cosmos.exe') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (part) => {
      output = (output + part).slice(-20000);
    });
    child.stderr.on('data', (part) => {
      output = (output + part).slice(-20000);
    });
    const timer = setTimeout(() => {
      child.kill();
      reject(Error('Verifier fixture deadline exceeded'));
    }, 10000);
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      resolve({ code, output });
    });
  });
  assert.equal(result.code === 0, expectedExit === 0, `${name}: ${result.output}`);
  if (expectedError) assert.match(result.output, expectedError, name);
  count += 1;
  console.log(`PASS verifier logic: ${name}`);
}
await check('matching complete tree', 0);
const report = JSON.parse(
  await fs.readFile(path.join(fixture, 'docs/verification/release-verification-0.5.json'), 'utf8'),
);
assert.equal(report.applicationVersion, '0.5.0');
assert.equal(report.openaiRuntime.verifiedArtifactCount, 4);
assert.equal(report.behaviouralVerification.liveOpenAI, 'not-run-by-this-verifier');
assert.equal(report.evidenceScope, 'installed-file-integrity');
await makeAsar('0.4.0');
await check('matching old ASARs cannot confirm new release', 1, /ASAR version must match/);
await makeAsar('0.5.0');
const codex = path.join(
  installed,
  'resources/runtime/openai/vendor/x86_64-pc-windows-msvc/bin/codex.exe',
);
const originalCodex = await fs.readFile(codex);
await fs.writeFile(codex, 'Damaged official-runtime fixture');
await check('changed installed OpenAI executable rejected', 1, /Installed runtime differs: openai/);
await fs.writeFile(codex, originalCodex);
const originalLicense = openaiContents.LICENSE;
await openaiFile('LICENSE', 'Same altered license in all three trees');
await check(
  'identical changed source/build/install license cannot bypass manifest',
  1,
  /OpenAI source artifact differs from pinned manifest: LICENSE/,
);
await openaiFile('LICENSE', originalLicense);
const installedManifest = path.join(installed, 'resources/runtime/openai/manifest.json');
await fs.writeFile(installedManifest, JSON.stringify({ ...openai, checkedAt: '2099-01-01' }));
await check(
  'changed installed OpenAI manifest rejected',
  1,
  /Installed runtime differs: openai\/manifest.json/,
);
await fs.writeFile(installedManifest, JSON.stringify(openai));
await openaiFile(
  'manifest.json',
  JSON.stringify({ ...openai, files: [...openai.files, openai.files[0]] }),
);
await check('duplicate manifest entries rejected', 1, /Duplicate OpenAI manifest path/);
await openaiFile(
  'manifest.json',
  JSON.stringify({
    ...openai,
    files: [{ file: '../outside.exe', bytes: 1, sha256: checksum('x') }],
  }),
);
await check('manifest path traversal rejected', 1, /Unsafe OpenAI manifest path/);
await openaiFile('manifest.json', JSON.stringify(openai));
const installedNotice = path.join(installed, 'resources/runtime/openai/NOTICE');
await fs.rename(installedNotice, `${installedNotice}.missing`);
await check(
  'missing installed OpenAI notice rejected',
  1,
  /Installed openai file whitelist differs/,
);
await fs.rename(`${installedNotice}.missing`, installedNotice);
const decoder = path.join(installed, 'resources/runtime/llama/mtmd.dll');
const decoderOriginal = await fs.readFile(decoder);
await fs.writeFile(decoder, 'Damaged multimodal DLL while launcher remains unchanged');
await check(
  'changed vision DLL rejected despite identical launcher',
  1,
  /Installed runtime differs: llama\/mtmd.dll/,
);
await fs.writeFile(decoder, decoderOriginal);
const installedSources = path.join(installed, 'resources/knowledge-sources/manifest.json');
await fs.writeFile(installedSources, JSON.stringify({ ...sources, checkedAt: '2099-01-01' }));
await check('changed installed source manifest rejected', 1, /Installed PDF manifest must match/);
await fs.writeFile(installedSources, JSON.stringify(sources));
await fs.writeFile(
  path.join(fixture, 'release/offline-kit/EGE Cosmos Setup 0.5.0.exe'),
  'Stale installer fixture',
);
await check('stale offline-kit installer rejected', 1, /Offline kit installer must match/);
console.log(
  `${count} isolated verifier checks passed. No app, model, installer or GPU operation was launched.`,
);
