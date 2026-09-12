// No BrowserWindow is opened. Real Electron nativeImage + real local llama workers.
const { app, nativeImage } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { LocalModel } = require('../desktop/local-model.cjs');
const { ImageReader } = require('../desktop/image-reader.cjs');
const root = path.resolve(__dirname, '..'),
  out = path.join(root, 'docs/verification/vision-runtime');
const userData = path.join(root, 'test-results/vision-runtime-' + Date.now());
app.setPath('userData', userData);
let model, reader;
const report = {
  at: new Date().toISOString(),
  status: 'running',
  fixtureKind: 'Author-created printed QA images; not pupil photographs',
  checks: [],
  logs: [],
};
const log = (scope, message) => {
  report.logs.push({ scope, message });
  console.log(scope, message);
};
async function textQuestion(width) {
  const started = Date.now();
  const reply = await model.ask({
    subject: 'math',
    topic: 'Площадь прямоугольника',
    message: `Как найти площадь прямоугольника со сторонами 7 и ${width}? Объясни первый шаг.`,
    evidence: [
      {
        id: `math-${width}`,
        text: `У прямоугольника стороны 7 см и ${width} см. Площадь прямоугольника равна произведению его длины и ширины: S = a × b. Здесь S = 7 × ${width} = ${7 * width} см². При заполнении единичными клетками в одном ряду 7 клеток, рядов ${width}.`,
        sourceIds: ['cosmos-training'],
      },
    ],
  });
  report.checks.push({ kind: 'live-text', width, totalElapsedMs: Date.now() - started, ...reply });
  return reply;
}
app
  .whenReady()
  .then(async () => {
    await fs.mkdir(out, { recursive: true });
    await fs.mkdir(userData, { recursive: true });
    await fs.writeFile(path.join(userData, 'model.json'), JSON.stringify({ backend: 'gpu' }));
    model = new LocalModel({ runtimeDir: path.join(root, 'runtime'), userData, log });
    reader = new ImageReader({
      runtimeDir: path.join(root, 'runtime'),
      userData,
      log,
      nativeImage,
      textModel: model,
    });
    const fixtures = JSON.parse(
      await fs.readFile(path.join(out, 'fixtures.json'), 'utf8'),
    ).fixtures;
    try {
      if (process.argv.includes('--sequence')) await textQuestion(4);
      for (const fixture of fixtures) {
        const image = await fs.readFile(path.join(out, fixture.file));
        const result = await reader.read({
          dataUrl: 'data:image/png;base64,' + image.toString('base64'),
          subject: fixture.id === 'russian' ? 'russian' : 'math',
        });
        const normalize = (text) => String(text).normalize('NFC').replace(/\s+/g, ' ').trim();
        const exactTextMatch = normalize(result.text) === normalize(fixture.expected);
        report.checks.push({
          kind: 'actual-local-vision',
          fixture: fixture.id,
          expected: fixture.expected,
          exactTextMatch,
          ...result,
        });
        await fs.writeFile(path.join(out, 'result.json'), JSON.stringify(report, null, 2));
        assert.ok(result.ok, `${fixture.id}: ${result.error}`);
        assert.equal(result.method, 'local-vision');
        assert.equal(
          exactTextMatch,
          true,
          `${fixture.id}: recognized text differs from the authored test oracle`,
        );
        assert.equal(model.externalBusy, false);
        assert.equal(reader.worker.child, null);
      }
      if (process.argv.includes('--sequence')) await textQuestion(3);
      report.status = report.checks.every((check) => check.ok) ? 'pass' : 'partial';
    } catch (error) {
      report.status = 'fail';
      report.error = error.message;
      process.exitCode = 1;
    } finally {
      reader?.cancel();
      await model?.stopAndWait();
      report.finishedAt = new Date().toISOString();
      await fs.writeFile(path.join(out, 'result.json'), JSON.stringify(report, null, 2));
      app.exit(process.exitCode || 0);
    }
  })
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
