import type { TutorDrawing } from './cloud-learning';
import type { SchoolUnit } from './school-program/types';
import { sceneFormulaMarkdown } from '../../shared/scene-formula.mjs';

/** A selected subtopic must never inherit an unrelated question/answer from its parent unit. */
export function schoolLocalMaterial(unit: SchoolUnit, focus: string, drawing: TutorDrawing) {
  if (!focus.trim())
    return {
      intro: unit.intro,
      keyIdea: unit.keyIdea,
      example: unit.example,
      question: unit.question,
      answer: unit.answer,
    };
  const intro = `Выбранная подтема: ${focus}.`;
  if (drawing.title.startsWith('Схема содержания'))
    return {
      intro,
      keyIdea: 'Для этой подтемы пока нет отдельного локального разбора.',
      example:
        'Начни диалог по выбранной подтеме: преподаватель сможет разобрать именно твой вопрос и построить рисунок по условию.',
      question: `Что тебе уже понятно в подтеме «${focus}», а что нужно объяснить?`,
      answer: undefined,
    };
  const last = drawing.steps.at(-1)!;
  const hasQuestion = /[?？]/u.test(last.caption);
  const steps = hasQuestion ? drawing.steps.slice(0, -1) : drawing.steps;
  return {
    intro,
    keyIdea: drawing.steps[0].caption,
    example: steps
      .map(
        (s) =>
          `${s.caption}${s.formula ? '\n\n' + sceneFormulaMarkdown(drawing.kind, s.formula) : ''}`,
      )
      .join('\n\n'),
    question: hasQuestion
      ? last.caption
      : `Объясни своими словами, что показывает пример «${drawing.title.replace(/^Авторский пример · /u, '')}». Какой шаг нужно уточнить?`,
    answer: undefined,
  };
}
