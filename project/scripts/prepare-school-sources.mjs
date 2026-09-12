// Prepare already verified official PDFs and their extracted page text for offline delivery.
// This build step never fetches URLs and the packaged application needs no Python/PDF parser.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const subjects = require('../shared/school-subjects.json');
const { createSchoolSourceLibrary } = require('../desktop/school-sources.cjs');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const inputDirectory = path.join(root, 'tmp/school-program');
const outputDirectory = path.join(root, 'resources/school-program');
const hash = (data) => createHash('sha256').update(data).digest('hex');
const inside = (base, file) => {
  const relative = path.relative(base, file);
  return (
    !!relative &&
    !path.isAbsolute(relative) &&
    relative !== '..' &&
    !relative.startsWith('..' + path.sep)
  );
};

export function schoolTextBundle(pages) {
  assert(
    Array.isArray(pages) &&
      pages.length > 0 &&
      pages.length <= 1000 &&
      pages.every((p) => typeof p === 'string'),
    'Invalid prepared PDF pages',
  );
  let text = '';
  const pageRanges = [];
  pages.forEach((page, index) => {
    text += `=== PDF PAGE ${index + 1} ===\n`;
    pageRanges.push([text.length, page.length]);
    text += page + '\n\n';
  });
  assert(text.length < 10 * 1024 * 1024, 'Prepared text size limit');
  return { text, pageRanges, textChars: text.length };
}
function identify(item, group) {
  if (group === 'project') {
    assert(item.id === 'fgos-project-requirements', 'Unrecognised project source');
    return {
      id: item.id,
      subject: 'project',
      grades: [10, 11],
      year: 2012,
      kind: 'standard',
      status: 'official-standard',
      title:
        'ФГОС среднего общего образования · приказ № 413 от 17.05.2012 · п. 11: индивидуальный проект · официальный файл ЕДСОО 2023',
    };
  }
  const stem = group === 'stem';
  const match = item.id.match(stem ? /^([a-z]+)-(ooo|soo)$/ : /^frp-([a-z]+)-/);
  const subject = subjects.find((s) => s.id === match?.[1]);
  assert(subject, `Unrecognised source subject: ${item.id}`);
  const upper = stem ? match[2] === 'soo' : item.id.includes('-10-11-');
  const grades = subject.id === 'social'
    ? [9, 10, 11]
    : subject.grades.filter(grade => upper ? grade >= 10 : grade <= 9);
  const originalGrades = upper
    ? '10–11'
    : stem
      ? {
          math: '5–9',
          biology: '5–9',
          geography: '5–9',
          physics: '7–9',
          informatics: '7–9',
          chemistry: '8–9',
        }[subject.id]
      : item.id
          .match(/-(\d+)-(\d+)-\d{4}$/)
          ?.slice(1)
          .join('–');
  return {
    id: stem ? `edsoo-program-${subject.id}-${upper ? '10-11' : '8-9'}-2025` : item.id,
    subject: subject.id,
    grades,
    year: subject.id === 'social' ? 2026 : 2025,
    kind: subject.id === 'social' ? 'guidance' : 'program',
    status: subject.id === 'social' ? 'official-guidance' : 'official-program',
    title:
      subject.id === 'social'
        ? 'Обществознание · официальное методическое письмо о переходе на новые программы, 2026'
        : `Федеральная рабочая программа · ${subject.title} · ${originalGrades} классы`,
  };
}
async function prepare() {
  const sources = [];
  for (const [group, manifestFile] of [
    ['stem', 'stem-manifest.json'],
    ['humanities', 'humanities/manifest.json'],
    ['project', 'humanities/project-manifest.json'],
  ]) {
    const items = JSON.parse(await fs.readFile(path.join(inputDirectory, manifestFile), 'utf8'));
    assert(Array.isArray(items) && items.length <= 100, 'Invalid input manifest');
    for (const item of items) {
      if (['frp-music-5-8-2025', 'frp-pe-5-9-2025', 'frp-pe-10-11-2025', 'frp-obzr-8-9-2025', 'frp-obzr-10-11-2025'].includes(item.id)) continue;
      assert(
        /^[a-z0-9-]{2,120}$/.test(item.id) && /^[a-f0-9]{64}$/.test(item.sha256),
        'Invalid input metadata',
      );
      const identity = identify(item, group);
      const pdf =
        group === 'stem' ? path.join(inputDirectory, `${item.id}.pdf`) : path.resolve(item.path);
      const real = await fs.realpath(pdf);
      assert(inside(inputDirectory, real), 'Source PDF escapes staging directory');
      const bytes = await fs.readFile(real);
      assert(
        bytes.subarray(0, 5).toString() === '%PDF-' && bytes.includes(Buffer.from('%%EOF')),
        'Input is not a complete PDF',
      );
      assert(
        hash(bytes) === item.sha256 && (!item.bytes || bytes.length === item.bytes),
        `Source PDF changed: ${item.id}`,
      );
      assert(bytes.length <= 40 * 1024 * 1024, 'Source PDF size limit');
      const jsonFile =
        group === 'stem'
          ? path.join(inputDirectory, `${item.id}.json`)
          : path.join(path.dirname(real), `${item.id}.pages.json`);
      const realJson = await fs.realpath(jsonFile);
      assert(inside(inputDirectory, realJson), 'Source text escapes staging directory');
      const pages = JSON.parse(await fs.readFile(realJson, 'utf8'));
      assert(pages.length === item.pages, `Source page count mismatch: ${item.id}`);
      const bundle = schoolTextBundle(pages),
        textBytes = Buffer.from(bundle.text, 'utf8');
      const url = new URL(item.url);
      assert(
        url.protocol === 'https:' &&
          ['edsoo.ru', 'www.edsoo.ru'].includes(url.hostname) &&
          !url.username &&
          !url.password &&
          !url.port,
        'Unofficial source URL',
      );
      sources.push({
        metadata: {
          ...identity,
          url: item.url,
          checkedAt: '2026-09-09',
          pageCount: pages.length,
          file: `${identity.id}.pdf`,
          pdfBytes: bytes.length,
          pdfSha256: hash(bytes),
          textFile: `${identity.id}.txt`,
          textBytes: textBytes.length,
          textSha256: hash(textBytes),
          textChars: bundle.textChars,
          pageRanges: bundle.pageRanges,
        },
        bytes,
        textBytes,
      });
    }
  }
  assert(
    new Set(sources.map((s) => s.metadata.id)).size === sources.length,
    'Duplicate source ids',
  );
  await fs.mkdir(outputDirectory, { recursive: true });
  for (const source of sources) {
    await fs.writeFile(path.join(outputDirectory, source.metadata.file), source.bytes);
    await fs.writeFile(path.join(outputDirectory, source.metadata.textFile), source.textBytes);
  }
  const manifest = {
    version: 1,
    checkedAt: '2026-09-09',
    documents: sources.map((s) => s.metadata),
  };
  await fs.writeFile(
    path.join(outputDirectory, 'manifest.json.tmp'),
    JSON.stringify(manifest, null, 2) + '\n',
  );
  await fs.rename(
    path.join(outputDirectory, 'manifest.json.tmp'),
    path.join(outputDirectory, 'manifest.json'),
  );
  return manifest;
}
async function verify() {
  const manifest = JSON.parse(
    await fs.readFile(path.join(outputDirectory, 'manifest.json'), 'utf8'),
  );
  const library = createSchoolSourceLibrary({ directory: outputDirectory });
  const listed = await library.list();
  assert.equal(listed.length, manifest.documents.length, 'Runtime rejected a packaged source');
  let totalPdfBytes = 0,
    totalTextBytes = 0,
    pages = 0;
  for (const document of manifest.documents) {
    const pdf = await fs.readFile(path.join(outputDirectory, document.file));
    assert(
      pdf.length === document.pdfBytes &&
        hash(pdf) === document.pdfSha256 &&
        pdf.subarray(0, 5).toString() === '%PDF-',
      'Packaged PDF integrity failure',
    );
    const excerpt = await library.read({ id: document.id, page: 1, maxChars: 6000 });
    assert(
      excerpt.ok &&
        excerpt.source.id === document.id &&
        excerpt.fragments.reduce((n, f) => n + f.text.length, 0) <= 6000,
      'Runtime text extraction failed',
    );
    totalPdfBytes += document.pdfBytes;
    totalTextBytes += document.textBytes;
    pages += document.pageCount;
  }
  library.close();
  return {
    documents: listed.length,
    pages,
    totalPdfBytes,
    totalTextBytes,
    subjects: [...new Set(listed.map((d) => d.subject))],
    allHashesMatched: true,
    runtimeExcerptChecksPassed: true,
  };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv.includes('--check')) await prepare();
  console.log(JSON.stringify(await verify(), null, 2));
}
