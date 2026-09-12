import { describe, expect, it } from 'vitest';
import {
  historyAtlas,
  getHistoryAtlas,
  historyStageContent,
  historyAtlasProjection,
  renderHistoryAtlas,
  validHistoryAtlasValues,
} from '../shared/history-atlas.mjs';
import { renderSubjectFigure } from '../shared/subject-figures.mjs';
import { documentDrawings, drawingPages } from '../shared/document-scenes.mjs';
import {
  historyAtlasDrawing,
  historyAtlasExamples,
} from '../src/domain/topic-scenes/history-atlas';
import { schoolUnits } from '../src/domain/school-program';
import { cleanDrawing } from '../src/domain/cloud-learning';

describe('fixed historical regional atlas', () => {
  it('binds exported narration to the actual map stage instead of an early model arrow claim', () => {
    const d = { kind: 'history', figure: 'history-map', title: 'Крым', steps: [{ values: [0, 1], caption: 'Стрелка высадки уже появилась', labels: ['Париж'], formula: 'Неверная подпись' }] };
    const [clean] = documentDrawings([d]);
    expect(clean.steps[0].caption).toBe(historyAtlas.maps[0].stages[1].caption);
    expect(clean.steps[0].labels).toEqual(['1854', 'Участники']);
    expect(clean.steps[0].formula).toBe('');
    expect(historyStageContent([0, 2])?.caption).toContain('Стрелка');
    expect(historyStageContent([0, 1])?.caption).not.toContain('Стрелка');
    expect(historyStageContent([9, 0])).toBeUndefined();
    expect(d.steps[0].caption).toBe('Стрелка высадки уже появилась');
  });
  it('makes all three maps reachable from exact, real school-catalog focuses', () => {
    expect(historyAtlasExamples).toHaveLength(3);
    for (const map of historyAtlas.maps) {
      const found = schoolUnits
        .flatMap((unit) =>
          [unit.title, ...unit.topics].map((focus) => historyAtlasDrawing(unit, focus)),
        )
        .find((d) => d?.steps[0].values?.[0] === map.index);
      expect(found, map.id).toBeDefined();
      expect(found?.steps).toHaveLength(4);
    }
  });
  it('does not replace another focus merely because its unit includes the same war', () => {
    for (const unit of schoolUnits.filter((u) => u.subject === 'history'))
      for (const focus of [
        'Отмена крепостного права',
        'Литература',
        'Великая Отечественная война',
        'Реформы Петра I',
        'Кодификация законов',
      ])
        expect(historyAtlasDrawing(unit, focus)).toBeUndefined();
    const unit = schoolUnits.find((u) => u.subject === 'history')!;
    expect(
      historyAtlasDrawing({ ...unit, subject: 'literature' }, 'Северная война'),
    ).toBeUndefined();
  });
  it('uses bounded indices and never substitutes a guessed map for bad parameters', () => {
    for (const values of [
      undefined,
      null,
      [],
      [0],
      [0, 1, 2],
      [-1, 0],
      [3, 0],
      [0, -1],
      [0, 4],
      [0, 0.5],
      [Infinity, 0],
      [NaN, 0],
      ['0', 0],
      [0, '1'],
      [{}, 0],
    ]) {
      expect(validHistoryAtlasValues(values)).toBe(false);
      expect(renderHistoryAtlas(values)).toBeNull();
    }
    expect(getHistoryAtlas('0')).toBeUndefined();
    expect(getHistoryAtlas(NaN)).toBeUndefined();
    expect(renderSubjectFigure({ figure: 'history-map', steps: [{ values: [99, 2] }] })).toContain(
      'уточнённые данные',
    );
  });
  it('preserves years, directions, distinct objectives and checked sources', () => {
    const [crimea, baltic, campaign] = historyAtlas.maps;
    expect(crimea.period).toBe('1853–1856');
    expect(crimea.stages[1].explanation).toContain('Сардиния вступила в войну в 1855');
    expect(crimea.stages[0].heading).toBe('Причины войны');
    expect(crimea.stages[2].heading).toBe('Военная цель');
    expect(crimea.stages[2].caption).toContain('севернее Альмы');
    expect(baltic.period).toBe('1700–1721');
    expect(baltic.stages[2].date).toBe('1714');
    expect(baltic.stages[3].explanation).toContain('возвращена Швеции');
    expect(campaign.stages[1].caption).toContain('7 сентября 1812 года по новому стилю');
    expect(campaign.routes[0].points[0][0]).toBeLessThan(campaign.routes[0].points.at(-1)![0]);
    expect(campaign.routes[1].points[0][0]).toBeGreaterThan(campaign.routes[1].points.at(-1)![0]);
    for (const map of historyAtlas.maps) {
      expect(map.sources.length).toBeGreaterThan(1);
      for (const s of map.sources) {
        expect(s.url).toMatch(/^https:\/\/(?:www\.)?(prlib\.ru|sevmuseum\.ru|rgavmf\.ru)\//);
        expect(s.checkedAt).toBe('2026-09-09');
      }
      expect(map.stages.at(-1)?.caption).toContain('Самостоятельно:');
      expect(map.stages.at(-1)?.caption).toContain('?');
    }
  });
  it('keeps coordinates geographic, in bounds, north-up and independent from labels', () => {
    for (const map of historyAtlas.maps) {
      const projection = historyAtlasProjection(map),
        [w, s, e, n] = map.bounds;
      expect(projection([w, n])[1]).toBeLessThan(projection([w, s])[1]);
      expect(projection([w, s])[0]).toBeLessThan(projection([e, s])[0]);
      for (const p of [
        ...map.places.map((p) => p.coordinates),
        ...map.routes.flatMap((r) => r.points),
      ]) {
        expect(p[0]).toBeGreaterThanOrEqual(w);
        expect(p[0]).toBeLessThanOrEqual(e);
        expect(p[1]).toBeGreaterThanOrEqual(s);
        expect(p[1]).toBeLessThanOrEqual(n);
      }
      expect(map.land.length).toBeGreaterThan(0);
    }
    const plain = renderSubjectFigure({
      figure: 'history-map',
      title: 'Карта',
      steps: [{ values: [0, 2] }],
    });
    const hostile = renderSubjectFigure({
      figure: 'history-map',
      title: '<script>x</script>',
      steps: [
        { values: [0, 2], labels: ['</text><image href="https://invalid" onload="alert(1)"/>'] },
      ],
    });
    expect(hostile).toBe(plain);
    expect(hostile).not.toContain('<script');
    expect(hostile).not.toContain('<image');
    expect(hostile).not.toContain('onload');
    expect(Object.isFrozen(historyAtlas.maps[0].places[0])).toBe(true);
  });
  it('animates only the selected stage and retains exactly the same SVG in notes', () => {
    for (const map of historyAtlas.maps) {
      const source = {
        kind: 'history' as const,
        figure: 'history-map' as const,
        title: map.title,
        steps: map.stages.map((s, i) => ({ caption: s.caption, values: [map.index, i] })),
      };
      const drawing = cleanDrawing(source)!;
      expect(drawing.figure).toBe('history-map');
      const printed = documentDrawings([drawing])[0];
      for (let i = 0; i < 4; i++) {
        const svg = renderSubjectFigure(drawing, i, 1)!;
        expect(svg).toBe(renderSubjectFigure(printed, i, 1));
        expect(svg).toContain('Государственные границы не показаны');
        expect(svg).not.toMatch(/(?:NaN|Infinity|undefined)/);
        expect(svg).not.toContain('<animate');
      }
      const index = map.routes[0].stage;
      expect(renderHistoryAtlas([map.index, index], 0)).not.toBe(
        renderHistoryAtlas([map.index, index], 1),
      );
      expect(renderHistoryAtlas([map.index, index], 0.5)).toBe(
        renderHistoryAtlas([map.index, index], 0.5),
      );
      expect(renderHistoryAtlas([map.index, 0], 1)).not.toContain('data-atlas-route=');
      expect(
        drawingPages([drawing], (s) => s)
          .map((p) => p.body)
          .join(''),
      ).toContain(renderSubjectFigure(drawing, 3, 1));
    }
  });
});
