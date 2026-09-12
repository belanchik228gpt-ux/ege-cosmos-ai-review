import { historyAtlas } from '../../../shared/history-atlas.mjs';
import type { TutorDrawing } from '../cloud-learning';
import type { SchoolUnit } from '../school-program/types';
const normal = (text: string) =>
  text
    .toLocaleLowerCase('ru')
    .replace(/ё/g, 'е')
    .replace(/[—–]/g, '-')
    .replace(/\s+/g, '')
    .replace(/[.,;:!?]+$/, '');

/** Only the explicit focus may select a fixed atlas. A broad unit containing a war
 * alongside unrelated topics does not silently turn every lesson into that war. */
export function historyAtlasDrawing(unit: SchoolUnit, topic: string): TutorDrawing | undefined {
  if (unit.subject !== 'history') return undefined;
  const focus = normal(topic.trim() || unit.title);
  const map = historyAtlas.maps.find((map) => map.aliases.some((alias) => normal(alias) === focus));
  if (!map) return undefined;
  return {
    kind: 'history',
    figure: 'history-map',
    title: `Авторская карта · ${map.title}`,
    steps: map.stages.map((stage, index) => ({
      caption: stage.caption,
      values: [map.index, index],
    })),
  };
}
export const historyAtlasExamples = historyAtlas.maps.map((map) => ({
  subject: 'history' as const,
  topic: map.aliases[0],
  mapIndex: map.index,
}));
