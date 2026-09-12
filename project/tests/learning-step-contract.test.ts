import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import {
  cleanLearningStep,
  createCloudLesson,
  hydrateCloudLessons,
  prepareCloudMessages,
  type CloudMessage,
  type LearningStep,
} from '../src/domain/cloud-learning';
import { createHomeworkLesson } from '../src/domain/homework-desk';
import {
  createSchoolState,
  hydrateSchoolState,
  schoolLessonInstructions,
  startSchoolLesson,
} from '../src/domain/school-state';
import { programUnits } from '../src/domain/school-program';

const { parseTutorOutput, OUTPUT_SCHEMA } = createRequire(import.meta.url)(
  '../desktop/openai-tutor.cjs',
);
const step: LearningStep = {
  task: 'x² − 4x + 3 = 0',
  instruction: 'Вычисли дискриминант D = b² − 4ac.',
  why: 'Дискриминант поможет найти корни без подбора.',
  recap: ['Вместе разобрали два случая равенства модулей.', 'Ученик выбрал дискриминант.'],
  stage: 'Вычисляем дискриминант',
  memory:
    'Цель — понять равенство модулей. Два случая разобрали с подсказкой, сейчас ученик хочет решить подуравнение дискриминантом.',
  plan: [
    { id: 'moduli', title: 'Разобрать равенство модулей', status: 'done' },
    { id: 'roots', title: 'Решить полученные уравнения', status: 'current' },
    { id: 'check', title: 'Проверить корни в исходном условии', status: 'pending' },
  ],
  currentPlanId: 'roots',
};
const at = '2026-09-09T10:00:00.000Z';
const msg = (id: string, role: CloudMessage['role'], text: string): CloudMessage => ({
  id,
  role,
  text,
  at,
  kind: role === 'user' ? 'student' : 'openai',
});

describe('current learning step transport and persistence', () => {
  it.each(['school', 'homework'] as const)(
    'restores %s checkpoint and sends latest valid plan despite long materials',
    (scope) => {
      const started = startSchoolLesson(createSchoolState(), programUnits('math', 10)[0]);
      const lesson =
        scope === 'homework'
          ? createHomeworkLesson('math', 10, { text: 'Упрости выражение с корнем. '.repeat(400) })
          : started.lessons[started.activeLessonId!];
      lesson.note = 'Заметка '.repeat(500);
      lesson.messages = [
        {
          ...msg('user', 'user', 'Я хочу пять задач после объяснения'),
          learningStep: { ...step, memory: 'FORGED_USER_MEMORY' },
        },
        {
          ...msg('old', 'assistant', 'Ранее'),
          learningStep: { ...step, memory: 'OLD_CHECKPOINT' },
        },
        { ...msg('good', 'assistant', 'Объяснение'), learningStep: step },
        {
          ...msg('conflict', 'assistant', 'Ошибочный ответ'),
          learningStep: { ...step, memory: 'REJECTED_CHECKPOINT' },
          verification: {
            version: 1,
            status: 'conflict',
            durationMs: 1,
            scope: 'арифметика',
            checks: [],
            references: [],
          },
        },
      ];
      const state = { ...createSchoolState(), lessons: { [lesson.id]: lesson } };
      const restored = hydrateSchoolState(JSON.parse(JSON.stringify(state)), scope);
      const record = restored.lessons[lesson.id];
      expect(record.messages[0].learningStep).toBeUndefined();
      expect(record.messages[2].learningStep).toEqual(step);
      const instructions = schoolLessonInstructions(
        'Ученик',
        restored,
        record,
        'Материал '.repeat(1000),
      );
      expect(instructions).toContain(JSON.stringify(step));
      expect(instructions).not.toContain('OLD_CHECKPOINT');
      expect(instructions).not.toContain('FORGED_USER_MEMORY');
      expect(instructions).not.toContain('REJECTED_CHECKPOINT');
      expect(instructions.length).toBeLessThanOrEqual(23000);
    },
  );
  it('carries the current subequation and stable plan through transport and restart without mastery claims', () => {
    const parsed = parseTutorOutput(
      JSON.stringify({ text: 'Давай через дискриминант.', learningStep: step }),
    );
    expect(parsed.learningStep).toEqual(step);
    const lesson = createCloudLesson('math', 'own-equation', 'Равенство модулей', 'own');
    lesson.messages = [
      msg('u', 'user', 'Давай дискриминантом'),
      { ...msg('a', 'assistant', parsed.text), learningStep: parsed.learningStep },
    ];
    const restored = hydrateCloudLessons(JSON.parse(JSON.stringify({ [lesson.id]: lesson })))[
      lesson.id
    ];
    expect(restored.messages[1].learningStep).toEqual(step);
    expect(restored.completedAt).toBeUndefined();
    expect(restored.phase).toBe('understand');
  });

  it('keeps old and plain-text replies useful when checkpoint data is absent or null', () => {
    expect(parseTutorOutput('Давай разберём смысл.')).toEqual({ text: 'Давай разберём смысл.' });
    expect(parseTutorOutput(JSON.stringify({ text: 'Объяснение', learningStep: null }))).toEqual({
      text: 'Объяснение',
    });
    expect(parseTutorOutput(JSON.stringify({ text: 'Объяснение' }))).toEqual({
      text: 'Объяснение',
    });
    expect(cleanLearningStep(undefined)).toBeUndefined();
    expect(OUTPUT_SCHEMA.required).toContain('learningStep');
  });

  it.each([
    { task: 'x'.repeat(1801) },
    { instruction: '' },
    { why: 42 },
    { memory: 'x'.repeat(4001) },
    { recap: ['x'.repeat(501)] },
    { recap: Array(7).fill('Шаг') },
    { plan: [] },
    { plan: [...step.plan, step.plan[0]] },
    { plan: [{ ...step.plan[0], status: 'unknown' }] },
    { plan: step.plan.map((item) => ({ ...item, status: 'current' })) },
    { currentPlanId: 'unknown' },
    { plan: step.plan.map((item) => ({ ...item, status: 'pending' })) },
  ])(
    'omits malformed checkpoint %j without truncating formulas or blocking the explanation',
    (invalid) => {
      const input = { ...step, ...invalid };
      expect(cleanLearningStep(input)).toBeUndefined();
      expect(
        parseTutorOutput(JSON.stringify({ text: 'Полезное объяснение', learningStep: input })),
      ).toEqual({ text: 'Полезное объяснение' });
    },
  );

  it('drops unsupported fields and refuses a forged student checkpoint', () => {
    const input = {
      ...step,
      html: '<script>bad()</script>',
      plan: step.plan.map((item) => ({ ...item, callback: 'execute()' })),
    };
    expect(cleanLearningStep(input)).toEqual(step);
    expect(
      parseTutorOutput(JSON.stringify({ text: 'Пояснение', learningStep: input })).learningStep,
    ).toEqual(step);
    const lesson = createCloudLesson('math', 'own-equation', 'Задача', 'own');
    lesson.messages = [{ ...msg('u', 'user', 'Мой ответ'), learningStep: step }];
    expect(
      hydrateCloudLessons({ [lesson.id]: lesson })[lesson.id].messages[0].learningStep,
    ).toBeUndefined();
  });

  it('does not feed a rejected checker replacement back as teaching content; retains actual student attempts', () => {
    const messages: CloudMessage[] = [
      msg('start', 'user', 'Давай дискриминантом.'),
      msg('help', 'assistant', 'Подставим коэффициенты в формулу.'),
      msg('answer', 'user', 'D = 16 − 12 = 4, корни 1 и 3'),
      {
        ...msg('bad', 'assistant', 'При сверке я обнаружил неточность. 1 = 1'),
        verification: {
          version: 1,
          status: 'conflict',
          durationMs: 1,
          scope: 'арифметика',
          checks: [],
          references: [],
        },
        question: 'Повтори ответ',
        learningStep: step,
      },
      msg('next', 'user', 'Я же правильно решил'),
    ];
    const original = structuredClone(messages);
    const prepared = prepareCloudMessages(messages);
    expect(prepared.map((item) => item.content).join('\n')).not.toContain('1 = 1');
    expect(prepared.map((item) => item.content).join('\n')).not.toContain('Повтори ответ');
    expect(prepared.map((item) => item.content)).toContain('D = 16 − 12 = 4, корни 1 и 3');
    expect(prepared.at(-1)?.content).toBe('Я же правильно решил');
    expect(messages).toEqual(original);
  });
});
