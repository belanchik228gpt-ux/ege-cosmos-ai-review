import { describe, expect, it } from 'vitest';
import {
  authoredTopicMarkdown,
  documentTopics,
  topicIllustration,
} from '../shared/document-topics.mjs';
import {
  extractTeachingSpread,
  paginateText,
  renderDocument,
} from '../shared/document-renderer.mjs';
import { buildDocumentContent } from '../src/domain/document-content';
import { createState, topics } from '../src/domain';
import { getSource } from '../src/domain/sources';
import { version as applicationVersion } from '../package.json';

describe('editable local educational album', () => {
  it('uses the actual application version when a new source snapshot is created', () => {
    expect(getSource('cosmos-training')!.version).toContain(`Приложение ${applicationVersion}`);
    const doc = buildDocumentContent(createState('Тест'), {
      type: 'Конспект занятия',
      subject: 'math',
      topicId: 'math-absolute',
    });
    expect(doc.content).toContain(`Приложение ${applicationVersion}`);
  });
  it.each(['comfortable', 'large'])(
    'keeps a heading with the whole first flow paragraph at %s size',
    (scale) => {
      const content =
        '# Документ\n' +
        Array.from({ length: 11 }, (_, i) => `Предыдущая строка ${i + 1}.`).join('\n') +
        '\n## Опорный материал темы\n' +
        'Этот абзац объясняет расстояние от нуля до числа на числовой прямой. '.repeat(5);
      const columns = paginateText(content, scale).flat();
      const column = columns.find((blocks) =>
        blocks.some((block) => block.text === 'Опорный материал темы'),
      )!;
      const index = column.findIndex((block) => block.text === 'Опорный материал темы');
      expect(column[index + 1]?.text).toContain('Этот абзац объясняет расстояние');
      expect(columns.every((blocks) => blocks.at(-1)?.type !== 'heading')).toBe(true);
    },
  );
  it('moves a short answer list as a whole and retains every item of a long list', () => {
    const short =
      '# Документ\n' +
      Array.from({ length: 11 }, (_, i) => `Предыдущая строка ${i + 1}.`).join('\n') +
      '\n## Ответы для самопроверки\n' +
      Array.from({ length: 5 }, (_, i) => `${i + 1}. Короткий ответ ${i + 1}.`).join('\n');
    const columns = paginateText(short).flat();
    const answerColumns = columns.filter((blocks) =>
      blocks.some((block) => /Короткий ответ/.test(block.text)),
    );
    expect(answerColumns).toHaveLength(1);
    expect(answerColumns[0].filter((block) => /Короткий ответ/.test(block.text))).toHaveLength(5);
    expect(answerColumns[0].some((block) => block.text === 'Ответы для самопроверки')).toBe(true);

    const long =
      '# Документ\n## Подробная личная заметка\n' +
      Array.from(
        { length: 24 },
        (_, i) =>
          `${i + 1}. Пункт ${i + 1}: ` +
          'Сохраняю свой ход рассуждения и проверяю промежуточный результат. '.repeat(7),
      ).join('\n');
    const longPages = paginateText(long);
    const allText = longPages
      .flat(2)
      .map((block) => block.text)
      .join(' ');
    expect(longPages.length).toBeGreaterThan(1);
    for (let i = 1; i <= 24; i++) expect(allText).toContain(`Пункт ${i}:`);
    expect(allText.match(/Сохраняю свой ход рассуждения/g)).toHaveLength(24 * 7);
  });
  it('has a labelled authored two-example spread and native SVG for all current topics', () => {
    expect(Object.keys(documentTopics)).toHaveLength(topics.length);
    for (const topic of topics) {
      const content = authoredTopicMarkdown(topic.id);
      expect(content).toContain('а не решения или результаты ученика');
      expect(extractTeachingSpread(content, topic.id)?.examples).toHaveLength(2);
      expect(extractTeachingSpread(content, topic.id, 'large')?.examples).toHaveLength(2);
      expect(topicIllustration(topic.id)).toContain('<svg');
    }
  });
  it('keeps the complete absolute-value lesson in a dark illustrated spread and supplementary pages', () => {
    const content = authoredTopicMarkdown('math-absolute');
    const spread = extractTeachingSpread(content, 'math-absolute');
    expect(spread).not.toBeNull();
    expect(extractTeachingSpread(content, 'math-absolute', 'large')).not.toBeNull();
    expect(spread!.fields['Формула или вывод']).toContain('a < 0 → корней нет');
    expect(spread!.examples[0].text).toContain('|−1 − 2| = 3; |5 − 2| = 3');
    expect(spread!.remaining).toContain('## Ошибки, которых можно избежать');
    expect(spread!.remaining).toContain('## Самопроверка');
    expect(spread!.remaining).toContain('x = −5 или x = 3');
    const html = renderDocument({
      title: 'Модуль: мой конспект',
      topicId: 'math-absolute',
      content,
    });
    expect(html).toContain('class="cosmos comfortable"');
    expect(html).toContain('class="album-page teaching"');
    expect(html).toContain('Центр 2 · корни −1 и 5');
    expect(html).toContain('Ответы для самопроверки');
    expect(html).toContain('только при x + 2 = 0 модуль равен нулю');
    expect(topicIllustration('math-absolute')).not.toContain('>Cosmos<');
  });
  it('uses edited rules and examples in the shared preview/export renderer', () => {
    const content = authoredTopicMarkdown('math-rectangle')
      .replace('S = a · b', 'Моя формула: S = a · b')
      .replace('b = 4 см', 'Моя запись: b = 4 см');
    const html = renderDocument({ title: 'Мой альбом', topicId: 'math-rectangle', content });
    expect(html).toContain('Моя формула: S = a · b');
    expect(html).toContain('Моя запись: b = 4 см');
    expect(html).toContain('class="album-page teaching"');
  });
  it('escapes all caller text and never accepts SVG or model HTML as markup', () => {
    const content =
      authoredTopicMarkdown('math-rectangle').replace('7 см', '<script>alert(1)</script>') +
      '\n\n## <img src=x onerror=alert(1)>\n<script>location=1</script>';
    const html = renderDocument({ title: '<iframe>', content, topicId: 'math-rectangle' });
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<iframe>');
    expect(html).not.toContain('<img src=');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain("default-src 'none'");
  });
  it('retains oversize or unrecognised edits in readable generic pages', () => {
    const extra = 'Длинная личная заметка. '.repeat(90);
    const content = authoredTopicMarkdown('math-rectangle').replace(
      '### Определение',
      `### Новый раздел\n${extra}\n### Определение`,
    );
    expect(extractTeachingSpread(content, 'math-rectangle')).toBeNull();
    const pages = paginateText(content);
    expect(pages.length).toBeGreaterThan(1);
    const text = pages
      .flat(2)
      .map((block) => block.text)
      .join(' ');
    expect(text.match(/Длинная личная заметка/g)).toHaveLength(90);
    expect(text).toContain('b = 4 см');
  });
  it('retains source snapshots and does not turn an authored example into learner achievement', () => {
    const state = createState('Тест');
    const doc = buildDocumentContent(state, {
      type: 'Конспект занятия',
      subject: 'math',
      topicId: 'math-rectangle',
    });
    expect(doc.content).toContain('Авторские учебные примеры Cosmos');
    expect(doc.content).toContain('Занятие не выбрано');
    for (const url of doc.sources)
      expect(renderDocument({ ...doc })).toContain(url.replaceAll('&', '&amp;'));
  });
  it('applies theme and readable size without changing or losing user content', () => {
    const content = '# Заголовок\n\n## Заметка\nТекст моей заметки.';
    expect(
      renderDocument({ title: 'Заголовок', content, style: 'paper', scale: 'large' }),
    ).toContain('class="paper large"');
    expect(renderDocument({ title: 'Заголовок', content })).toContain('class="cosmos comfortable"');
    expect(renderDocument({ title: 'Заголовок', content, style: 'paper' })).toContain(
      'Текст моей заметки.',
    );
  });
});
