import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import registry from '../shared/civics-terms.json';
import { renderSubjectFigure } from '../shared/subject-figures.mjs';
import { schoolUnits } from '../src/domain/school-program';
import { cleanDrawing } from '../src/domain/cloud-learning';
import { DialogueArt } from '../src/scenes/DialogueArt';
import {
  civicsExpandedDrawing,
  civicsExpandedExamples,
  civicsTerms,
  civicsTermSources,
  getCivicsTerm,
} from '../src/domain/topic-scenes/civics-expanded';

const social = schoolUnits.find((unit) => unit.subject === 'social')!;
const card = (id: string) => {
  const found = getCivicsTerm(`civics-${id}`);
  expect(found, id).toBeDefined();
  return found!;
};
const allText = (id: string) => {
  const c = card(id);
  return [
    c.plainDefinition,
    c.formalDefinition,
    c.example,
    c.mechanism,
    c.counterexample,
    c.boundary,
    c.question,
    c.answer,
  ].join('\n');
};

describe('civics term cards and exact-match authored scenes', () => {
  it('has sixteen reachable families, discovered from actual school focuses rather than fixtures', () => {
    const reached = new Set<string>();
    for (const unit of schoolUnits.filter((u) => u.subject === 'social')) {
      for (const topic of [unit.title, ...unit.topics]) {
        const drawing = civicsExpandedDrawing(unit, topic);
        if (drawing) reached.add(drawing.title);
      }
    }
    expect(reached.size).toBe(16);
    expect(civicsExpandedExamples).toHaveLength(16);
    expect(civicsTerms).toHaveLength(16);
    expect(new Set(civicsTerms.map((c) => c.id)).size).toBe(16);
  });
  it.each(civicsExpandedExamples)(
    '$topic: preserves four distinct frames and withholds the self-check answer',
    ({ topic, termId }) => {
      const drawing = civicsExpandedDrawing(social, topic)!;
      const term = getCivicsTerm(termId)!;
      expect(drawing).toBeDefined();
      expect(cleanDrawing(drawing)).toEqual(drawing);
      expect(drawing.steps).toHaveLength(4);
      expect(new Set(drawing.steps.map((s) => s.caption)).size).toBe(4);
      expect(drawing.steps[0].caption).toBe(term.example);
      expect(drawing.steps[1].caption).toBe(term.mechanism);
      expect(drawing.steps[2].caption).toContain(term.boundary);
      expect(drawing.steps[3].caption).toBe(`Самостоятельно: ${term.question}`);
      expect(drawing.steps[3].formula).toBeUndefined();
      expect(JSON.stringify(drawing)).not.toContain(term.answer);
      for (let index = 0; index < drawing.steps.length; index++) {
        const svg = renderSubjectFigure(drawing, index, 1)!;
        expect(svg).toContain('data-subject-figure="tree"');
        expect(svg).not.toContain('Для этого кадра нужны уточнённые данные');
        expect(svg).not.toContain('NaN');
        // Tree edges classify the named example; do not falsely imply temporal cycles or probabilities.
        expect(svg.match(/<rect /g)).toHaveLength(drawing.steps[index].labels!.length);
        expect(svg.match(/<path /g)).toHaveLength(drawing.steps[index].labels!.length - 1);
      }
    },
  );
  it('never substitutes broad civics for unknown narrow questions or other subjects', () => {
    const broad = { ...social, title: 'Спрос', topics: ['Инфляция', 'Налоги'] };
    for (const topic of [
      '',
      'Причины инфляции в России сегодня',
      'Налоги для самозанятого в 2027 году',
      'Величина предложения нефти',
      'Социальная мобильность в кастовом обществе',
      'Особенности уголовной ответственности',
      'Биологическая конкуренция',
    ]) {
      expect(civicsExpandedDrawing(broad, topic), topic).toBeUndefined();
    }
    expect(civicsExpandedDrawing({ ...social, subject: 'biology' }, 'Конкуренция')).toBeUndefined();
    expect(civicsExpandedDrawing({ ...social, subject: 'history' }, 'Государство')).toBeUndefined();
    expect(civicsExpandedDrawing(social, '  СОЦИАЛЬНАЯ   МОБИЛЬНОСТЬ. ')?.title).toContain(
      'Другая школа',
    );
    expect(getCivicsTerm('civics-not-in-registry')).toBeUndefined();
  });
  it('keeps each replay and exported term copy isolated from external mutation', () => {
    const scene = civicsExpandedDrawing(social, 'Спрос')!;
    scene.steps[3].labels![0] = 'Чужой готовый ответ';
    scene.steps[0].caption = 'Сдвиг при изменении собственной цены';
    const copy = card('demand');
    copy.sourceIds.length = 0;
    copy.sceneLabels[0].push('Чужая карточка');
    expect(civicsExpandedDrawing(social, 'Спрос')!.steps[3].labels).not.toContain(
      'Чужой готовый ответ',
    );
    expect(civicsExpandedDrawing(social, 'Спрос')!.steps[0].caption).toContain(
      'Меняется только цена',
    );
    expect(card('demand').sourceIds).toEqual(['civics-bre-demand']);
    expect(card('demand').sceneLabels[0]).not.toContain('Чужая карточка');
  });
  it('distinguishes own-price quantity changes from a curve shift, with fixed period and purchasing power', () => {
    const c = card('demand');
    expect(c.example).toMatch(/неделю/);
    expect(c.example).toContain('доход, вкусы и остальные цены фиксированы');
    expect(c.formalDefinition).toContain('вдоль той же кривой');
    expect(c.formalDefinition).toContain('неценовых');
    expect(c.boundary).toContain('возможности заплатить');
    expect(c.answer).toContain('сам по себе её не сдвигает');
    expect(civicsExpandedDrawing(social, 'Спрос')!.steps[3].labels).toContain(
      'Остальные условия прежние',
    );
    expect(c.question).not.toContain('Доход вырос');
  });
  it('uses a general price index and slower positive growth, not a single-price inflation diagnosis', () => {
    const c = card('inflation');
    expect(((110 - 100) / 100) * 100).toBeCloseTo(10);
    expect(((115.5 - 110) / 110) * 100).toBeCloseTo(5);
    expect(c.example).toContain('придуманные данные');
    expect(c.counterexample).toContain('Одна подорожавшая шоколадка');
    expect(c.boundary).toContain('не означает удешевления');
    expect(c.answer).toContain('Оба темпа положительны');
    expect(c.sourceIds).toContain('civics-cbr-inflation');
  });
  it('keeps statutory payments separate from a personal service or voluntary donation', () => {
    const c = card('tax');
    expect(c.formalDefinition).toContain('обязательный и индивидуально безвозмездный');
    expect(c.mechanism).toContain('не означает, что общество не получает пользы');
    expect(c.counterexample).toContain('плата за услугу');
    expect(c.answer).toContain('Добровольный перевод');
    expect(c.boundary).toContain(
      'Ставки и обязанности конкретного человека здесь не рассчитываются',
    );
  });
  it('requires unemployment conditions together and does not classify every non-worker or student', () => {
    const c = card('unemployment');
    expect(c.mechanism).toContain('три условия вместе');
    expect(c.mechanism).toContain('Регистрация в службе занятости — отдельный вопрос');
    expect(c.answer).toContain('Сам статус студента не исключает');
    expect(c.boundary).toContain('специальные случаи');
    expect(c.sourceIds).toContain('civics-rosstat-unemployment');
    expect(c.sourceIds).toContain('civics-ilo-unemployment');
  });
  it('does not collapse related social concepts into each other', () => {
    expect(card('status-role').plainDefinition).toContain('какого поведения');
    expect(card('status-role').counterexample).toContain('действие');
    expect(card('mobility').example).toContain('сопоставимым положением');
    expect(card('mobility').answer).toContain('Нисходящая вертикальная');
    expect(card('stratification').counterexample).toContain('не устанавливает иерархию');
    expect(card('socialization').boundary).toContain('не заканчивается');
    expect(card('law-morality').answer).toContain('нарушение применимой правовой нормы');
    expect(card('separation').boundary).toContain('не помещает президента автоматически');
    expect(card('state').boundary).toContain('не отсутствие международных обязательств');
  });
  it('does not confuse market power, revenue or cash flows with their related terms', () => {
    expect(card('competition').mechanism).toContain('без обязательного снижения цены');
    expect(card('competition').counterexample).toContain('нужно определить рынок');
    expect(card('competition').boundary).toContain('не может без последствий');
    const p = card('profit');
    expect(10 * 300 - 2200).toBe(800);
    expect(4000 - 4500).toBe(-500);
    expect(p.example).toContain('других доходов нет');
    expect(p.formalDefinition).toContain('состав издержек различается');
    expect(p.answer).toContain('Убыток 500');
    expect(p.counterexample).toContain('кредита не является выручкой');
  });
  it('renders the numeric explanations through the actual Markdown→KaTeX path', () => {
    for (const id of ['inflation', 'profit']) {
      const term = card(id),
        drawing = civicsExpandedDrawing(social, term.topicAliases[0])!;
      const html = renderToStaticMarkup(
        createElement(DialogueArt, {
          drawing,
          step: drawing.steps[1],
          index: 1,
          progress: 1,
          subject: 'social',
        }),
      );
      expect(html).toContain('class="katex"');
      expect(html).not.toContain('katex-error');
      expect(html).toContain('data-subject-figure="tree"');
    }
  });
  it('binds every authored card to real bounded citations and preserves limitations of cached sources', () => {
    expect(registry.materialStatus).toBe('authored-training');
    const sourceIds = new Set(civicsTermSources.map((s) => s.id));
    expect(sourceIds.size).toBe(civicsTermSources.length);
    const hosts = new Set([
      'bigenc.ru',
      'old.bigenc.ru',
      'bre.ruwiki.ru',
      'www.cbr.ru',
      'www.nalog.gov.ru',
      '65.rosstat.gov.ru',
      'ilostat.ilo.org',
      'council.gov.ru',
    ]);
    for (const s of civicsTermSources) {
      expect(hosts.has(new URL(s.url).hostname), s.id).toBe(true);
      expect(new URL(s.url).protocol).toBe('https:');
      expect(s.quote.trim().split(/\s+/).length, s.id).toBeLessThanOrEqual(25);
      expect(s.checkedAt).toBe('2026-09-09');
      expect(s.scope.length).toBeGreaterThan(30);
      if (s.verification === 'indexed-excerpt') expect(s.notes).toMatch(/прям|open/);
    }
    for (const c of civicsTerms) {
      expect(c.materialStatus).toBe('authored-training');
      expect(c.sourceIds.length).toBeGreaterThan(0);
      expect(c.sourceIds.every((id) => sourceIds.has(id))).toBe(true);
      expect(c.counterexample.length).toBeGreaterThan(45);
      expect(c.answer.length).toBeGreaterThan(35);
    }
    expect(civicsTermSources.filter((s) => s.verification === 'indexed-excerpt')).toHaveLength(3);
    expect(allText('tax')).not.toMatch(/ставка\s+(?:13|20|22)\s*%/);
  });
});
