import { describe, expect, it } from 'vitest';
import { absoluteTopic } from '../src/domain/absolute-topic';
import { curriculumNodes } from '../src/domain/curriculum-data';
import { checkAnswer } from '../src/domain/learning';
import {
  absoluteLessonScene,
  createCurriculumScene,
  curriculumVisualFamily,
  curriculumVisualRoutes,
  type CurriculumSceneNode,
  type CurriculumVisualFamily,
} from '../src/scenes/curriculum-visuals';
import { advanceTimeline, timelineProgress } from '../src/scenes/timeline';

const node = (
  subject: CurriculumSceneNode['subject'],
  title: string,
  section = '',
): CurriculumSceneNode => ({ id: `test-${title}`, subject, title, section });

describe('curriculum visual routes', () => {
  it('covers the complete real catalogue and keeps broad section vocabulary from changing topic meaning', () => {
    const families = new Set(curriculumNodes.map(curriculumVisualFamily));
    expect(families.size).toBe(18);
    for (const entry of curriculumNodes) {
      const route = createCurriculumScene(entry);
      expect(route.steps.length).toBeGreaterThan(0);
      expect(route.eyebrow).toBe('ВИЗУАЛЬНАЯ КАРТА ТЕМЫ');
    }
    const russianSyntax = curriculumNodes.find(
      (entry) => entry.subject === 'russian' && entry.code === '3.6',
    )!;
    const russianSpelling = curriculumNodes.find(
      (entry) => entry.subject === 'russian' && entry.code === '3.7',
    )!;
    expect(curriculumVisualFamily(russianSyntax)).toBe('syntax');
    expect(curriculumVisualFamily(russianSpelling)).toBe('spelling');
    expect(curriculumVisualFamily(node('math', 'Арифметическая и геометрическая прогрессии'))).toBe(
      'algebra',
    );
    expect(
      curriculumVisualFamily(
        node(
          'social',
          'Закон спроса. Закон предложения',
          'Экономическая жизнь общества / Введение в экономику',
        ),
      ),
    ).toBe('market');
  });
  it.each<[CurriculumSceneNode['subject'], string, CurriculumVisualFamily]>([
    ['math', 'Уравнения', 'algebra'],
    ['math', 'Модуль числа', 'absolute'],
    ['math', 'Графики функций', 'graph'],
    ['math', 'Окружность', 'geometry'],
    ['math', 'Пирамида', 'solid'],
    ['math', 'Теория вероятностей', 'chance'],
    ['russian', 'Части речи', 'morphology'],
    ['russian', 'Постановка запятых', 'syntax'],
    ['russian', 'Чередующиеся гласные', 'spelling'],
    ['russian', 'Структура сочинения', 'writing'],
    ['history', 'Северная война', 'map'],
    ['history', 'Князья', 'person'],
    ['history', 'Реформы', 'document'],
    ['history', 'Культура эпохи', 'causes'],
    ['social', 'Рынок', 'market'],
    ['social', 'Социальные группы', 'groups'],
    ['social', 'Гражданское право', 'law'],
    ['social', 'Политические институты', 'politics'],
  ])('routes %s %s by its actual subject family', (subject, title, expected) => {
    expect(curriculumVisualFamily(node(subject, title))).toBe(expected);
  });
  it('does not classify parts of speech as essay writing or coordinate graphs as generic geometry', () => {
    expect(curriculumVisualFamily(node('russian', 'Части речи', 'Речь и язык'))).toBe('morphology');
    expect(curriculumVisualFamily(node('math', 'Координаты и графики', 'Геометрия'))).toBe('graph');
  });
  it('labels unknown or future catalogue topics as overviews without invented facts or formulas', () => {
    for (const subject of ['math', 'russian', 'history', 'social'] as const) {
      const scene = createCurriculumScene(node(subject, 'Новая тема, ещё без учебного содержания'));
      expect(scene.eyebrow).toBe('ВИЗУАЛЬНАЯ КАРТА ТЕМЫ');
      expect(scene.steps.every((step) => !step.formula)).toBe(true);
      expect(scene.steps).toHaveLength(4);
      expect(scene.steps[scene.reducedMotionFrame.step]).toBeDefined();
    }
    expect(Object.keys(curriculumVisualRoutes)).toHaveLength(18);
    expect(
      new Set(Object.values(curriculumVisualRoutes).map((route) => route.steps[0][1])).size,
    ).toBe(18);
  });
  it('terminates every route, preserves pause time, and has a valid static frame', () => {
    for (const title of ['Уравнения', 'Модуль', 'Графики', 'Геометрия', 'Призма', 'Вероятность']) {
      const scene = createCurriculumScene(node('math', title));
      const paused = advanceTimeline(scene, 1, 760, 0);
      expect(paused).toEqual({ step: 1, elapsedMs: 760, complete: false });
      const finished = advanceTimeline(scene, 0, 0, 1_000_000);
      expect(finished.complete).toBe(true);
      expect(timelineProgress(scene, finished.step, finished.elapsedMs)).toBe(1);
      expect(scene.durationMs).toBe(scene.steps.reduce((sum, step) => sum + step.durationMs, 0));
    }
  });
});

describe('absolute value teaching and independent checks', () => {
  it('reveals answers only after distance and both directions have been shown', () => {
    expect(absoluteLessonScene.steps.slice(0, 3).every((step) => !step.formula)).toBe(true);
    expect(absoluteLessonScene.steps[3].formula).toBe('|−3| = 3');
    expect(absoluteLessonScene.steps[7].formula).toBeUndefined();
    expect(absoluteLessonScene.steps[8].formula).toBeUndefined();
    expect(absoluteLessonScene.steps[9].formula).toBe('x = −1 или x = 5');
    expect(absoluteLessonScene.steps[10].formula).toContain('|−1 − 2| = 3');
    expect(absoluteLessonScene.steps[6].narration).toContain('При a < 0 корней нет');
  });
  it('checks varied independent cases, decimal punctuation, zero and impossible equations', () => {
    const expected = ['7', '0', '2,5', '−4', '1', 'нет корней', '2', '3'];
    expect(absoluteTopic.tasks.length).toBe(expected.length);
    absoluteTopic.tasks.forEach((task, index) => {
      expect(checkAnswer(task, expected[index])).toBe(true);
      expect(checkAnswer(task, '999')).toBe(false);
    });
    expect(Math.abs(-1 - 2)).toBe(3);
    expect(Math.abs(5 - 2)).toBe(3);
    expect(Math.abs(2 - 4)).toBe(2);
    expect(Math.abs(3 + 1)).toBe(4);
    expect(absoluteTopic.materialStatus).toBe('synthetic');
  });
});
