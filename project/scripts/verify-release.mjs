import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// Use the ASAR reader shipped with the existing build tool; never execute packaged code.
const require = createRequire(import.meta.url);
const buildRequire = createRequire(require.resolve('electron-builder'));
const { extractFile } = buildRequire('@electron/asar');

const root = process.cwd();
const installed = path.dirname(
  path.resolve(process.env.COSMOS_EXE || 'test-results/installed-app/EGE Cosmos.exe'),
);
const portable = path.join(root, 'release/win-unpacked');
async function digest(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
async function fingerprint(file) {
  const info = await fs.lstat(file);
  assert(info.isFile());
  return { bytes: info.size, sha256: await digest(file) };
}
async function regularFiles(directory, relative = '') {
  const entries = await fs.readdir(path.join(directory, relative), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = relative ? `${relative}/${entry.name}` : entry.name;
    assert(!entry.isSymbolicLink(), `Unexpected symbolic link in runtime: ${child}`);
    if (entry.isDirectory()) files.push(...(await regularFiles(directory, child)));
    else {
      assert(entry.isFile(), `Unexpected non-file: ${child}`);
      files.push(child);
    }
  }
  return files.sort();
}
function inside(directory, relative) {
  assert(typeof relative === 'string' && relative.length > 0 && !path.isAbsolute(relative));
  const resolved = path.resolve(directory, relative);
  const relation = path.relative(path.resolve(directory), resolved);
  assert(
    relation &&
      !relation.startsWith(`..${path.sep}`) &&
      relation !== '..' &&
      !path.isAbsolute(relation),
    `Unexpected reference path: ${relative}`,
  );
  return resolved;
}
async function json(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}
const { version } = await json(path.join(root, 'package.json'));
assert(/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(version), 'Invalid release version');
const result = {
  at: new Date().toISOString(),
  applicationVersion: version,
  installed,
  portable,
  evidenceScope: 'installed-file-integrity',
  checks: [],
  files: {},
};
for (const relative of ['EGE Cosmos.exe', 'resources/app.asar']) {
  const [built, actual] = await Promise.all([
    fingerprint(path.join(portable, relative)),
    fingerprint(path.join(installed, relative)),
  ]);
  assert.deepEqual(actual, built, `${relative} must match the final package`);
  result.files[relative] = actual;
  result.checks.push({ name: `installed-matches-package:${relative}`, status: 'pass' });
}
for (const [label, directory] of [
  ['Installed', installed],
  ['Portable', portable],
]) {
  const packaged = JSON.parse(
    extractFile(path.join(directory, 'resources/app.asar'), 'package.json').toString('utf8'),
  );
  assert.equal(packaged.version, version, `${label} ASAR version must match the release version`);
}
result.checks.push({ name: 'installed-and-portable-ASAR-version-matches-release', status: 'pass' });
const modelRelative = 'resources/runtime/models/Qwen3-8B-Q4_K_M.gguf';
const manifest = JSON.parse(await fs.readFile('runtime/artifacts.json', 'utf8'));
assert.deepEqual(
  await json(path.join(installed, 'resources/runtime/artifacts.json')),
  manifest,
  'Installed text-runtime manifest must match the source',
);
assert.deepEqual(
  await json(path.join(portable, 'resources/runtime/artifacts.json')),
  manifest,
  'Portable text-runtime manifest must match the source',
);
const modelExpected = manifest.downloads.find(([file]) => file.startsWith('models/'))[2];
const model = await fingerprint(path.join(installed, modelRelative));
assert.equal(model.sha256, modelExpected);
result.files[modelRelative] = model;
result.checks.push({ name: 'installed-model-matches-official-revision', status: 'pass' });
const vision = JSON.parse(await fs.readFile('runtime/vision-artifacts.json', 'utf8'));
const installedVision = JSON.parse(
  await fs.readFile(path.join(installed, 'resources/runtime/vision-artifacts.json'), 'utf8'),
);
assert.deepEqual(
  installedVision,
  vision,
  'Installed vision metadata must match the verified build',
);
assert.deepEqual(
  await json(path.join(portable, 'resources/runtime/vision-artifacts.json')),
  vision,
  'Portable vision manifest must match the source',
);
const visionNames = ['Qwen3VL-4B-Instruct-Q4_K_M.gguf', 'mmproj-Qwen3VL-4B-Instruct-F16.gguf'];
assert.equal(vision.repository, 'Qwen/Qwen3-VL-4B-Instruct-GGUF');
assert.equal(vision.files.length, 2);
for (const name of visionNames) {
  const artifact = vision.files.find((file) => file.file === name);
  assert.equal(artifact?.relative, `models/vision/${name}`);
  const relative = `resources/runtime/${artifact.relative}`;
  const actual = await fingerprint(path.join(installed, relative));
  assert.equal(actual.sha256, artifact.sha256, name);
  assert.equal(actual.bytes, artifact.bytes, name);
  result.files[relative] = actual;
}
result.visionModel = {
  repository: vision.repository,
  revision: vision.revision,
  license: vision.license,
};
result.checks.push({
  name: 'both-installed-vision-artifacts-match-official-revision',
  status: 'pass',
});
const sources = JSON.parse(
  await fs.readFile(path.join(installed, 'resources/knowledge-sources/manifest.json'), 'utf8'),
);
const expectedSources = await json(path.join(root, 'resources/knowledge-sources/manifest.json'));
assert.deepEqual(sources, expectedSources, 'Installed PDF manifest must match the source manifest');
assert.deepEqual(
  await json(path.join(portable, 'resources/knowledge-sources/manifest.json')),
  expectedSources,
  'Portable PDF manifest must match the source manifest',
);
result.checks.push({ name: 'installed-and-portable-source-manifests-match-build', status: 'pass' });
let totalBytes = 0;
for (const document of sources.documents) {
  const actual = await fingerprint(
    inside(path.join(installed, 'resources/knowledge-sources'), document.file),
  );
  assert.equal(actual.sha256, document.sha256, document.id);
  assert.equal(actual.bytes, document.bytes, document.id);
  totalBytes += actual.bytes;
}
result.officialPDFs = {
  count: sources.documents.length,
  bytes: totalBytes,
  checkedAt: sources.checkedAt,
};
result.checks.push({ name: 'all-installed-official-PDFs-match-manifest', status: 'pass' });
const schoolSources = await json(path.join(root, 'resources/school-program/manifest.json'));
for (const base of [portable, installed]) {
  const directory = path.join(base, 'resources/school-program');
  assert.deepEqual(await json(path.join(directory, 'manifest.json')), schoolSources);
  assert.deepEqual(await regularFiles(directory), ['manifest.json', ...schoolSources.documents.flatMap(d => [d.file, d.textFile])].sort(), 'Retired school materials must not remain in the resource bundle');
  for (const document of schoolSources.documents) {
    for (const [file, bytes, sha256] of [
      [document.file, document.pdfBytes, document.pdfSha256],
      [document.textFile, document.textBytes, document.textSha256],
    ])
      assert.deepEqual(await fingerprint(inside(directory, file)), { bytes, sha256 }, document.id);
  }
}
result.schoolSources = {
  documents: schoolSources.documents.length,
  pages: schoolSources.documents.reduce((sum, d) => sum + d.pageCount, 0),
  pdfBytes: schoolSources.documents.reduce((sum, d) => sum + d.pdfBytes, 0),
  textBytes: schoolSources.documents.reduce((sum, d) => sum + d.textBytes, 0),
};
result.checks.push({
  name: 'installed-and-portable-school-PDFs-text-and-manifest-match-build',
  status: 'pass',
});
result.runtimeFolders = {};
for (const folder of ['llama', 'llama-cpu', 'licenses', 'openai']) {
  const sourceDirectory = path.join(root, 'runtime', folder);
  const portableDirectory = path.join(portable, 'resources/runtime', folder);
  const installedDirectory = path.join(installed, 'resources/runtime', folder);
  const expectedFiles = await regularFiles(sourceDirectory);
  assert(expectedFiles.length > 0, `Empty runtime folder: ${folder}`);
  assert.deepEqual(
    await regularFiles(portableDirectory),
    expectedFiles,
    `Portable ${folder} file whitelist differs from source`,
  );
  assert.deepEqual(
    await regularFiles(installedDirectory),
    expectedFiles,
    `Installed ${folder} file whitelist differs from source`,
  );
  let bytes = 0;
  for (const file of expectedFiles) {
    const [expected, built, actual] = await Promise.all([
      fingerprint(inside(sourceDirectory, file)),
      fingerprint(inside(portableDirectory, file)),
      fingerprint(inside(installedDirectory, file)),
    ]);
    assert.deepEqual(built, expected, `Portable runtime differs: ${folder}/${file}`);
    assert.deepEqual(actual, expected, `Installed runtime differs: ${folder}/${file}`);
    result.files[`${folder}/${file}`] = actual;
    bytes += actual.bytes;
  }
  result.runtimeFolders[folder] = { count: expectedFiles.length, bytes };
}
result.checks.push({
  name: 'all-installed-and-portable-runtime-files-and-licenses-match-build',
  status: 'pass',
});
const openaiDirectory = path.join(root, 'runtime/openai');
const openai = await json(path.join(openaiDirectory, 'manifest.json'));
assert.equal(openai.package, '@openai/codex', 'Unexpected OpenAI runtime package');
assert.equal(openai.version, '0.153.4', 'Unreviewed OpenAI runtime version');
assert.equal(openai.license, 'Apache-2.0', 'Unexpected OpenAI runtime license');
assert.equal(
  openai.source,
  'https://registry.npmjs.org/@openai/codex/-/codex-0.153.4-win32-x64.tgz',
  'Unexpected OpenAI archive source',
);
assert.equal(
  openai.integrity,
  'sha512-lMkB43kJZH0VFr+hoXc11qqR7QtQIbkr07ALgj4urKL1osNyUyuy1iXd3Vzz2iCYvBUCSw7I0l/W1cEPGx9euQ==',
  'Unexpected OpenAI archive integrity metadata',
);
assert(Number.isFinite(Date.parse(openai.checkedAt)), 'OpenAI source check date is missing');
assert(
  Array.isArray(openai.files) && openai.files.length > 0 && openai.files.length <= 100,
  'Invalid OpenAI runtime manifest',
);
const openaiFiles = new Set();
for (const file of openai.files) {
  assert(
    typeof file?.file === 'string' &&
      !file.file.includes('\\') &&
      !file.file.includes(':') &&
      !file.file.split('/').some((segment) => !segment || segment === '.' || segment === '..'),
    'Unsafe OpenAI manifest path',
  );
  assert(!openaiFiles.has(file.file.toLowerCase()), 'Duplicate OpenAI manifest path');
  openaiFiles.add(file.file.toLowerCase());
  assert(
    Number.isSafeInteger(file.bytes) && file.bytes > 0 && /^[a-f0-9]{64}$/.test(file.sha256),
    'Invalid OpenAI artifact checksum',
  );
  const expected = { bytes: file.bytes, sha256: file.sha256 };
  assert.deepEqual(
    await fingerprint(inside(openaiDirectory, file.file)),
    expected,
    `OpenAI source artifact differs from pinned manifest: ${file.file}`,
  );
}
assert.deepEqual(
  await regularFiles(openaiDirectory),
  [...openai.files.map((file) => file.file), 'manifest.json'].sort(),
  'OpenAI runtime files must exactly match the manifest whitelist',
);
for (const file of [
  'package.json',
  'LICENSE',
  'NOTICE',
  'vendor/x86_64-pc-windows-msvc/bin/codex.exe',
]) {
  assert(openaiFiles.has(file.toLowerCase()), `Required OpenAI runtime artifact missing: ${file}`);
}
const openaiPackage = await json(path.join(openaiDirectory, 'package.json'));
assert.equal(openaiPackage.name, openai.package, 'OpenAI package identity differs');
assert.equal(
  openaiPackage.version,
  `${openai.version}-win32-x64`,
  'OpenAI package version differs',
);
assert.equal(openaiPackage.license, openai.license, 'OpenAI package license differs');
assert.deepEqual(openaiPackage.os, ['win32']);
assert.deepEqual(openaiPackage.cpu, ['x64']);
result.openaiRuntime = {
  package: openai.package,
  version: openai.version,
  license: openai.license,
  source: openai.source,
  checkedAt: openai.checkedAt,
  manifest: await fingerprint(path.join(openaiDirectory, 'manifest.json')),
  verifiedArtifactCount: openai.files.length,
  licenseFiles: ['LICENSE', 'NOTICE'].map((file) => ({ file, ...result.files[`openai/${file}`] })),
  archiveIntegrityMetadata: openai.integrity,
  archiveVerification:
    'Archive is not distributed or rehashed by this verifier. Every distributed artifact is checked against manifest SHA-256 and byte count.',
};
result.checks.push({
  name: 'OpenAI-runtime-artifacts-licenses-and-pinned-manifest-verified',
  status: 'pass',
});
const installerName = `EGE Cosmos Setup ${version}.exe`;
result.files.installer = await fingerprint(path.join(root, 'release/offline-kit', installerName));
assert.deepEqual(
  result.files.installer,
  await fingerprint(path.join(root, 'release', installerName)),
  'Offline kit installer must match the latest built installer',
);
result.checks.push({ name: 'offline-kit-installer-matches-built-installer', status: 'pass' });
result.limit =
  'File integrity and installation contents only. No installer, EXE, model or authentication operation is run. Earlier release UI or live-model evidence is not imported or attributed to this build.';
result.behaviouralVerification = {
  nativeUI: 'not-run-by-this-verifier',
  managedAuthentication: 'not-run-by-this-verifier',
  liveOpenAI: 'not-run-by-this-verifier',
  localModels: 'not-run-by-this-verifier',
};
const report = `docs/verification/release-verification-${version}.json`;
await fs.mkdir('docs/verification', { recursive: true });
await fs.writeFile(report, JSON.stringify(result, null, 2));
await fs.writeFile('docs/verification/release-verification.json', JSON.stringify(result, null, 2));
console.log(
  JSON.stringify(
    {
      at: result.at,
      applicationVersion: result.applicationVersion,
      checks: result.checks,
      appAsar: result.files['resources/app.asar'],
      runtimeFolders: result.runtimeFolders,
      officialPDFs: result.officialPDFs,
      schoolSources: result.schoolSources,
      installer: result.files.installer,
      openaiRuntime: result.openaiRuntime,
      report,
      limit: result.limit,
    },
    null,
    2,
  ),
);
