import type { SchoolGrade, SchoolSubjectId, SchoolUnit } from './types';

export interface SchoolTrack {
  id: string;
  title: string;
  description: string;
  units: SchoolUnit[];
  sourceIds: string[];
  parallel: boolean;
  entryTopic?: string;
}
export interface SchoolUnitTrack {
  id: string;
  title: string;
  order: number;
  parallel: boolean;
}

/** The federal mathematics programme defines three courses; their order is not one timetable. */
export function unitTrackDefinition(unit: SchoolUnit): Omit<SchoolUnitTrack, 'order'> {
  if (unit.subject === 'math') {
    if (unit.section === 'Геометрия' || /-geometry$/u.test(unit.id))
      return { id: 'geometry', title: 'Геометрия', parallel: true };
    if (/Вероятность|статистик/iu.test(unit.section) || /-(probability|statistics)$/u.test(unit.id))
      return { id: 'probability', title: 'Вероятность и статистика', parallel: true };
    return {
      id: 'algebra',
      title: unit.grade < 10 ? 'Алгебра' : 'Алгебра и начала анализа',
      parallel: true,
    };
  }
  // History strands remain separate without inventing a weekly alternation between them.
  if (unit.subject === 'history') {
    if (
      /всеобщ|новая история|история нового|новейшая история|мир в|зарубеж|Раннее Новое время|Европа|Азия и Африка/iu.test(
        unit.section,
      )
    )
      return { id: 'world-history', title: 'Всеобщая история', parallel: true };
    if (/росси|рус[ьи]|отечест|СССР|Смутное время|История нашего края/iu.test(unit.section))
      return { id: 'russian-history', title: 'История России', parallel: true };
  }
  return { id: 'course', title: 'Программа предмета', parallel: false };
}

export function buildProgramTracks(
  allUnits: readonly SchoolUnit[],
  subject: SchoolSubjectId,
  grade: SchoolGrade,
): SchoolTrack[] {
  const grouped = new Map<string, SchoolTrack>();
  const ordered = allUnits
    .filter((unit) => unit.subject === subject && unit.grade === grade)
    .slice()
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  for (const unit of ordered) {
    const meta = unitTrackDefinition(unit);
    let track = grouped.get(meta.id);
    if (!track) {
      track = {
        ...meta,
        units: [],
        sourceIds: [],
        description: meta.parallel
          ? 'Можно изучать параллельно с другими курсами предмета. Порядок уроков уточняется по программе твоего класса.'
          : 'Разделы в порядке программы. Учитель может менять календарные сроки и возвращаться к пройденному.',
      };
      grouped.set(meta.id, track);
    }
    track.units.push(unit);
    if (!track.sourceIds.includes(unit.sourceId)) track.sourceIds.push(unit.sourceId);
  }
  if (subject === 'math' && grade === 10) {
    const geometry = grouped.get('geometry');
    if (geometry) {
      geometry.entryTopic = 'Аксиомы и следствия стереометрии';
      geometry.description =
        'Начинаем со стереометрии: точки, прямые, плоскости и аксиомы. Геометрия идёт параллельно с алгеброй, поэтому ждать завершения алгебры не нужно.';
    }
  }
  return [...grouped.values()];
}

export const schoolSequenceSources = [
  {
    id: 'sequence-math-soo-2025',
    title: 'ФРП математики 10–11 классов: три курса и введение в стереометрию',
    url: 'https://edsoo.ru/wp-content/uploads/2025/07/2025_soo_frp_matematika_10_11_baz.pdf',
    checkedAt: '2026-09-10',
    pages: [5, 32, 37, 38],
    evidence:
      'Геометрия — отдельный курс; её тематический план 10 класса начинается с введения в стереометрию. Номер раздела алгебры не задаёт срок начала геометрии.',
  },
  {
    id: 'sequence-math-ooo-2025',
    title: 'ФРП математики 5–9 классов: алгебра, геометрия, вероятность и статистика',
    url: 'https://edsoo.ru/wp-content/uploads/2025/07/2025_ooo_frp_matematika-5-9_baza.pdf',
    checkedAt: '2026-09-10',
    pages: [3, 5, 6],
    evidence:
      'В 7–9 классах математика представлена отдельными курсами. Каталог сохраняет их самостоятельную последовательность.',
  },
  {
    id: 'reference-atanasyan-2025',
    title: 'Атанасян и соавторы. Геометрия 10–11. Карточка издателя',
    url: 'https://media.prosv.ru/content/item/16055/',
    checkedAt: '2026-09-10',
    pages: [],
    evidence:
      'Издатель подтверждает авторов, класс и издание 2025. Это библиографическая ссылка; она не означает, что выбран именно этот учебник ученика или прочитан весь текст.',
  },
] as const;

/** Author names alone do not identify the year/level and paragraph order of a pupil's copy. */
export const schoolTextbookProfiles = [
  {
    id: 'mordkovich-semenov-algebra-10',
    subject: 'math' as const,
    grade: 10 as const,
    trackId: 'algebra',
    title: 'Мордкович, Семенов · Алгебра · 10 класс',
    authors: ['А. Г. Мордкович', 'П. В. Семенов'],
    referenceSourceId: 'prosv-mordkovich-semenov-10-reference',
    url: 'https://media.prosv.ru/content/item/16309/',
    checkedAt: '2026-09-10',
    sequenceStatus: 'edition-needed' as const,
    description:
      'Авторы подтверждены. Год, часть и оглавление твоего экземпляра пока не уточнены; точные номера параграфов не назначены. Доступен порядок ФРП и выбор текущей темы школы.',
  },
] as const;
