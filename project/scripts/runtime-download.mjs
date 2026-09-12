import { createWriteStream, createReadStream } from 'node:fs';
import { mkdir, rename, stat, writeFile, open } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

// Pinned, upstream-distributed artifacts. Hashes come from GitHub release metadata
// and Hugging Face LFS metadata. No executable runs before integrity verification.
const root = resolve(import.meta.dirname, '../runtime');
const release = 'b10850';
const modelRevision = '7c41481f57cb95916b40956ab2f0b139b296d974';
const downloads = [
  [
    'downloads/llama-cuda.zip',
    `https://github.com/ggml-org/llama.cpp/releases/download/${release}/llama-${release}-bin-win-cuda-12.4-x64.zip`,
    'fbc41e0316fffe4d9facc3039da3b0cf92f2ced6e485e186ace7efe7c8071878',
  ],
  [
    'downloads/cudart.zip',
    `https://github.com/ggml-org/llama.cpp/releases/download/${release}/cudart-llama-bin-win-cuda-12.4-x64.zip`,
    '8c79a9b226de4b3cacfd1f83d24f962d0773be79f1e7b75c6af4ded7e32ae1d6',
  ],
  [
    'downloads/llama-cpu.zip',
    `https://github.com/ggml-org/llama.cpp/releases/download/${release}/llama-${release}-bin-win-cpu-x64.zip`,
    '81ca2a421742096456e748b0dc65d9baa94af60e00dd0f5f27bca6f2d7c5011d',
  ],
  [
    'models/Qwen3-8B-Q4_K_M.gguf',
    `https://huggingface.co/Qwen/Qwen3-8B-GGUF/resolve/${modelRevision}/Qwen3-8B-Q4_K_M.gguf`,
    'd98cdcbd03e17ce47681435b5150e34c1417f50b5c0019dd560e4882c5745785',
  ],
];
async function hashFile(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file, { highWaterMark: 2 * 1024 * 1024 }))
    hash.update(chunk);
  return hash.digest('hex');
}
async function download([relative, url, expected]) {
  const file = resolve(root, relative);
  await mkdir(resolve(file, '..'), { recursive: true });
  if (await stat(file).catch(() => null)) {
    if ((await hashFile(file)) === expected) {
      console.log(`${relative}: verified existing file`);
      return;
    }
    throw new Error(`${relative}: existing file has a different SHA256; inspect it manually`);
  }
  if (relative === 'models/Qwen3-8B-Q4_K_M.gguf' || relative === 'downloads/cudart.zip') {
    await rangedDownload(
      file,
      relative,
      url,
      expected,
      relative.startsWith('models') ? 5027783488 : 391443627,
    );
    return;
  }
  let last = Date.now(),
    bytes = 0;
  const response = await fetch(url, { signal: AbortSignal.timeout(45 * 60 * 1000) });
  if (!response.ok) throw new Error(`${relative}: HTTP ${response.status}`);
  const hash = createHash('sha256');
  await pipeline(
    response.body,
    new Transform({
      transform(chunk, encoding, callback) {
        hash.update(chunk);
        bytes += chunk.length;
        if (Date.now() - last > 30000) {
          console.log(`${relative}: ${(bytes / 1024 / 1024).toFixed(0)} MiB`);
          last = Date.now();
        }
        callback(null, chunk);
      },
    }),
    createWriteStream(file + '.part'),
  );
  if (hash.digest('hex') !== expected)
    throw new Error(`${relative}: SHA256 mismatch; partial file retained`);
  await rename(file + '.part', file);
  console.log(`${relative}: complete, SHA256 verified`);
}
async function rangedDownload(file, label, url, expected, total) {
  const prefix = await stat(file + '.part')
    .then((s) => s.size)
    .catch(() => 0);
  const chunks = [],
    chunkSize = (label.startsWith('models') ? 128 : 16) * 1024 * 1024;
  for (let start = prefix; start < total; start += chunkSize)
    chunks.push([start, Math.min(total - 1, start + chunkSize - 1)]);
  let next = 0,
    downloaded = prefix;
  const timer = setInterval(
    () =>
      console.log(
        `${label}: ${(downloaded / 1024 / 1024).toFixed(0)} / ${(total / 1024 / 1024).toFixed(0)} MiB`,
      ),
    30000,
  );
  try {
    await Promise.all(
      Array.from({ length: Math.min(chunks.length, 16) }, async () => {
        for (;;) {
          const index = next++;
          if (index >= chunks.length) return;
          const [start, end] = chunks[index];
          const chunkFile = file + `.range-${start}-${end}`;
          if (
            await stat(chunkFile)
              .then((s) => s.size === end - start + 1)
              .catch(() => false)
          ) {
            downloaded += end - start + 1;
            continue;
          }
          let attempts = 0;
          for (;;) {
            const already = await stat(chunkFile + '.part')
              .then((s) => s.size)
              .catch(() => 0);
            try {
              const response = await fetch(url, {
                headers: { Range: `bytes=${start + already}-${end}` },
                signal: AbortSignal.timeout(20 * 60 * 1000),
              });
              if (
                response.status !== 206 ||
                response.headers.get('content-range') !== `bytes ${start + already}-${end}/${total}`
              )
                throw new Error('Invalid range response');
              await pipeline(
                response.body,
                new Transform({
                  transform(chunk, encoding, callback) {
                    downloaded += chunk.length;
                    callback(null, chunk);
                  },
                }),
                createWriteStream(chunkFile + '.part', { flags: 'a' }),
              );
              if ((await stat(chunkFile + '.part')).size !== end - start + 1)
                throw new Error('Range size mismatch');
              await rename(chunkFile + '.part', chunkFile);
              break;
            } catch (error) {
              if (++attempts >= 3) throw error;
            }
          }
        }
      }),
    );
  } finally {
    clearInterval(timer);
  }
  console.log(`${label}: assembling and verifying SHA256`);
  const output = await open(file + '.assembled', 'w'),
    hash = createHash('sha256');
  try {
    for (const part of [
      ...(prefix ? [file + '.part'] : []),
      ...chunks.map(([start, end]) => file + `.range-${start}-${end}`),
    ]) {
      for await (const chunk of createReadStream(part, { highWaterMark: 2 * 1024 * 1024 })) {
        hash.update(chunk);
        await output.writeFile(chunk);
      }
    }
  } finally {
    await output.close();
  }
  if (
    hash.digest('hex') !== expected ||
    (await stat(file + '.assembled')).size !== total ||
    (await hashFile(file + '.assembled')) !== expected
  )
    throw new Error(`${label}: SHA256 mismatch`);
  await rename(file + '.assembled', file);
  console.log(`${label}: complete, SHA256 verified`);
}
await Promise.all(downloads.map(download));
await mkdir(resolve(root, 'licenses'), { recursive: true });
for (const [name, url] of [
  [
    'Qwen3-LICENSE.txt',
    `https://huggingface.co/Qwen/Qwen3-8B-GGUF/resolve/${modelRevision}/LICENSE`,
  ],
  [
    'llama.cpp-LICENSE.txt',
    `https://raw.githubusercontent.com/ggml-org/llama.cpp/${release}/LICENSE`,
  ],
  [
    'Qwen3-MODEL-CARD.md',
    `https://huggingface.co/Qwen/Qwen3-8B-GGUF/resolve/${modelRevision}/README.md`,
  ],
]) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`License download HTTP ${response.status}`);
  await writeFile(resolve(root, 'licenses', name), await response.text());
}
await writeFile(
  resolve(root, 'artifacts.json'),
  JSON.stringify(
    { release, modelRevision, downloads, verifiedAt: new Date().toISOString() },
    null,
    2,
  ),
);
console.log('Downloads verified. Extract ZIP files to runtime/llama and runtime/llama-cpu.');
