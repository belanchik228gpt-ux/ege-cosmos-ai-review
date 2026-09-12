import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';

// This file only runs when explicitly invoked after installation is complete.
const root = process.cwd();
const executable = path.resolve(process.env.COSMOS_EXE || 'test-results/installed-app/EGE Cosmos.exe');
const asar = path.join(path.dirname(executable), 'resources/app.asar');
const hash = async () => createHash('sha256').update(await readFile(asar)).digest('hex');
const expectedSha256 = process.env.COSMOS_EXPECTED_ASAR || await hash();
const folder = path.resolve('docs/verification/installed-visual-run');
await mkdir(folder, { recursive: true });
const scripts = [
  ['interface-motion', 'docs/interface-review/motion-proof.mjs'],
  ['all-13-scenes', 'scripts/all-native-scenes.mjs'],
  ['scene-pause', 'docs/scene-review/motion-v2/native-pause-proof.mjs'],
  ['median-label-sync', 'docs/scene-review/motion-v2/label-sync-proof.mjs'],
];
const steps = [];
let failure;
try {
  for (const [name, script] of scripts) {
    assert.equal(await hash(), expectedSha256, 'Installed app.asar changed during the visual audit');
    console.log(`Starting ${name}`);
    const startedAt = new Date().toISOString();
    let output = '';
    const exitCode = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [script], {
        cwd: root,
        env: { ...process.env, COSMOS_EXE: executable },
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      child.stdout.on('data', value => { output += value.toString(); });
      child.stderr.on('data', value => { output += value.toString(); });
      child.on('error', reject);
      child.on('close', resolve);
    });
    await writeFile(path.join(folder, `${name}.log`), output);
    steps.push({ name, script, startedAt, endedAt: new Date().toISOString(), exitCode });
    assert.equal(exitCode, 0, `${name} failed; inspect its saved log`);
    console.log(`Passed ${name}`);
  }
  assert.equal(await hash(), expectedSha256);
} catch (error) {
  failure = String(error?.stack ?? error);
  throw error;
} finally {
  await writeFile(path.join(folder, 'run.json'), JSON.stringify({
    at: new Date().toISOString(), executable, appAsarSha256: expectedSha256,
    policy: 'Separate profiles; sequential native windows; no local model invoked',
    passed: !failure && steps.length === scripts.length, steps, failure,
  }, null, 2));
}
