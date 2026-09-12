import { describe, expect, it } from 'vitest';
import { matchesSearchText } from '../src/ui/search-text';
import { radicalTopic } from '../src/domain/radical-topic';

describe('comfortable topic search', () => {
  it.each(['корни модуль', 'МОДУЛЬ корни', '  корни,   модуль ', 'корни — модуль'])(
    'finds the current radical lesson for %s',
    (query) => {
      expect(matchesSearchText(radicalTopic.title, query)).toBe(true);
    },
  );
  it('requires every requested word and does not return a superficially matching lesson', () => {
    expect(matchesSearchText(radicalTopic.title, 'корни история')).toBe(false);
    expect(matchesSearchText('Модуль числа и расстояние', 'корни модуль')).toBe(false);
  });
  it('normalizes ё, punctuation and empty queries without changing the source title', () => {
    expect(matchesSearchText('Отчёт о прогрессе', 'прогрессе отчет')).toBe(true);
    expect(matchesSearchText('План: неделя · месяц', 'месяц план')).toBe(true);
    expect(matchesSearchText('Модуль числа', '')).toBe(true);
    expect(matchesSearchText('Модуль числа', '   ')).toBe(true);
  });
});
