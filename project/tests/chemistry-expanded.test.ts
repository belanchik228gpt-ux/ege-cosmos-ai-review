import { describe, expect, it } from 'vitest';
import {
  chemistryScenario,
  formulaAtomCounts,
  renderChemistryScene,
  validChemistryValues,
} from '../shared/chemistry-scenes.mjs';
import {
  chemistryExpandedDrawing,
  chemistryExpandedExamples,
} from '../src/domain/topic-scenes/chemistry-expanded';
import { stemTopics } from '../src/domain/school-program/stem';
import { cleanDrawing } from '../src/domain/cloud-learning';

const unit = stemTopics.find((u) => u.subject === 'chemistry')!;
describe('eight finite chemistry illustrations', () => {
  it('exposes exactly eight distinct authored families', () => {
    expect(chemistryExpandedExamples).toHaveLength(8);
    expect(new Set(chemistryExpandedExamples.map((e) => e.topic)).size).toBe(8);
  });
  it.each(chemistryExpandedExamples)(
    '$topic is reachable from the actual curriculum and has six explanatory frames',
    ({ topic, scenario }) => {
      const drawing = chemistryExpandedDrawing(unit, topic)!;
      expect(drawing.steps).toHaveLength(6);
      expect(drawing.figure).toBe('chemistry-reaction');
      expect(cleanDrawing(drawing)).toEqual(drawing);
      expect(drawing.steps[0].formula).toBeUndefined();
      expect(drawing.steps.at(-1)!.formula).toBeUndefined();
      expect(drawing.steps.at(-1)!.caption).toMatch(/\?$/);
      expect(
        stemTopics
          .filter((u) => u.subject === 'chemistry')
          .some((u) =>
            [u.title, ...u.topics].some(
              (t) => chemistryExpandedDrawing(u, t)?.title === drawing.title,
            ),
          ),
      ).toBe(true);
      for (const [stage, frame] of drawing.steps.entries()) {
        expect(frame.values).toEqual([scenario, stage]);
        expect(validChemistryValues(frame.values)).toBe(true);
        expect(renderChemistryScene(frame.values)).toContain('viewBox="0 0 820 460"');
      }
    },
  );
  it.each([
    undefined,
    null,
    [],
    [0],
    [0, 0, 1],
    [-1, 0],
    [8, 0],
    [0, 6],
    [1, 0.5],
    ['1', 0],
    [NaN, 0],
    [0, Infinity],
    ['<script>', 0],
  ])('rejects malformed renderer data %j', (value) => {
    expect(validChemistryValues(value)).toBe(false);
    expect(renderChemistryScene(value)).toBeNull();
  });
  it('normalizes only exact topic aliases, preserving unrelated narrow chemistry requests', () => {
    expect(chemistryExpandedDrawing(unit, '  ХИМИЧЕСКИЕ УРАВНЕНИЯ. ')?.figure).toBe(
      'chemistry-reaction',
    );
    expect(chemistryExpandedDrawing(unit, 'Молярная масса')).toBeDefined();
    for (const t of [
      'Окисление углерода',
      'Массовая доля примесей',
      'Термохимические расчёты',
      'Расчёт pH',
      '<script>Количество вещества</script>',
    ])
      expect(chemistryExpandedDrawing(unit, t)).toBeUndefined();
    expect(
      chemistryExpandedDrawing({ ...unit, subject: 'physics' }, 'Количество вещества'),
    ).toBeUndefined();
  });
  it.each([0, 1, 4, 5])(
    'preserves every atom identity and element throughout scenario %s',
    (scenario) => {
      const baseline = [
        ...renderChemistryScene([scenario, 0])!.matchAll(
          /data-atom-id="([^"]+)" data-element="([^"]+)"/g,
        ),
      ].map((m) => [m[1], m[2]]);
      const actualCounts: Record<string, number> = {};
      baseline.forEach(([, el]) => (actualCounts[el] = (actualCounts[el] || 0) + 1));
      expect(actualCounts).toEqual(chemistryScenario(scenario)!.atoms);
      for (const stage of [0, 1, 2, 3, 4, 5])
        for (const p of [0, 0.25, 0.5, 0.75, 1]) {
          const svg = renderChemistryScene([scenario, stage], p)!;
          expect(
            [...svg.matchAll(/data-atom-id="([^"]+)" data-element="([^"]+)"/g)].map((m) => [
              m[1],
              m[2],
            ]),
          ).toEqual(baseline);
          expect(svg).not.toMatch(
            /(?:NaN|Infinity|undefined|<script|<foreignObject|href=|onload=)/,
          );
        }
    },
  );
  it('moves the same atoms without hiding them or morphing their element', () => {
    const start = renderChemistryScene([0, 3], 0)!,
      middle = renderChemistryScene([0, 3], 0.5)!,
      end = renderChemistryScene([0, 3], 1)!;
    const position = (s: string) =>
      s
        .match(/data-atom-id="water-H-0" data-element="H" transform="translate\(([^)]+)\)"/)![1]
        .split(' ')
        .map(Number);
    expect(position(start)).toEqual([135, 164]);
    expect(position(end)).toEqual([536, 146]);
    expect(position(middle)).toEqual([335.5, 155]);
    expect(renderChemistryScene([0, 4], 0)).toBe(renderChemistryScene([0, 4], 1));
  });
  it('distinguishes an unbalanced skeleton from the balanced equation', () => {
    for (const stage of [0, 1]) {
      const svg = renderChemistryScene([0, stage])!;
      expect(svg).toContain('Подбираем коэффициенты');
      expect(svg).toContain('неуравненная схема');
      expect(svg).not.toContain('data-coefficient');
    }
    const balanced = renderChemistryScene([0, 2])!;
    expect(balanced).toContain('Уравнено.');
    expect([...balanced.matchAll(/data-coefficient="2"/g)]).toHaveLength(2);
    expect(balanced).toContain('data-index="2"');
  });
  it('keeps mass-to-moles and stoichiometric ratios distinct and numerically consistent', () => {
    const n = chemistryScenario(2)!,
      reaction = chemistryScenario(3)!;
    expect(n.mass! / n.molarMass!).toBe(n.amount);
    expect(reaction.mass! / reaction.molarMass!).toBe(reaction.amount);
    expect(reaction.amount! * reaction.productMolarMass!).toBeCloseTo(reaction.productMass!);
    expect(5.6 + 4.4).toBe(10);
    expect(renderChemistryScene([2, 0])).not.toContain('2 моль');
    expect(renderChemistryScene([2, 3])).toContain('2 моль');
    expect(renderChemistryScene([3, 0])).not.toContain('5,6 г');
    expect(renderChemistryScene([3, 4])).toContain('5,6 г');
    expect(renderChemistryScene([1, 0])).toContain('не показаны как молекулы');
  });
  it('uses total solution mass, while the visual grid denotes mass shares rather than layers', () => {
    const scenario = chemistryScenario(6)!;
    expect(scenario.mass! / scenario.solutionMass!).toBe(scenario.massFraction);
    expect(renderChemistryScene([6, 1])).toContain('10 + 90 = 100 г');
    expect(renderChemistryScene([6, 2])).toContain('В знаменателе 100 г, не 90 г');
    expect(renderChemistryScene([6, 4])).toContain('10%');
    expect(renderChemistryScene([6, 4])).toContain('не слои соли и воды');
    expect(
      chemistryExpandedDrawing(unit, 'Массовая доля вещества в растворе')!.steps[0].caption,
    ).toContain('Испарения и других потерь нет');
  });
  it('qualifies molar gas volume with temperature, pressure and the ideal-gas approximation', () => {
    const scenario = chemistryScenario(7)!;
    expect(scenario.amount! * scenario.molarVolume!).toBe(scenario.volume);
    for (let stage = 0; stage < 6; stage++) {
      const svg = renderChemistryScene([7, stage])!;
      expect(svg).toContain('0 °C и 101,325 кПа');
      expect(svg).toContain('Идеальный газ');
      expect(svg).toContain('22,4 л/моль — округление');
    }
    expect(renderChemistryScene([7, 0])).not.toContain('11,2 л');
    expect(renderChemistryScene([7, 4])).toContain('11,2 л');
  });
  it('distinguishes full combustion and formal aqueous atom accounting from all chemical cases', () => {
    expect(chemistryExpandedDrawing(unit, 'Полное сгорание метана')!.steps[4].caption).toContain(
      'при недостатке кислорода',
    );
    expect(chemistryExpandedDrawing(unit, 'Реакции замещения')!.steps[3].caption).toContain(
      'представлены ионами',
    );
    expect(renderChemistryScene([4, 1])).toContain('пока неуравненная');
    expect(renderChemistryScene([4, 2])).toContain('Уравнено.');
    expect(renderChemistryScene([5, 1])).toContain('пока неуравненная');
    expect(renderChemistryScene([5, 2])).toContain('Уравнено.');
  });
  it('does not share mutable scenario or frame data', () => {
    chemistryScenario(0)!.atoms!.H = 999;
    expect(chemistryScenario(0)!.atoms!.H).toBe(4);
    const drawing = chemistryExpandedDrawing(unit, 'Химические уравнения')!;
    drawing.steps[0].values![0] = 99;
    expect(chemistryExpandedDrawing(unit, 'Химические уравнения')!.steps[0].values).toEqual([0, 0]);
  });
});
describe('bounded formula atom count, not a full chemical parser', () => {
  it.each([
    ['2H2O', { H: 4, O: 2 }],
    ['CaCO3', { Ca: 1, C: 1, O: 3 }],
    ['CO₂', { C: 1, O: 2 }],
    [' 2 H₂ ', { H: 4 }],
    ['H2SO4', { H: 2, S: 1, O: 4 }],
    ['2NaCl', { Na: 2, Cl: 2 }],
  ])('counts %s', (formula, counts) => expect(formulaAtomCounts(formula)).toEqual(counts));
  it.each([
    '',
    'H0',
    '0H2O',
    'H100',
    '100H2O',
    'Xx2',
    'Ca(OH)2',
    'CuSO4·5H2O',
    'NH4+',
    'CaCO3 → CaO + CO2',
    '<script>alert(1)</script>',
    'H2O;process.exit()',
    null,
    12,
    'H'.repeat(81),
  ])('returns unsupported for %j', (formula) => expect(formulaAtomCounts(formula)).toBeNull());
  it('confirms atom balance of both worked equations by their actual terms', () => {
    const sum = (terms: string[]) =>
      terms.reduce(
        (all, term) => {
          for (const [el, n] of Object.entries(formulaAtomCounts(term)!))
            all[el] = (all[el] || 0) + n;
          return all;
        },
        {} as Record<string, number>,
      );
    expect(sum(['2H2', 'O2'])).toEqual(sum(['2H2O']));
    expect(sum(['CaCO3'])).toEqual(sum(['CaO', 'CO2']));
    expect(sum(['CH4', '2O2'])).toEqual(sum(['CO2', '2H2O']));
    expect(sum(['Zn', '2HCl'])).toEqual(sum(['ZnCl2', 'H2']));
    expect(sum(['H2', 'O2'])).not.toEqual(sum(['H2O']));
  });
});
