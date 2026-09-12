import type { SchoolUnit } from './school-program/types';
import { getSchoolTopicLabel, getSchoolTopicFocus } from './school-program/topic-labels';
const stopWords = new Set([
  'в',
  'во',
  'на',
  'по',
  'для',
  'и',
  'о',
  'об',
  'с',
  'со',
  'из',
  'к',
  'ко',
]);
const stem = (word: string) =>
  word.length < 4
    ? word
    : word.replace(
        /(?:иями|ями|ами|его|ого|ему|ому|ыми|ими|ая|яя|ое|ее|ые|ие|ой|ий|ый|ей|ую|юю|ия|ии|ию|ья|ью|ов|ев|ам|ям|ах|ях|ом|ем|а|я|ы|и|у|ю|е|о|ь|й)$/u,
        '',
      );
/** Search normalization only: displayed curriculum text and topic IDs stay unchanged. */
export function normalizeSchoolSearch(value: string) {
  const words =
    value
      .normalize('NFKC')
      .toLocaleLowerCase('ru')
      .replace(/ё/g, 'е')
      .replace(/[∈∉]/g, ' принадлежность ')
      .replace(/принадлеж[\p{L}]*/gu, 'принадлежность')
      .replace(/\|[^|\n]+\|/g, ' модуль ')
      .match(/[\p{L}\p{N}]+/gu) || [];
  let tokens = words.filter((word) => !stopWords.has(word)).map(stem);
  const has = (prefix: string) => tokens.some((token) => token.startsWith(prefix));
  if (has('стереометр') || (has('геометр') && has('пространств'))) {
    tokens = tokens.filter((token) => !/^(стереометр|геометр|пространств)/u.test(token));
    tokens.push('стереометр');
  }
  if (has('абсолютн') && (has('величин') || has('значен'))) {
    tokens = tokens.filter((token) => !/^(модул|абсолютн|величин|значен)/u.test(token));
    tokens.push('модул');
  }
  if (has('планиметр')) {
    tokens = tokens.filter((token) => !token.startsWith('планиметр'));
    tokens.push('геометр', 'плоскост');
  }
  return [...new Set(tokens)].join(' ');
}
/** Zero means no match; all query concepts must occur, independent of order. */
export function schoolSearchScore(text: string, query: string) {
  const needle = normalizeSchoolSearch(query);
  if (!needle) return 1;
  const haystack = normalizeSchoolSearch(text),
    words = needle.split(' '),
    tokens = haystack.split(' ');
  if (
    !words.every((word) =>
      tokens.some((token) => token === word || (word.length >= 3 && token.startsWith(word))),
    )
  )
    return 0;
  if (haystack === needle) return 100;
  return (
    (haystack.includes(needle) ? 70 : 45) + words.filter((word) => tokens.includes(word)).length * 2
  );
}
export function matchingSchoolUnits(units: SchoolUnit[], query: string) {
  if (!normalizeSchoolSearch(query)) return units;
  return units
    .map((unit, index) => ({
      unit,
      index,
      score: Math.max(
        schoolSearchScore(unit.title, query) * 3,
        schoolSearchScore([unit.title, unit.section, ...unit.topics].join(' '), query),
        ...unit.topics.map((topic) => schoolSearchScore(topic, query) * 2),
      ),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((item) => item.unit);
}
export function visibleSubtopics(unit: SchoolUnit, query: string, all: boolean) {
  const items = unit.topics.map((text, index) => ({
    text,
    index,
    label: getSchoolTopicLabel(unit, index),
    focus: getSchoolTopicFocus(unit, index),
  }));
  if (all) return items;
  // A hit on the section heading opens the section; a coincidental substring in one
  // child (e.g. Контрреформация) must not hide the rest of its contents.
  if (
    normalizeSchoolSearch(query) &&
    !schoolSearchScore(unit.title, query) &&
    !schoolSearchScore(unit.section, query)
  ) {
    const matches = items.filter((item) => schoolSearchScore(item.label, query));
    if (matches.length) return matches;
  }
  return items.slice(0, 16);
}
