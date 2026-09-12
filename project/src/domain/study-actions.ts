import type { LearningState, SubjectId } from './types';
import { getTopic, topics } from './catalog';
import { startSession, finishSession } from './learning';
import { curriculumNodes } from './curriculum-data';
import type { CurriculumNode } from './curriculum-data/types';
import { sources } from './sources';
import {
  createPlanningState,
  generateStudyPlan,
  startStudyDay,
  startStudyBlock,
  completeStudyBlock,
  finishStudyDay,
  addStudyBlock,
  removeStudyBlock,
  moveStudyBlock,
  updateStudyBlock,
  updateStudyDayMinutes,
  studyDayMinutes,
  localStudyDate,
  addCustomTopic,
  recordSchoolTopic,
  buildStudyReportText,
  type StudyPlanningState,
  type StudyBlockInput,
  type StudyClock,
  type StudyBlockRun,
} from './study-plan';

export function ensureTodayPlan(state: LearningState, date = localStudyDate()): LearningState {
  localStudyDate(date);
  const planning = state.planning || createPlanningState();
  if (planning.days[date]) return state;
  return {
    ...state,
    planning: generateStudyPlan(planning, state, curriculumNodes, {
      period: 'week',
      anchorDate: date,
    }),
  };
}
function isPersonalBlock(block: StudyBlockInput) {
  return (
    block.kind === 'custom' ||
    (block.kind === 'school' && !block.curriculumNodeId) ||
    !!block.customTopicId ||
    !!block.schoolTopicId ||
    block.reason.startsWith('Добавлено учеником')
  );
}
const blockKey = (block: StudyBlockInput) =>
  block.topicId
    ? `lesson:${block.topicId}`
    : block.curriculumNodeId
      ? `node:${block.curriculumNodeId}`
      : `${block.subject}:${block.title}`;
/** Resize today's budget without discarding the learner's selected topics. */
export function refitStudyDay(state: LearningState, date: string, minutes: number): LearningState {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 720)
    throw new Error('Время дня должно быть целым числом от 0 до 720 минут.');
  localStudyDate(date);
  const planning = state.planning || createPlanningState(),
    day = planning.days[date];
  if (
    Object.values(planning.runs).some(
      (run) => run.date === date && ['active', 'paused'].includes(run.status),
    )
  )
    throw new Error('Занятие уже начато. Сначала сохрани его итог.');
  const protectedMinutes = (day?.entries ?? [])
    .filter(isPersonalBlock)
    .reduce((sum, block) => sum + block.minutes, 0);
  if (protectedMinutes > minutes)
    throw new Error(
      'Твои выбранные темы занимают ' +
        protectedMinutes +
        ' мин. Сначала сократи или перенеси их; новый бюджет не может их удалить.',
    );
  const entries = (day?.entries ?? []).map((block) => ({ ...block }));
  let total = entries.reduce((sum, block) => sum + block.minutes, 0);
  for (let index = entries.length - 1; index >= 0 && total > minutes; index--) {
    const block = entries[index];
    if (isPersonalBlock(block)) continue;
    const reduction = Math.min(block.minutes, total - minutes);
    if (block.minutes - reduction < 5) {
      total -= block.minutes;
      entries.splice(index, 1);
    } else {
      block.minutes -= reduction;
      total -= reduction;
    }
  }
  for (let index = entries.length - 1; index >= 0; index--) {
    const block = entries[index];
    if (
      block.kind === 'break' &&
      !isPersonalBlock(block) &&
      (index === 0 || index === entries.length - 1 || entries[index - 1].kind === 'break')
    ) {
      total -= block.minutes;
      entries.splice(index, 1);
    }
  }
  const days = { ...planning.days };
  delete days[date];
  const generated = generateStudyPlan({ ...planning, days }, state, curriculumNodes, {
    period: 'week',
    anchorDate: date,
    dailyMinutes: minutes,
    weekdays: [new Date(date + 'T12:00:00').getDay()],
  });
  const candidates = generated.days[date].entries.filter(
    (block) => block.kind !== 'break' && !isPersonalBlock(block),
  );
  const used = new Set(entries.filter((block) => block.kind !== 'break').map(blockKey));
  let nextPlanning: StudyPlanningState = {
    ...planning,
    sequence: generated.sequence,
    preferences: { ...planning.preferences, dailyMinutes: minutes },
    days: { ...planning.days, [date]: { date, budgetMinutes: minutes, entries, edited: true } },
  };
  // Prefer new topics; repeat only after the available automatic candidates are exhausted.
  while (minutes - total >= 5 && candidates.length && nextPlanning.days[date].entries.length < 46) {
    const candidate = candidates.find((block) => !used.has(blockKey(block))) ?? candidates[0];
    const repeat = used.has(blockKey(candidate));
    const last = nextPlanning.days[date].entries.at(-1);
    const rest = last && last.kind !== 'break' && minutes - total >= 10 ? 5 : 0;
    if (rest) {
      nextPlanning = addStudyBlock(nextPlanning, date, {
        kind: 'break',
        title: 'Перерыв',
        minutes: rest,
        reason: 'Отдых входит в выбранное время.',
      });
      total += rest;
    }
    const duration = Math.min(candidate.minutes, minutes - total);
    const { id: _id, ...input } = candidate;
    nextPlanning = addStudyBlock(nextPlanning, date, {
      ...input,
      minutes: duration,
      reason: repeat
        ? 'Дополнительная практика по уже выбранной теме. ' + input.reason
        : input.reason,
    });
    total += duration;
    used.add(blockKey(candidate));
    const at = candidates.indexOf(candidate);
    candidates.push(...candidates.splice(at, 1));
  }
  return { ...state, profile: { ...state.profile, dailyMinutes: minutes }, planning: nextPlanning };
}
/** Explicit additions consume only automatic tail blocks; failure commits no partial edits. */
export function putTopicInDay(
  planning: StudyPlanningState,
  date: string,
  input: StudyBlockInput,
): StudyPlanningState {
  if (!Number.isInteger(input.minutes) || input.minutes < 1 || input.minutes > 720)
    throw new Error('Укажи длительность темы от 1 до 720 минут.');
  let next = planning;
  if (!next.days[date]) next = updateStudyDayMinutes(next, date, next.preferences.dailyMinutes);
  const budget = next.days[date].budgetMinutes;
  if (input.minutes > budget)
    throw new Error(
      'Для этой темы нужно ' +
        input.minutes +
        ' мин. Сначала увеличь время дня с ' +
        budget +
        ' мин.',
    );
  // A school request takes ownership of already allocated practice for the same lesson.
  // Personal selections can be intentional repeats; never consume or relabel those.
  const matchingAutomatic =
    input.kind === 'school'
      ? next.days[date].entries.filter(
          (block) =>
            block.kind !== 'break' &&
            block.subject === input.subject &&
            !isPersonalBlock(block) &&
            blockKey(block) === blockKey(input),
        )
      : [];
  if (matchingAutomatic.length) {
    const retained = matchingAutomatic[0];
    const entries = next.days[date].entries;
    const previous = entries[entries.findIndex((block) => block.id === retained.id) - 1];
    const restId =
      previous?.kind === 'break' && !isPersonalBlock(previous) ? previous.id : undefined;
    const allocation = Math.max(
      input.minutes,
      matchingAutomatic.reduce((sum, block) => sum + block.minutes, 0),
    );
    for (const duplicate of matchingAutomatic.slice(1))
      next = removeStudyBlock(next, date, duplicate.id);
    let need = studyDayMinutes(next.days[date]) + allocation - retained.minutes - budget;
    for (const block of [...next.days[date].entries].reverse()) {
      if (need <= 0) break;
      if (block.id === retained.id || isPersonalBlock(block)) continue;
      if (block.minutes <= need || block.minutes - need < 5) {
        next = removeStudyBlock(next, date, block.id);
        need -= block.minutes;
      } else {
        next = updateStudyBlock(next, date, block.id, { minutes: block.minutes - need });
        need = 0;
      }
    }
    if (need > 0)
      throw new Error(
        'День заполнен твоими темами. Увеличь время дня или убери одну из них в плане.',
      );
    next = updateStudyBlock(next, date, retained.id, {
      ...input,
      minutes: allocation,
      reason: `${input.reason} Объединено с уже запланированной практикой этой темы: ${allocation} мин.`,
    });
    next = moveStudyBlock(next, date, date, retained.id, 0);
    // Move the old preceding rest with the lesson; do not leave it at the day's end
    // or silently remove its minutes from a previously full daily allocation.
    if (restId && next.days[date].entries.some((block) => block.id === restId))
      next = moveStudyBlock(next, date, date, restId, 1);
    return next;
  }
  let need = studyDayMinutes(next.days[date]) + input.minutes - budget;
  for (const block of [...next.days[date].entries].reverse()) {
    if (need <= 0) break;
    if (isPersonalBlock(block)) continue;
    if (block.minutes <= need || block.minutes - need < 5) {
      next = removeStudyBlock(next, date, block.id);
      need -= block.minutes;
    } else {
      next = updateStudyBlock(next, date, block.id, { minutes: block.minutes - need });
      need = 0;
    }
  }
  if (need > 0)
    throw new Error(
      'День заполнен твоими темами. Увеличь время дня или убери одну из них в плане.',
    );
  const last = next.days[date].entries.at(-1);
  if (last?.kind === 'break' && !isPersonalBlock(last))
    next = removeStudyBlock(next, date, last.id);
  return addStudyBlock(next, date, input, 0);
}
export function addCurriculumToDay(
  state: LearningState,
  node: CurriculumNode,
  date: string,
  minutes: number,
): LearningState {
  const prepared = ensureTodayPlan(state, date);
  return {
    ...prepared,
    planning: putTopicInDay(prepared.planning!, date, {
      kind: 'study',
      title: node.title,
      minutes,
      subject: node.subject,
      curriculumNodeId: node.id,
      topicId: node.lessonTopicId,
      reason:
        'Добавлено учеником. Кодификатор ' +
        node.editionYear +
        ', пункт ' +
        node.code +
        '. ' +
        (node.assessmentStatus === 'not-assessed-in-edition'
          ? 'Школьное дополнение, не проверяется в этой редакции.'
          : ''),
    }),
  };
}
export function matchSchoolTopic(subject: SubjectId, title: string) {
  const query = title.toLowerCase().replace(/ё/g, 'е');
  const absolute =
    subject === 'math' && /модул|абсолютн|\|/.test(query) && getTopic('math-absolute');
  const words = query.split(/\s+/).filter((word) => word.length > 2);
  const ranked = curriculumNodes
    .filter((node) => node.subject === subject && node.assessmentStatus !== 'section')
    .map((node) => {
      const text = [node.title, ...node.keywords].join(' ').toLowerCase().replace(/ё/g, 'е');
      return {
        node,
        score: words.reduce((score, word) => score + (text.includes(word) ? 1 : 0), 0),
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.node.id.localeCompare(b.node.id, 'en'));
  const node = absolute
    ? curriculumNodes.find(
        (node) => node.subject === subject && node.lessonTopicId === 'math-absolute',
      )
    : ranked[0]?.node;
  const lesson =
    absolute ||
    (node?.lessonTopicId && getTopic(node.lessonTopicId)) ||
    topics.find((topic) => topic.subject === subject && query.includes(topic.title.toLowerCase()));
  return { node, topicId: lesson && lesson.subject === subject ? lesson.id : undefined };
}
export function addPersonalToDay(
  state: LearningState,
  input: { title: string; subject: SubjectId; date: string; minutes: number },
): LearningState {
  const match = matchSchoolTopic(input.subject, input.title),
    prepared = ensureTodayPlan(state, input.date);
  const custom = addCustomTopic(prepared.planning!, {
    subject: input.subject,
    title: input.title,
    topicId: match.topicId,
  });
  return {
    ...prepared,
    planning: putTopicInDay(custom.state, input.date, {
      kind: 'custom',
      subject: input.subject,
      title: input.title,
      minutes: input.minutes,
      customTopicId: custom.id,
      topicId: match.topicId,
      curriculumNodeId: match.node?.id,
      reason: 'Добавлено учеником. Личная тема; не приравнивается к обязательному пункту ЕГЭ.',
    }),
  };
}
export function addSchoolToDay(
  state: LearningState,
  input: {
    title: string;
    subject: SubjectId;
    date: string;
    minutes: number;
    status: 'needs-help' | 'practice' | 'understood';
    note?: string;
  },
): LearningState {
  const match = matchSchoolTopic(input.subject, input.title);
  // A self-observation alone must not consume minutes or generate a calendar.
  const prepared =
    input.status === 'understood'
      ? { ...state, planning: state.planning || createPlanningState() }
      : ensureTodayPlan(state, input.date);
  const school = recordSchoolTopic(prepared.planning!, {
    ...input,
    curriculumNodeId: match.node?.id,
    topicId: match.topicId,
  });
  if (input.status === 'understood') return { ...prepared, planning: school.state };
  return {
    ...prepared,
    planning: putTopicInDay(school.state, input.date, {
      kind: 'school',
      subject: input.subject,
      title: input.title,
      minutes: input.minutes,
      schoolTopicId: school.id,
      topicId: match.topicId,
      curriculumNodeId: match.node?.id,
      reason:
        'Школьная тема от ' +
        input.date +
        '. ' +
        (input.status === 'needs-help'
          ? 'Вернёмся к непонятному шагу.'
          : 'Закрепим сегодняшнюю школьную работу.') +
        ' Связь с каталогом подобрана по названию, её можно проверить.',
    }),
  };
}
export function startDailyLearning(
  state: LearningState,
  date = localStudyDate(),
  now?: StudyClock,
) {
  const saved = state.planning,
    active = saved?.activeRunId ? saved.runs[saved.activeRunId] : undefined;
  if (saved && active && ['active', 'paused'].includes(active.status)) {
    const started = startStudyDay(saved, date, now);
    return { state: { ...state, planning: started.state }, runId: started.runId };
  }
  let prepared = ensureTodayPlan(state, date);
  if (!prepared.planning!.days[date]?.entries.some((block) => block.kind !== 'break')) {
    const planning = prepared.planning!,
      day = planning.days[date];
    // Explicit zero minutes remains rest. A default weekend may use the existing
    // preferred duration when the user explicitly presses Start.
    const minutes =
      day.budgetMinutes > 0
        ? day.budgetMinutes
        : day.edited
          ? 0
          : planning.preferences.dailyMinutes;
    if (minutes <= 0)
      throw new Error('На этот день выбрано 0 минут. Укажи время занятия перед началом.');
    const days = { ...planning.days };
    delete days[date];
    const generated = generateStudyPlan({ ...planning, days }, prepared, curriculumNodes, {
      period: 'week',
      anchorDate: date,
      weekdays: [new Date(date + 'T12:00:00').getDay()],
      dailyMinutes: minutes,
    });
    prepared = {
      ...prepared,
      planning: {
        ...planning,
        sequence: generated.sequence,
        days: { ...planning.days, [date]: { ...generated.days[date], edited: day.edited } },
      },
    };
  }
  const started = startStudyDay(prepared.planning!, date, now);
  return { state: { ...prepared, planning: started.state }, runId: started.runId };
}
function blockSession(state: LearningState, block: StudyBlockRun) {
  if (!block.sessionId) return undefined;
  const session = state.sessions[block.sessionId];
  if (!session || session.subject !== block.subject || session.topicId !== block.topicId)
    throw new Error('Сохранённое занятие этого блока недоступно или относится к другой теме.');
  return session;
}
export function enterDailyBlock(
  state: LearningState,
  runId: string,
  blockId: string,
  now?: StudyClock,
) {
  let next = state;
  const planning = state.planning,
    run = planning?.runs[runId],
    block = run?.blocks.find((block) => block.id === blockId);
  if (!planning || !run || !block) throw new Error('Этот шаг не найден в сохранённом занятии.');
  if (!['active', 'paused'].includes(run.status) || ['completed', 'skipped'].includes(block.status))
    throw new Error('Этот шаг уже завершён. Выбери следующий блок или новое занятие.');
  if (run.activeBlockId && run.activeBlockId !== blockId)
    throw new Error('Сначала заверши текущий блок или пропусти его.');
  const existing = blockSession(state, block);
  if (existing?.completedAt)
    throw new Error(
      'Занятие этого блока уже завершено. Подведи итог блока и перейди к следующему.',
    );
  let sessionId = existing?.id;
  if (block.topicId && !sessionId) {
    if (block.startedAt)
      throw new Error(
        'Начатый урок потерял связь с занятием. Сохрани досрочный итог перед новым запуском.',
      );
    const topic = getTopic(block.topicId);
    if (!topic || topic.subject !== block.subject)
      throw new Error('Для этой темы пока нет сопоставленного готового урока.');
    const created = startSession(next, block.topicId, now);
    next = created.state;
    sessionId = created.sessionId;
  }
  const nextPlanning = startStudyBlock(next.planning!, runId, blockId, next, sessionId, now);
  return { state: { ...next, planning: nextPlanning }, sessionId };
}
function captureStudyNotes(state: LearningState, runId: string): LearningState {
  const planning = state.planning,
    run = planning?.runs[runId];
  if (!planning || !run) return state;
  const blocks = run.blocks.map((block) => {
    const session = block.sessionId && state.sessions[block.sessionId];
    return block.startedAt &&
      session &&
      session.subject === block.subject &&
      session.topicId === block.topicId
      ? { ...block, note: session.note?.slice(0, 20000) || block.note }
      : block;
  });
  return {
    ...state,
    planning: { ...planning, runs: { ...planning.runs, [runId]: { ...run, blocks } } },
  };
}
export function completeDailyBlock(
  state: LearningState,
  runId: string,
  blockId: string,
  now?: StudyClock,
) {
  const block = state.planning?.runs[runId]?.blocks.find((block) => block.id === blockId);
  if (!block) throw new Error('Шаг занятия не найден.');
  if (block.status === 'completed') return state;
  if (!block.startedAt || !['active', 'paused'].includes(block.status))
    throw new Error('Сначала начни этот блок.');
  const session = blockSession(state, block);
  const next = captureStudyNotes(
    session && !session.completedAt ? finishSession(state, session.id, now) : state,
    runId,
  );
  return { ...next, planning: completeStudyBlock(next.planning!, runId, blockId, next, now) };
}
export function finishDailyLearning(
  state: LearningState,
  runId: string,
  early: boolean,
  now?: StudyClock,
) {
  let next = state;
  const run = state.planning?.runs[runId];
  if (!run) throw new Error('Занятие не найдено.');
  if (run.report) return state;
  for (const block of run.blocks) {
    if (!block.startedAt || !block.sessionId) continue;
    const session = next.sessions[block.sessionId];
    if (
      session &&
      session.subject === block.subject &&
      session.topicId === block.topicId &&
      !session.completedAt
    )
      next = finishSession(next, session.id, now);
  }
  next = captureStudyNotes(next, runId);
  return { ...next, planning: finishStudyDay(next.planning!, runId, next, { early, now }) };
}
export interface DailyErrorReview {
  blockId: string;
  title: string;
  prompt: string;
  explanation: string;
  hint: string;
}
export function dailyErrorReviews(state: LearningState, runId: string): DailyErrorReview[] {
  const run = state.planning?.runs[runId];
  if (!run?.report || !run.finishedAt) return [];
  const result: DailyErrorReview[] = [];
  for (const block of run.blocks) {
    if (!block.startedAt || !block.sessionId) continue;
    const session = state.sessions[block.sessionId],
      topic = getTopic(block.topicId || '');
    if (
      !session ||
      !topic ||
      session.subject !== block.subject ||
      session.topicId !== block.topicId ||
      topic.subject !== block.subject
    )
      continue;
    const end = block.completedAt ?? run.finishedAt;
    const baseline = new Map<string, number>();
    for (const key of block.attemptBaseline) baseline.set(key, (baseline.get(key) ?? 0) + 1);
    const taskIds = new Set<string>();
    for (const attempt of state.progress[topic.id]?.attempts ?? []) {
      if (attempt.sessionId !== session.id) continue;
      const key = JSON.stringify([attempt.taskId, attempt.at, attempt.correct, attempt.assisted]),
        before = baseline.get(key) ?? 0;
      if (before) {
        baseline.set(key, before - 1);
        continue;
      }
      const millis = Date.parse(attempt.at);
      if (
        attempt.correct !== false ||
        !Number.isFinite(millis) ||
        millis < Date.parse(block.startedAt) ||
        millis > Date.parse(end)
      )
        continue;
      if (topic.tasks.some((task) => task.id === attempt.taskId)) taskIds.add(attempt.taskId);
    }
    for (const taskId of taskIds) {
      const task = topic.tasks.find((task) => task.id === taskId)!;
      result.push({
        blockId: block.id,
        title: topic.title,
        prompt: task.prompt,
        explanation: task.explanation,
        hint: task.hint,
      });
    }
  }
  return result;
}
export function dailyReportContent(state: LearningState, runId: string): string {
  const run = state.planning?.runs[runId],
    report = run?.report;
  if (!run || !report) return '';
  const text = [buildStudyReportText(report), '## Разбор реальных попыток'];
  for (const item of dailyErrorReviews(state, runId))
    text.push(
      '### ' +
        item.title +
        '\nЗадание: ' +
        item.prompt +
        '\nРазбор: ' +
        item.explanation +
        '\nПервый шаг для повторения: ' +
        item.hint,
    );
  for (const block of run.blocks)
    if (block.startedAt && block.note)
      text.push('### Моя заметка · ' + block.title + '\n' + block.note);
  const sourceIds = new Set(
    run.blocks
      .filter((block) => block.startedAt)
      .flatMap((block) => {
        const node = curriculumNodes.find((node) => node.id === block.curriculumNodeId);
        const topic = getTopic(block.topicId || '');
        return [node?.sourceId, topic?.sourceId, ...(topic?.sourceIds || [])].filter(
          (id): id is string => !!id,
        );
      }),
  );
  if (sourceIds.size)
    text.push(
      '## Материалы разобранных тем',
      ...sources
        .filter((source) => sourceIds.has(source.id))
        .map(
          (source) =>
            `${source.title}. ${source.version}. Проверка источника: ${source.checkedAt}. ${source.url}\n${source.role === 'curriculum' ? 'Источник программы и формата экзамена; не подтверждение каждого авторского примера.' : source.status === 'local-training' ? 'Авторский тренировочный материал Cosmos.' : 'Первичный справочный источник.'}`,
        ),
    );
  text.push(
    'Разбор использует сохранённые попытки в границах блока и текущую версию локальных заданий. После обновления учебных материалов формулировки могут измениться; уже экспортированный файл не переписывается.',
    '## Что дальше',
    'Продолжим с сохранённых ошибок и повторений. Завершение времени или чтение карты темы не подтверждает освоение.',
  );
  return text.join('\n\n');
}
