import type { SchoolUnit } from './types';

// Display context only. Original topic strings and indices remain persistence keys.
const headings: Record<string, Array<[string, string]>> = {
  'program-biology-7-plant-groups': [
    ['Плауновидные (Плауны).', 'Плауны, хвощи и папоротники'],
    ['Голосеменные.', 'Голосеменные'],
    ['Покрытосеменные (цветковые) растения.', 'Покрытосеменные'],
  ],
  'program-geography-7-continents': [
    ['Южные материки.', 'Южные материки'],
    ['Северные материки.', 'Северные материки'],
  ],
  'program-geography-9-russia-economy': [
    ['Топливно-энергетический комплекс (далее – ТЭК).', 'Топливно-энергетический комплекс'],
    ['Электроэнергетика.', 'Электроэнергетика'],
    ['Металлургический комплекс.', 'Металлургия'],
    ['Машиностроительный комплекс.', 'Машиностроение'],
    ['Химическая промышленность.', 'Химическая промышленность'],
    ['Лесопромышленный комплекс.', 'Лесопромышленный комплекс'],
    ['Агропромышленный комплекс (далее — АПК).', 'Агропромышленный комплекс'],
    ['Сельское хозяйство.', 'Сельское хозяйство'],
    ['Пищевая промышленность.', 'Пищевая промышленность'],
    ['Легкая промышленность.', 'Лёгкая промышленность'],
    ['Транспорт и связь.', 'Транспорт и связь'],
  ],
  'program-geography-9-russia-regions': [
    ['Западный макрорегион (Европейская часть) России.', 'Западный макрорегион России'],
    ['Восточный макрорегион (Азиатская часть) России.', 'Восточный макрорегион России'],
  ],
  'program-geography-10-world-economy': [
    ['Металлургия мира.', 'Металлургия мира'],
    ['Сельское хозяйство мира.', 'Сельское хозяйство мира'],
  ],
  'program-geography-11-world-regions': [
    [
      'Америка: состав (субрегионы: Северная Америка, Латинская Америка), общая экономико-географическая характеристика.',
      'Америка',
    ],
    [
      'Африка: состав (субрегионы: Северная Африка, Западная Африка, Центральная Африка, Восточная Африка, Южная Африка).',
      'Африка',
    ],
  ],
};

const contextNeeded =
  /^(Общая характеристика\.|Географическое положение\.|История открытия|Основные черты рельефа|Зональные и азональные|Население\.|Политическая карта\.|Крупнейшие по территории|Изменение природы под влиянием|Состав, место и значение|Факторы размещения предприятий\.|География важнейших отраслей: основные районы и центры\.|Социально-экономические и экологические проблемы|Современные тенденции развития отрасли\.|Особенности природно-ресурсного капитала, населения и хозяйства субрегионов\.)/u;

// Only proven PDF page-number intrusions, not general number deletion.
const pdfArtifacts: Record<string, Array<[string, string]>> = {
  'program-geography-9-russia-economy': [
    ['Общие 17 особенности', 'Общие особенности'],
    ['угодья, их 19 площадь', 'угодья, их площадь'],
  ],
  'program-geography-10-world-economy': [
    ['отрасли, 7 изменяющие', 'отрасли, изменяющие'],
    ['основные 8 формы', 'основные формы'],
  ],
  'program-geography-11-world-regions': [
    ['Особенности 9 экономико-географического', 'Особенности экономико-географического'],
  ],
};

export function getSchoolTopicLabel(unit: SchoolUnit, index: number): string {
  const raw = unit.topics[index];
  if (typeof raw !== 'string') return '';
  let label = raw;
  for (const [before, after] of pdfArtifacts[unit.id] ?? []) label = label.replace(before, after);
  if (contextNeeded.test(raw)) {
    let context = '';
    for (let position = 0; position < index; position++) {
      const heading = headings[unit.id]?.find(([text]) => text === unit.topics[position]);
      if (heading) context = heading[1];
    }
    if (context) label = `${context}: ${label[0].toLocaleLowerCase('ru')}${label.slice(1)}`;
  }
  let activity = '';
  for (let position = 0; position < index; position++) {
    const topic = unit.topics[position].trim();
    if (/^Демонстрации\.?$/u.test(topic)) activity = 'Демонстрация';
    if (/^Лабораторные и практические работы\.?$/u.test(topic))
      activity = 'Лабораторная или практическая работа';
    if (/^Практические работы\.?$/u.test(topic)) activity = 'Практическая работа';
  }
  return activity &&
    unit.topics.slice(0, index).includes(raw) &&
    !/^(Лабораторные|Практические|Демонстрации)/u.test(raw)
    ? `${activity}: ${label}`
    : label;
}

/** New attempts on repeated source labels need separate keys; legacy raw history stays untouched. */
export function getSchoolTopicFocus(unit: SchoolUnit, index: number): string {
  const raw = unit.topics[index];
  if (typeof raw !== 'string') return '';
  const normalize = (text: string) =>
    text.toLocaleLowerCase('ru').replace(/ё/g, 'е').replace(/\s+/gu, ' ').trim();
  const same = unit.topics.filter((topic) => normalize(topic) === normalize(raw));
  return same.length > 1 ? `${raw} [подтема ${index + 1}]` : raw;
}
