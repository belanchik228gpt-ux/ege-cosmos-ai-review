import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const subjects = require('../shared/school-subjects.json');
const {
  validateTutorRequest,
  tutorBaseInstructions,
  BASE_INSTRUCTIONS,
} = require('../desktop/openai-tutor.cjs');
const { exportDocument } = require('../desktop/documents.cjs');
const parent = path.resolve('test-results');
const created: string[] = [];
async function exportRoot() {
  await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, 'school-exports-'));
  created.push(root);
  return root;
}
afterEach(async () => {
  for (const root of created.splice(0)) {
    const relative = path.relative(parent, path.resolve(root));
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative))
      throw Error('Unsafe test cleanup');
    await fs.rm(root, { recursive: true, force: true });
  }
});
const request = {
  conversationId: 'school-physics-8',
  subject: 'physics',
  mode: 'school',
  grade: 8,
  instructions: 'Сейчас объясняем тепловые явления.',
  messages: [{ role: 'user', content: 'Почему нагревается вода?' }],
};
describe('canonical school transport and export boundary', () => {
  it('preserves all 12 subjects without coercing them to mathematics', () => {
    expect(subjects).toHaveLength(12);
    for (const subject of subjects) {
      const accepted = validateTutorRequest({
        ...request,
        subject: subject.id,
        grade: subject.grades[0],
      });
      expect(accepted.subject).toBe(subject.id);
      expect(accepted.mode).toBe('school');
      expect(tutorBaseInstructions(accepted)).toContain(`Предмет: ${subject.title}.`);
      expect(tutorBaseInstructions(accepted)).toContain(`Класс: ${subject.grades[0]}.`);
    }
  });
  it('preserves default EGE instructions and does not force them into eighth-grade physics', () => {
    expect(tutorBaseInstructions({ subject: 'math' })).toContain(BASE_INSTRUCTIONS);
    expect(tutorBaseInstructions({ mode: 'ege', subject: 'math' })).toContain(BASE_INSTRUCTIONS);
    expect(tutorBaseInstructions({ subject: 'math' })).not.toContain('Класс: 8.');
    expect(BASE_INSTRUCTIONS).toContain('школьника 10 класса, готовящегося к ЕГЭ');
    const school = tutorBaseInstructions(validateTutorRequest(request));
    expect(school).not.toContain('готовящегося к ЕГЭ');
    expect(school).not.toContain('школьника 10 класса');
    expect(school).toContain('Класс: 8.');
    expect(school).toContain('не является учебником');
    expect(school).toContain('учебный код как текст');
    expect(school).toContain('по-английски');
  });
  it.each([
    { subject: '../../math' },
    { subject: 'Физика' },
    { subject: 'unknown' },
    { grade: 6 },
    { grade: 12 },
    { grade: '8' },
    { mode: 'other' },
    { subject: 'social', grade: 8 },
    { subject: 'music', grade: 9 },
    { subject: 'project', grade: 8 },
  ])('rejects invalid subject/mode/class %j before transport', (changes) => {
    expect(() => validateTutorRequest({ ...request, ...changes })).toThrow();
  });
  it('writes actual school files into Russian subject folders, separated from EGE', async () => {
    const directory = await exportRoot();
    for (const subject of subjects) {
      const result = await exportDocument(
        {
          mode: 'school',
          grade: subject.grades[0],
          subject: subject.id,
          title: subject.title + ' · заметки',
          content: 'Факт записан учеником.',
          format: 'txt',
        },
        { documentsDir: directory },
      );
      expect(result.ok).toBe(true);
      expect(path.relative(directory, result.path).split(path.sep).slice(0, 2)).toEqual([
        'Школа',
        subject.title,
      ]);
      expect(await fs.readFile(result.path, 'utf8')).toContain('Факт записан учеником.');
    }
    const ege = await exportDocument(
      { subject: 'math', title: 'ЕГЭ', content: 'Прежний путь', format: 'txt' },
      { documentsDir: directory },
    );
    expect(path.relative(directory, ege.path).split(path.sep)[0]).toBe('math');
  });
  it.each(['txt', 'md', 'html', 'docx'])(
    'creates a real %s export without changing the school subject',
    async (format) => {
      const directory = await exportRoot();
      const result = await exportDocument(
        {
          mode: 'school',
          grade: 8,
          subject: 'physics',
          title: 'Тепловые явления',
          content: '## Температура\nПример ученика: $T=25$.\n<script>danger()</script>',
          format,
        },
        { documentsDir: directory },
      );
      const bytes = await fs.readFile(result.path);
      expect(bytes.length).toBeGreaterThan(25);
      expect(path.extname(result.path)).toBe('.' + format);
      if (format === 'html') {
        expect(bytes.toString()).not.toContain('<script>danger()');
        expect(bytes.toString()).toContain('Тепловые явления');
        expect(bytes.toString()).not.toContain('Математика');
      }
      if (format === 'docx') expect(bytes.subarray(0, 2).toString()).toBe('PK');
    },
  );
  it('invalid school export rejects instead of creating a mathematics file', async () => {
    const directory = await exportRoot();
    await expect(
      exportDocument(
        { mode: 'school', subject: 'arbitrary', title: 'x', content: 'x', format: 'txt' },
        { documentsDir: directory },
      ),
    ).rejects.toThrow();
    await expect(
      exportDocument(
        { mode: 'school', subject: 'music', grade: 11, title: 'x', content: 'x', format: 'txt' },
        { documentsDir: directory },
      ),
    ).rejects.toThrow();
    expect(await fs.readdir(directory)).toEqual([]);
  });
});
