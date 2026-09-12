import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';

import { createHash } from 'node:crypto';
import path from 'node:path';
import { spawn } from 'node:child_process';

// Official Qwen repository, immutable revision and upstream LFS SHA-256 metadata.
const runtime = path.resolve(import.meta.dirname, '../runtime');
const repository = 'Qwen/Qwen3-VL-4B-Instruct-GGUF';
const revision = '1cd86afb9a95c410a6038ab3b40d8b578c892266';
const files = [
  {
    file: 'Qwen3VL-4B-Instruct-Q4_K_M.gguf',
    bytes: 2497281664,
    sha256: '66358cb18bb6b3b1b6675aa412c7a88ef01d228f481184d13668e5201c730a0a',
    role: 'language-model',
  },
  {
    file: 'mmproj-Qwen3VL-4B-Instruct-F16.gguf',
    bytes: 836180256,
    sha256: '256f3a43bd4205ffef48d6b92715e1e70b5b0e9aef06522584967513a9985331',
    role: 'vision-projector',
  },
].map((file) => ({
  ...file,
  relative: `models/vision/${file.file}`,
  url: `https://huggingface.co/${repository}/resolve/${revision}/${file.file}`,
}));
async function sha256(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
async function reliableDownload(artifact) {
  const destination = path.join(runtime, artifact.relative);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  if (await fs.stat(destination).catch(() => null)) {
    if (
      (await fs.stat(destination)).size !== artifact.bytes ||
      (await sha256(destination)) !== artifact.sha256
    )
      throw new Error(`Existing artifact mismatch: ${artifact.file}`);
    console.log(`VERIFIED ${artifact.file}`);
    return;
  }
  if (process.argv.includes('--check')) throw new Error(`Missing artifact: ${artifact.file}`);
  const bundled = path.join(
    process.env.USERPROFILE || '',
    '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe',
  );
  const python =
    process.env.COSMOS_PYTHON || ((await fs.stat(bundled).catch(() => null)) ? bundled : 'python');
  await new Promise((resolve, reject) => {
    const child = spawn(python, [path.join(import.meta.dirname, 'vision-download-worker.py')], {
      windowsHide: true,
      stdio: ['pipe', 'inherit', 'inherit'],
    });
    const timeout = setTimeout(
      () => {
        child.kill();
        reject(new Error('Vision artifact download deadline: 45 minutes'));
      },
      45 * 60 * 1000,
    );
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      code === 0 ? resolve() : reject(new Error(`Vision download exited ${code}`));
    });
    child.stdin.end(JSON.stringify({ ...artifact, destination }));
  });
}
await Promise.all(files.map(reliableDownload));
await fs.mkdir(path.join(runtime, 'licenses'), { recursive: true });
if (!process.argv.includes('--check')) {
  const card = await fetch(`https://huggingface.co/${repository}/resolve/${revision}/README.md`, {
    signal: AbortSignal.timeout(30000),
  });
  if (!card.ok) throw new Error(`Model card HTTP ${card.status}`);
  await fs.writeFile(path.join(runtime, 'licenses/Qwen3-VL-MODEL-CARD.md'), await card.text());
  // Both official model cards declare Apache-2.0; keep the complete license with the bundle.
  await fs.copyFile(
    path.join(runtime, 'licenses/Qwen3-LICENSE.txt'),
    path.join(runtime, 'licenses/Qwen3-VL-LICENSE.txt'),
  );
  await fs.writeFile(
    path.join(runtime, 'vision-artifacts.json'),
    JSON.stringify(
      {
        version: 1,
        repository,
        revision,
        license: 'Apache-2.0',
        checkedAt: new Date().toISOString(),
        files,
      },
      null,
      2,
    ),
  );
}
console.log('Vision artifacts verified. No model was launched.');
