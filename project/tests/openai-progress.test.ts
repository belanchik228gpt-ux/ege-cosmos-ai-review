import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { extractPartialTutorText: extract } = require('../desktop/openai-progress.cjs');

describe('bounded JSON prefix text extraction', () => {
  it('decodes text across every possible Unicode/escape split without leaking envelope fields', () => {
    const text = 'Привет 🌍!\nКорень \\sqrt{x}, "кавычки", / и табуляция\t.';
    const raw = JSON.stringify({
      title: 'Не передавать',
      scene: { text: 'Вложенный текст' },
      text,
      phase: 'explain',
    });
    for (let index = 1; index <= raw.length; index++) {
      const partial = extract(raw.slice(0, index));
      expect(partial.valid, `prefix ${index}`).toBe(true);
      expect(text.startsWith(partial.text), `text prefix ${index}`).toBe(true);
      expect(partial.text).not.toContain('Не передавать');
      expect(partial.text).not.toContain('Вложенный текст');
    }
    expect(extract(raw)).toEqual({ valid: true, text, complete: true });
  });
  it('decodes escaped field names and waits for complete surrogate pairs', () => {
    expect(extract('{"te\\u0078t":"A\\uD83D')).toMatchObject({ valid: true, text: 'A' });
    expect(extract('{"te\\u0078t":"A\\uD83D\\uDE00')).toMatchObject({ valid: true, text: 'A😀' });
    expect(extract('{"text":"\\uD83D"}').valid).toBe(false);
    expect(extract('{"text":"\\uDE00"}').valid).toBe(false);
  });
  it.each([
    'raw text',
    '[{"text":"not top-level"}]',
    '{"text":123}',
    '{"text":"bad\\q"}',
    '{"text":"line\nbreak"}',
    '{"text":"ok",}',
    '{"text":"ok"}TRAILING',
    '{"text":"one","text":"two"}',
    '{"scene":undefined,"text":"bad"}',
    '{"scene":{"a":01},"text":"bad"}',
  ])('rejects malformed input without decoded output: %s', (raw) => {
    expect(extract(raw)).toEqual({ valid: false, text: '' });
  });
  it('never mistakes nested arrays, escaped quote text or similar keys for top-level text', () => {
    const raw = JSON.stringify({
      scene: [{ text: 'SECRET', sample: '\"text\":\"FAKE\"' }],
      context: 'SECRET2',
      text: 'Только ответ',
    });
    expect(extract(raw).text).toBe('Только ответ');
    expect(extract('{"scene":{"text":"SECRET"},"te').text).toBe('');
  });
  it('bounds raw bytes, decoded text and nesting, retaining only valid prefixes', () => {
    expect(extract('{"text":"' + 'x'.repeat(16001)).valid).toBe(false);
    expect(extract(' '.repeat(32001)).valid).toBe(false);
    expect(extract('{"scene":' + '['.repeat(15)).valid).toBe(false);
    expect(extract('{"text":"' + 'x'.repeat(16000)).text).toHaveLength(16000);
  });
  it('allows non-text fields first and all JSON literals/numeric forms without displaying them', () => {
    const raw = '{"scene":{"a":[true,false,null,-1,2.5,3e+4]},"text":"Ответ"}';
    for (let index = 1; index <= raw.length; index++)
      expect(extract(raw.slice(0, index)).valid, `prefix ${index}`).toBe(true);
    expect(extract(raw).text).toBe('Ответ');
  });
});
