import { topics } from './catalog';
import type { Attempt, LearningState, SubjectId } from './types';
import type { CurriculumNode } from './curriculum-data/types';
import { getGradeLessonIds, getSchoolTopic, isFoundationLesson } from './school-catalog';

export type LocalDate = string;
export type StudyClock = Date | string | number;
export type StudyGoal = 'balanced' | 'ege' | 'school';
export interface StudyPreferences {
  dailyMinutes: number;
  weekdays: number[];
  subjects: SubjectId[];
  goal: StudyGoal;
  schoolGrade: number;
  mathLevel: 'profile' | 'basic' | 'undecided';
  examYear: number;
}
export interface CustomStudyTopic {
  id: string;
  subject: SubjectId;
  title: string;
  notes: string;
  topicId?: string;
  createdAt: string;
}
export interface SchoolTopicObservation {
  id: string;
  date: LocalDate;
  subject: SubjectId;
  title: string;
  note: string;
  status: 'needs-help' | 'practice' | 'understood';
  curriculumNodeId?: string;
  topicId?: string;
  createdAt: string;
}
export interface StudyBlock {
  id: string;
  kind: 'study' | 'review' | 'school' | 'custom' | 'break';
  title: string;
  minutes: number;
  subject?: SubjectId;
  topicId?: string;
  curriculumNodeId?: string;
  customTopicId?: string;
  schoolTopicId?: string;
  reason: string;
}
export interface StudyDayPlan {
  date: LocalDate;
  budgetMinutes: number;
  entries: StudyBlock[];
  edited: boolean;
}
export interface StudyPlan {
  id: string;
  period: 'week' | 'month';
  startDate: LocalDate;
  endDate: LocalDate;
  dates: LocalDate[];
  preferences: StudyPreferences;
}
export interface StudyBlockEvidence {
  attempts: number;
  independentCorrect: number;
  assistedCorrect: number;
  incorrect: number;
  activeMs: number;
  sessionId?: string;
}
export interface StudyBlockRun extends StudyBlock {
  status: 'pending' | 'active' | 'paused' | 'completed' | 'skipped';
  startedAt?: string;
  completedAt?: string;
  sessionId?: string;
  /** Multiset of already existing attempt identities; no answer text is stored here. */
  attemptBaseline: string[];
  sessionActiveMsAtStart: number;
  activeMs: number;
  evidence?: StudyBlockEvidence;
  note?: string;
}
export interface StudyDayReport extends StudyBlockEvidence {
  runId: string;
  date: LocalDate;
  finishedAt: string;
  endedEarly: boolean;
  plannedMinutes: number;
  completedMinutes: number;
  completedBlocks: number;
  completedBreaks: number;
  skippedBlocks: number;
  unfinishedBlocks: number;
  sessionCount: number;
  blocks: Array<
    StudyBlockEvidence & { id: string; title: string; status: StudyBlockRun['status'] }
  >;
  limitations: string[];
}
export interface StudyDayRun {
  id: string;
  date: LocalDate;
  startedAt: string;
  status: 'active' | 'paused' | 'completed' | 'finished-early';
  /** Frozen plan snapshot: later calendar edits do not rewrite a running lesson. */
  blocks: StudyBlockRun[];
  activeBlockId?: string;
  finishedAt?: string;
  report?: StudyDayReport;
}
export interface StudyPlanningState {
  version: 1;
  sequence: number;
  preferences: StudyPreferences;
  days: Record<LocalDate, StudyDayPlan>;
  plans: Record<string, StudyPlan>;
  customTopics: CustomStudyTopic[];
  schoolTopics: SchoolTopicObservation[];
  runs: Record<string, StudyDayRun>;
  activeRunId?: string;
}
export interface GenerateStudyPlanOptions extends Partial<StudyPreferences> {
  period: 'week' | 'month';
  anchorDate: LocalDate;
  /** Explicit replacement affects only days with no started run. */
  replace?: boolean;
}
export type StudyBlockInput = Omit<StudyBlock, 'id'>;

const SUBJECTS: SubjectId[] = ['math', 'russian', 'history', 'social'];
const MAX_MINUTES = 720;
const MAX_BLOCKS = 48;
// An authored prerequisite set, not a claim that each lesson is an official basic-EGE item.
const BASIC_LOCAL_LESSONS = new Set([
  'math-rectangle',
  'math-triangle',
  'math-median',
  'math-fraction',
  'math-multiply',
  'math-percent',
  'math-absolute',
  'math-radicals',
]);
const emptyEvidence = (): StudyBlockEvidence => ({
  attempts: 0,
  independentCorrect: 0,
  assistedCorrect: 0,
  incorrect: 0,
  activeMs: 0,
});
const clone = (state: StudyPlanningState): StudyPlanningState => structuredClone(state);
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const line = (value: unknown, max = 240) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';
const integer = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.floor(value)))
    : fallback;
const subject = (value: unknown): value is SubjectId => SUBJECTS.includes(value as SubjectId);
const safeId = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,119}$/u.test(value);
const timestamp = (value: unknown) => {
  if (typeof value !== 'string' || value.length > 40 || !/^\d{4}-\d\d-\d\dT/u.test(value))
    return undefined;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : undefined;
};
function instant(now: StudyClock = new Date()) {
  const value = new Date(now);
  if (!Number.isFinite(value.getTime())) throw new Error('Некорректное время занятия.');
  return value.toISOString();
}
/** Calendar days never use toISOString().slice(0, 10), even at local midnight. */
export function localStudyDate(now: StudyClock = new Date()): LocalDate {
  if (typeof now === 'string' && /^\d{4}-\d\d-\d\d$/u.test(now)) return requireDate(now);
  const value = new Date(now);
  if (!Number.isFinite(value.getTime())) throw new Error('Некорректная дата плана.');
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}
function calendarDate(value: unknown): Date | undefined {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\d$/u.test(value)) return;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 2000 || year > 2200) return;
  const date = new Date(year, month - 1, day, 12);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day)
    return;
  return date;
}
function requireDate(value: unknown): LocalDate {
  if (!calendarDate(value)) throw new Error('Выбери существующую календарную дату.');
  return value as string;
}
export function shiftStudyDate(value: LocalDate, days: number): LocalDate {
  const date = calendarDate(requireDate(value))!;
  date.setDate(date.getDate() + integer(days, 0, -3660, 3660));
  return localStudyDate(date);
}
function normalizePreferences(value: unknown, fallback?: StudyPreferences): StudyPreferences {
  const raw = object(value);
  const base: StudyPreferences = fallback ?? {
    dailyMinutes: 120,
    weekdays: [1, 2, 3, 4, 5],
    subjects: [...SUBJECTS],
    goal: 'balanced',
    schoolGrade: 10,
    mathLevel: 'basic',
    examYear: 2028,
  };
  return {
    dailyMinutes: integer(raw.dailyMinutes, base.dailyMinutes, 0, MAX_MINUTES),
    weekdays: Array.isArray(raw.weekdays)
      ? [
          ...new Set(
            raw.weekdays.filter(
              (day): day is number => Number.isInteger(day) && Number(day) >= 0 && Number(day) <= 6,
            ),
          ),
        ].sort()
      : [...base.weekdays],
    subjects: Array.isArray(raw.subjects)
      ? [...new Set(raw.subjects.filter(subject))]
      : [...base.subjects],
    goal: ['balanced', 'ege', 'school'].includes(String(raw.goal))
      ? (raw.goal as StudyGoal)
      : base.goal,
    schoolGrade: integer(raw.schoolGrade, base.schoolGrade, 5, 11),
    mathLevel: ['profile', 'basic', 'undecided'].includes(String(raw.mathLevel))
      ? (raw.mathLevel as StudyPreferences['mathLevel'])
      : base.mathLevel,
    examYear: integer(raw.examYear, base.examYear, 2026, 2100),
  };
}
export function createPlanningState(): StudyPlanningState {
  return {
    version: 1,
    sequence: 0,
    preferences: normalizePreferences({}),
    days: {},
    plans: {},
    customTopics: [],
    schoolTopics: [],
    runs: {},
  };
}
function nextId(state: StudyPlanningState, prefix: string) {
  state.sequence += 1;
  return `${prefix}-${state.sequence}`;
}
function lessonId(value: unknown, owner: SubjectId | undefined) {
  return typeof value === 'string' &&
    topics.some((topic) => topic.id === value && topic.subject === owner)
    ? value
    : undefined;
}
function normalizedBlock(value: unknown): StudyBlock | undefined {
  const raw = object(value);
  if (
    !safeId(raw.id) ||
    !['study', 'review', 'school', 'custom', 'break'].includes(String(raw.kind)) ||
    !line(raw.title)
  )
    return;
  const kind = raw.kind as StudyBlock['kind'];
  if (kind !== 'break' && !subject(raw.subject)) return;
  const owner = kind === 'break' ? undefined : (raw.subject as SubjectId);
  return {
    id: raw.id,
    kind,
    title: line(raw.title),
    minutes: integer(raw.minutes, 1, 1, MAX_MINUTES),
    ...(owner ? { subject: owner } : {}),
    ...(lessonId(raw.topicId, owner) ? { topicId: raw.topicId as string } : {}),
    ...Object.fromEntries(
      ['curriculumNodeId', 'customTopicId', 'schoolTopicId'].flatMap((key) =>
        kind !== 'break' && safeId(raw[key]) ? [[key, raw[key]]] : [],
      ),
    ),
    reason: line(raw.reason, 600),
  };
}
function boundedBlocks(value: unknown, budget: number): StudyBlock[] {
  const result: StudyBlock[] = [];
  let total = 0;
  for (const raw of (Array.isArray(value) ? value : []).slice(0, MAX_BLOCKS)) {
    const block = normalizedBlock(raw);
    if (!block || result.some((entry) => entry.id === block.id) || total + block.minutes > budget)
      continue;
    result.push(block);
    total += block.minutes;
  }
  return result;
}
function hydrateEvidence(value: unknown): StudyBlockEvidence {
  const raw = object(value);
  const independentCorrect = integer(raw.independentCorrect, 0, 0, 10000);
  const assistedCorrect = integer(raw.assistedCorrect, 0, 0, 10000);
  const incorrect = integer(raw.incorrect, 0, 0, 10000);
  return {
    attempts: independentCorrect + assistedCorrect + incorrect,
    independentCorrect,
    assistedCorrect,
    incorrect,
    activeMs: integer(raw.activeMs, 0, 0, 86_400_000),
    ...(safeId(raw.sessionId) ? { sessionId: raw.sessionId } : {}),
  };
}
export function hydrateStudyPlanning(value: unknown): StudyPlanningState {
  const raw = object(value),
    result = createPlanningState();
  if (raw.version !== undefined && raw.version !== 1) return result;
  result.preferences = normalizePreferences(raw.preferences);
  result.sequence = integer(raw.sequence, 0, 0, 1_000_000_000);
  for (const [date, item] of Object.entries(object(raw.days)).slice(0, 1100)) {
    if (!calendarDate(date)) continue;
    const day = object(item),
      budgetMinutes = integer(day.budgetMinutes, 120, 0, MAX_MINUTES);
    result.days[date] = {
      date,
      budgetMinutes,
      entries: boundedBlocks(day.entries, budgetMinutes),
      edited: day.edited === true,
    };
  }
  for (const item of (Array.isArray(raw.customTopics) ? raw.customTopics : []).slice(0, 300)) {
    const entry = object(item);
    if (
      !safeId(entry.id) ||
      !subject(entry.subject) ||
      !line(entry.title) ||
      result.customTopics.some((topic) => topic.id === entry.id)
    )
      continue;
    result.customTopics.push({
      id: entry.id,
      subject: entry.subject,
      title: line(entry.title),
      notes: line(entry.notes, 2000),
      createdAt: timestamp(entry.createdAt) ?? '2026-01-01T00:00:00.000Z',
      ...(lessonId(entry.topicId, entry.subject) ? { topicId: entry.topicId as string } : {}),
    });
  }
  for (const item of (Array.isArray(raw.schoolTopics) ? raw.schoolTopics : []).slice(-1000)) {
    const entry = object(item);
    if (
      !safeId(entry.id) ||
      !subject(entry.subject) ||
      !calendarDate(entry.date) ||
      !line(entry.title) ||
      result.schoolTopics.some((topic) => topic.id === entry.id)
    )
      continue;
    result.schoolTopics.push({
      id: entry.id,
      date: entry.date as string,
      subject: entry.subject,
      title: line(entry.title),
      note: line(entry.note, 2000),
      status: ['needs-help', 'practice', 'understood'].includes(String(entry.status))
        ? (entry.status as SchoolTopicObservation['status'])
        : 'practice',
      createdAt: timestamp(entry.createdAt) ?? '2026-01-01T00:00:00.000Z',
      ...(safeId(entry.curriculumNodeId) ? { curriculumNodeId: entry.curriculumNodeId } : {}),
      ...(lessonId(entry.topicId, entry.subject) ? { topicId: entry.topicId as string } : {}),
    });
  }
  for (const [key, item] of Object.entries(object(raw.plans)).slice(0, 100)) {
    const plan = object(item);
    if (
      !safeId(key) ||
      !['week', 'month'].includes(String(plan.period)) ||
      !calendarDate(plan.startDate) ||
      !calendarDate(plan.endDate)
    )
      continue;
    const dates = (Array.isArray(plan.dates) ? plan.dates : [])
      .filter((date): date is string => !!calendarDate(date) && !!result.days[String(date)])
      .slice(0, 31);
    result.plans[key] = {
      id: key,
      period: plan.period as StudyPlan['period'],
      startDate: plan.startDate as string,
      endDate: plan.endDate as string,
      dates: [...new Set(dates)],
      preferences: normalizePreferences(plan.preferences, result.preferences),
    };
  }
  const allRuns = Object.entries(object(raw.runs));
  const retainedRuns = allRuns.slice(-500);
  const selectedRun = allRuns.find(([key]) => key === raw.activeRunId);
  if (selectedRun && !retainedRuns.some(([key]) => key === selectedRun[0])) {
    retainedRuns.shift();
    retainedRuns.push(selectedRun);
  }
  for (const [key, item] of retainedRuns) {
    const run = object(item),
      startedAt = timestamp(run.startedAt);
    if (!safeId(key) || !calendarDate(run.date) || !startedAt) continue;
    const entries = Array.isArray(run.blocks) ? run.blocks : [];
    const clean = boundedBlocks(entries, MAX_MINUTES);
    const blocks: StudyBlockRun[] = clean.map((block) => {
      const original = object(entries.find((entry) => object(entry).id === block.id));
      const began = timestamp(original.startedAt);
      const status = ['active', 'paused', 'completed', 'skipped'].includes(String(original.status))
        ? (original.status as StudyBlockRun['status'])
        : 'pending';
      return {
        ...block,
        status: !began && status !== 'skipped' ? 'pending' : status,
        ...(began ? { startedAt: began } : {}),
        ...(timestamp(original.completedAt)
          ? { completedAt: timestamp(original.completedAt) }
          : {}),
        ...(began && safeId(original.sessionId) ? { sessionId: original.sessionId } : {}),
        attemptBaseline:
          began && Array.isArray(original.attemptBaseline)
            ? original.attemptBaseline
                .filter((item): item is string => typeof item === 'string' && item.length <= 300)
                .slice(0, 2000)
            : [],
        sessionActiveMsAtStart: integer(original.sessionActiveMsAtStart, 0, 0, 86_400_000),
        activeMs: began ? integer(original.activeMs, 0, 0, 86_400_000) : 0,
        ...(began && original.evidence ? { evidence: hydrateEvidence(original.evidence) } : {}),
        ...(typeof original.note === 'string' ? { note: original.note.slice(0, 20000) } : {}),
      };
    });
    let status = ['paused', 'completed', 'finished-early'].includes(String(run.status))
      ? (run.status as StudyDayRun['status'])
      : 'active';
    if (
      status === 'completed' &&
      blocks.some((block) => !['completed', 'skipped'].includes(block.status))
    )
      status = 'finished-early';
    // A persisted in-progress block is paused after restart, never auto-completed.
    for (const block of blocks) if (block.status === 'active') block.status = 'paused';
    const finishedAt = timestamp(run.finishedAt);
    const finished = (status === 'completed' || status === 'finished-early') && !!finishedAt;
    result.runs[key] = {
      id: key,
      date: run.date as string,
      startedAt,
      status: finished ? status : 'paused',
      blocks,
      ...(!finished &&
      blocks.some((block) => block.id === run.activeBlockId && block.status === 'paused')
        ? { activeBlockId: run.activeBlockId as string }
        : {}),
      ...(finishedAt && finished ? { finishedAt } : {}),
    };
    if (finished)
      result.runs[key].report = summarizeRun(
        result.runs[key],
        finishedAt!,
        status === 'finished-early',
      );
  }
  // Only one run can be resumed. Preserve the selected one across midnight and navigation.
  const unfinished = Object.values(result.runs).filter((run) => run.status === 'paused');
  const active = unfinished.find((run) => run.id === raw.activeRunId) ?? unfinished.at(-1);
  if (active) result.activeRunId = active.id;
  const allIds = [
    ...Object.keys(result.runs),
    ...result.customTopics.map((entry) => entry.id),
    ...result.schoolTopics.map((entry) => entry.id),
    ...Object.values(result.days).flatMap((day) => day.entries.map((entry) => entry.id)),
    ...Object.values(result.runs).flatMap((run) => run.blocks.map((entry) => entry.id)),
  ];
  result.sequence = Math.max(
    result.sequence,
    ...allIds.map((id) => integer(Number(id.match(/-(\d+)$/u)?.[1]), 0, 0, 1_000_000_000)),
  );
  return result;
}

function planDates(period: StudyPlan['period'], anchor: LocalDate) {
  const first = calendarDate(requireDate(anchor))!;
  if (period === 'week') first.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  else first.setDate(1);
  const start = localStudyDate(first);
  const length =
    period === 'week' ? 7 : new Date(first.getFullYear(), first.getMonth() + 1, 0, 12).getDate();
  return Array.from({ length }, (_, index) => shiftStudyDate(start, index));
}
type Candidate = Omit<StudyBlock, 'id' | 'minutes'> & { priority: number; key: string };
function candidatesForDay(
  state: StudyPlanningState,
  learning: LearningState,
  nodes: readonly CurriculumNode[],
  date: LocalDate,
  prefs: StudyPreferences,
): Candidate[] {
  const selected = new Set(prefs.subjects),
    result: Candidate[] = [];
  // A personal bypass affects new automatic EGE suggestions only. It does not
  // manufacture mastery or remove existing plans / explicit requests to revisit.
  const skippedCards = Object.keys(learning.egeTopicSkips || {}).flatMap((id) => {
    const card = getSchoolTopic(id);
    return card ? [card] : [];
  });
  const skippedNodes = new Set(skippedCards.flatMap((card) => card.curriculumNodeIds));
  const skippedLessons = new Set(skippedCards.flatMap((card) => card.lessonTopicIds));
  const gradeLessons = new Set(prefs.subjects.flatMap((subject) => getGradeLessonIds(subject, prefs.schoolGrade)));
  const canUseLocalLesson = (topic: (typeof topics)[number]) =>
    (prefs.schoolGrade < 8 || (!isFoundationLesson(topic.id) && gradeLessons.has(topic.id))) &&
    (topic.subject !== 'math' || prefs.mathLevel !== 'basic' || BASIC_LOCAL_LESSONS.has(topic.id));
  const excludedLessons = new Set(
    prefs.goal === 'school'
      ? []
      : nodes
          .filter(
            (node) =>
              node.assessmentStatus === 'not-assessed-in-edition' &&
              node.lessonTopicId &&
              !nodes.some(
                (other) =>
                  other.lessonTopicId === node.lessonTopicId &&
                  other.assessmentStatus === 'assessed',
              ),
          )
          .map((node) => node.lessonTopicId!),
  );
  const add = (candidate: Candidate) => {
    if (!candidate.subject || !selected.has(candidate.subject)) return;
    if (
      prefs.goal !== 'school' &&
      (candidate.kind === 'study' || candidate.kind === 'review') &&
      ((candidate.topicId && skippedLessons.has(candidate.topicId)) ||
        (candidate.curriculumNodeId && skippedNodes.has(candidate.curriculumNodeId)))
    ) return;
    const existing = result.findIndex((entry) => entry.key === candidate.key);
    if (existing < 0) result.push(candidate);
    else if (result[existing].priority < candidate.priority) {
      // Raising a ready lesson's start priority must not discard its verified source link.
      if (result[existing].curriculumNodeId && !candidate.curriculumNodeId && candidate.kind === 'study')
        result[existing].priority = candidate.priority;
      else result[existing] = candidate;
    }
  };
  for (const topic of topics.filter(
    (topic) => selected.has(topic.subject) && canUseLocalLesson(topic),
  )) {
    if (excludedLessons.has(topic.id)) continue;
    const progress = learning.progress[topic.id];
    const reviewAt = timestamp(progress?.nextReviewAt);
    const due = reviewAt && localStudyDate(reviewAt) <= date;
    const recent = progress?.attempts.slice(-5) ?? [];
    const weak = recent.some((attempt) => !attempt.correct || attempt.assisted);
    if (due || weak)
      add({
        key: `lesson:${topic.id}`,
        kind: due ? 'review' : 'study',
        subject: topic.subject,
        title: topic.title,
        topicId: topic.id,
        priority: due ? 120 : 105,
        reason: due
          ? 'Повторение по сохранённому сроку.'
          : 'В последних попытках есть ошибки или ответы с помощью.',
      });
  }
  for (const entry of state.schoolTopics) {
    if (
      entry.date > date ||
      entry.date < shiftStudyDate(date, -14) ||
      entry.status === 'understood'
    )
      continue;
    add({
      key: entry.topicId ? `lesson:${entry.topicId}` : `school:${entry.id}`,
      kind: 'school',
      subject: entry.subject,
      title: entry.title,
      topicId: entry.topicId,
      curriculumNodeId: entry.curriculumNodeId,
      schoolTopicId: entry.id,
      priority: entry.status === 'needs-help' ? 150 : 130,
      reason: `Школьный запрос от ${entry.date}. ${entry.status === 'needs-help' ? 'Нужна помощь по отметке ученика.' : 'Ученик просит практику.'} Это не подтверждение освоения и не обязательное задание ЕГЭ.`,
    });
  }
  for (const entry of state.customTopics)
    add({
      key: entry.topicId ? `lesson:${entry.topicId}` : `custom:${entry.id}`,
      kind: 'custom',
      subject: entry.subject,
      title: entry.title,
      topicId: entry.topicId,
      customTopicId: entry.id,
      priority: 80,
      reason:
        'Собственная тема ученика; включена по его выбору, не объявлена обязательной темой ЕГЭ.',
    });
  for (const node of nodes) {
    if (
      !selected.has(node.subject) ||
      node.assessmentStatus === 'section' ||
      node.editionStatus !== 'final'
    )
      continue;
    const schoolCard = node.id.startsWith('ege-') ? getSchoolTopic(node.id.replace(/^ege-/, 'school-')) : undefined;
    if (prefs.schoolGrade >= 8 && schoolCard && (schoolCard.foundation || !schoolCard.grades.includes(prefs.schoolGrade as 8 | 9 | 10 | 11))) continue;
    if (node.assessmentStatus === 'not-assessed-in-edition' && prefs.goal !== 'school') continue;
    const examLevels = node.examLevels;
    // School programme level is not an EGE exam level. Unknown mappings are not guessed.
    if (
      node.subject === 'math' &&
      prefs.goal !== 'school' &&
      prefs.mathLevel !== 'undecided' &&
      !examLevels?.includes(prefs.mathLevel)
    )
      continue;
    if (
      prefs.goal === 'school' &&
      node.schoolGrades.length &&
      !node.schoolGrades.includes(prefs.schoolGrade)
    )
      continue;
    if (!line(node.title) || !safeId(node.id)) continue;
    const mappedTopicId = lessonId(node.lessonTopicId, node.subject);
    const mappedTopic = topics.find((topic) => topic.id === mappedTopicId);
    const topicId = mappedTopic && canUseLocalLesson(mappedTopic) ? mappedTopic.id : undefined;
    const lessonTitle = topicId ? topics.find((topic) => topic.id === topicId)?.title : undefined;
    const gradeMatch = node.schoolGrades.includes(prefs.schoolGrade);
    const priority = (prefs.goal === 'ege' ? 55 : 45) + (gradeMatch ? 25 : 0) + (topicId ? 15 : 0);
    add({
      key: topicId ? `lesson:${topicId}` : `curriculum:${node.id}`,
      kind: prefs.goal === 'school' ? 'school' : 'study',
      subject: node.subject,
      title: lessonTitle ?? node.title,
      topicId,
      curriculumNodeId: node.id,
      priority,
      reason: `Кодификатор ${node.editionYear}, пункт ${node.code}. ${node.assessmentStatus === 'not-assessed-in-edition' ? 'В этой редакции не проверяется на ЕГЭ; включено для школьной подготовки. ' : ''}${node.gradeNote || 'Распределение по классам ориентировочное.'}${topicId ? '' : ' Доступен обзор и собственная заметка; готовый интерактивный урок пока не сопоставлен.'}`,
    });
  }
  // Only grade-appropriate existing practice is an automatic start. Earlier lessons stay accessible manually.
  for (const topic of topics.filter(
    (topic) =>
      selected.has(topic.subject) && !excludedLessons.has(topic.id) && canUseLocalLesson(topic),
  ))
    add({
      key: `lesson:${topic.id}`,
      kind: 'study',
      subject: topic.subject,
      title: topic.title,
      topicId: topic.id,
      priority: prefs.schoolGrade >= 8 && topic.subject === 'math' ? (topic.id === 'math-absolute' ? 98 : 96) : 20,
      reason:
        'Локальный учебный материал Cosmos. Это предложение для практики, а не официальное задание или подтверждение освоения.',
    });
  return result.sort((a, b) => b.priority - a.priority || a.key.localeCompare(b.key, 'en'));
}

/** Create calendar weeks (Monday–Sunday) or a complete calendar month. No existing day is overwritten by default. */
export function generateStudyPlan(
  state: StudyPlanningState,
  learning: LearningState,
  nodes: readonly CurriculumNode[],
  options: GenerateStudyPlanOptions,
): StudyPlanningState {
  if (!['week', 'month'].includes(options.period))
    throw new Error('Выбери план на неделю или месяц.');
  const next = clone(state);
  const prefs = normalizePreferences(
    {
      ...options,
      subjects:
        options.subjects ??
        next.preferences.subjects.filter((item) =>
          learning.profile.selectedSubjects.includes(item),
        ),
    },
    next.preferences,
  );
  next.preferences = prefs;
  const dates = planDates(options.period, options.anchorDate),
    uses = new Map<string, number>();
  const pastUses = new Map<string, number>();
  for (const run of Object.values(state.runs)) {
    if (run.date >= options.anchorDate || !['completed', 'finished-early'].includes(run.status))
      continue;
    for (const block of run.blocks) {
      if (block.status !== 'completed' || block.kind === 'break' || !block.startedAt) continue;
      const key = block.topicId
        ? `lesson:${block.topicId}`
        : block.customTopicId
          ? `custom:${block.customTopicId}`
          : block.schoolTopicId
            ? `school:${block.schoolTopicId}`
            : block.curriculumNodeId
              ? `curriculum:${block.curriculumNodeId}`
              : null;
      if (key) pastUses.set(key, (pastUses.get(key) ?? 0) + 1);
    }
  }
  for (const date of dates) {
    // Backfilled calendar cells are plans, not studied history; they must not push
    // today's highest-priority topic away merely because the week starts earlier.
    if (date === options.anchorDate) uses.clear();
    const hasRun = Object.values(next.runs).some((run) => run.date === date);
    if (next.days[date] && (!options.replace || hasRun)) continue;
    const budget = prefs.weekdays.includes(calendarDate(date)!.getDay()) ? prefs.dailyMinutes : 0;
    const day: StudyDayPlan = { date, budgetMinutes: budget, entries: [], edited: false };
    const candidates = candidatesForDay(next, learning, nodes, date, prefs);
    let remaining = budget;
    const usedToday = new Set<string>();
    const subjectUses = new Map<SubjectId, number>();
    while (remaining > 0 && candidates.length && day.entries.length < MAX_BLOCKS) {
      const available = candidates.filter((candidate) => !usedToday.has(candidate.key));
      const availablePool = available.length ? available : candidates;
      // In a balanced day, give each selected subject its first block before
      // repeating a room. An unlinked broad catalogue must not crowd math out.
      const unvisited = availablePool.filter(
        (candidate) => (subjectUses.get(candidate.subject!) ?? 0) === 0,
      );
      const pool = prefs.goal === 'balanced' && unvisited.length ? unvisited : availablePool;
      const score = (entry: Candidate) =>
        entry.priority -
        (uses.get(entry.key) ?? 0) * 15 -
        (subjectUses.get(entry.subject!) ?? 0) * 22 -
        (entry.priority >= 100 ? 0 : (pastUses.get(entry.key) ?? 0) * 45);
      const candidate = [...pool].sort(
        (a, b) => score(b) - score(a) || a.key.localeCompare(b.key, 'en'),
      )[0];
      const { priority: _priority, key, ...entry } = candidate;
      const minutes = remaining <= 30 ? remaining : 25;
      day.entries.push({ ...entry, id: nextId(next, 'block'), minutes });
      remaining -= minutes;
      uses.set(key, (uses.get(key) ?? 0) + 1);
      usedToday.add(key);
      subjectUses.set(candidate.subject!, (subjectUses.get(candidate.subject!) ?? 0) + 1);
      if (remaining >= 10 && day.entries.length < MAX_BLOCKS - 1) {
        day.entries.push({
          id: nextId(next, 'block'),
          kind: 'break',
          title: 'Перерыв',
          minutes: 5,
          reason: 'Отдых входит в выбранное время занятия.',
        });
        remaining -= 5;
      }
    }
    next.days[date] = day;
  }
  const id = `${options.period}-${dates[0]}`;
  next.plans[id] = {
    id,
    period: options.period,
    startDate: dates[0],
    endDate: dates.at(-1)!,
    dates,
    preferences: structuredClone(prefs),
  };
  return next;
}
export const ensureStudyPlan = generateStudyPlan;

function editableDay(state: StudyPlanningState, date: LocalDate) {
  requireDate(date);
  if (
    Object.values(state.runs).some(
      (run) => run.date === date && ['active', 'paused'].includes(run.status),
    )
  )
    throw new Error('План уже начат. Сначала заверши или досрочно подведи итог занятия.');
  state.days[date] ??= {
    date,
    budgetMinutes: state.preferences.dailyMinutes,
    entries: [],
    edited: true,
  };
  return state.days[date];
}
export function studyDayMinutes(day: StudyDayPlan) {
  return day.entries.reduce((sum, entry) => sum + entry.minutes, 0);
}
function validateAllocation(day: StudyDayPlan) {
  if (day.entries.length > MAX_BLOCKS || studyDayMinutes(day) > day.budgetMinutes)
    throw new Error(
      'Блоки вместе с перерывами превышают время дня. Уменьши их длительность или увеличь бюджет.',
    );
}
/** Shrinking a budget trims the last blocks, never mutates an active run or invents completed work. */
export function updateStudyDayMinutes(
  state: StudyPlanningState,
  date: LocalDate,
  minutes: number,
  options: { trim?: boolean } = {},
): StudyPlanningState {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > MAX_MINUTES)
    throw new Error('Время дня: от 0 до 720 минут.');
  const next = clone(state),
    day = editableDay(next, date);
  day.budgetMinutes = minutes;
  if (options.trim) {
    let remaining = minutes;
    day.entries = day.entries.flatMap((entry) => {
      if (!remaining) return [];
      const kept = { ...entry, minutes: Math.min(entry.minutes, remaining) };
      remaining -= kept.minutes;
      return [kept];
    });
    while (day.entries.at(-1)?.kind === 'break') day.entries.pop();
  }
  validateAllocation(day);
  day.edited = true;
  return next;
}
export function updateStudyPreferences(
  state: StudyPlanningState,
  preferences: Partial<StudyPreferences>,
): StudyPlanningState {
  const next = clone(state);
  next.preferences = normalizePreferences(preferences, next.preferences);
  return next;
}
export function addStudyBlock(
  state: StudyPlanningState,
  date: LocalDate,
  input: StudyBlockInput,
  index?: number,
): StudyPlanningState {
  const next = clone(state),
    day = editableDay(next, date),
    block = normalizedBlock({ ...input, id: nextId(next, 'block') });
  if (
    !block ||
    !Number.isInteger(input.minutes) ||
    input.minutes < 1 ||
    input.minutes > MAX_MINUTES
  )
    throw new Error('Укажи тему, предмет и длительность блока.');
  day.entries.splice(integer(index, day.entries.length, 0, day.entries.length), 0, block);
  validateAllocation(day);
  day.edited = true;
  return next;
}
export function updateStudyBlock(
  state: StudyPlanningState,
  date: LocalDate,
  blockId: string,
  patch: Partial<StudyBlockInput>,
): StudyPlanningState {
  const next = clone(state),
    day = editableDay(next, date),
    index = day.entries.findIndex((entry) => entry.id === blockId);
  if (index < 0) throw new Error('Блок не найден.');
  const block = normalizedBlock({ ...day.entries[index], ...patch, id: blockId });
  if (
    !block ||
    (patch.minutes !== undefined &&
      (!Number.isInteger(patch.minutes) || patch.minutes < 1 || patch.minutes > MAX_MINUTES))
  )
    throw new Error('Проверь тему и время блока.');
  day.entries[index] = block;
  validateAllocation(day);
  day.edited = true;
  return next;
}
export function removeStudyBlock(
  state: StudyPlanningState,
  date: LocalDate,
  blockId: string,
): StudyPlanningState {
  const next = clone(state),
    day = editableDay(next, date);
  day.entries = day.entries.filter((entry) => entry.id !== blockId);
  day.edited = true;
  return next;
}
export function moveStudyBlock(
  state: StudyPlanningState,
  fromDate: LocalDate,
  toDate: LocalDate,
  blockId: string,
  index?: number,
): StudyPlanningState {
  const next = clone(state),
    from = editableDay(next, fromDate),
    to = editableDay(next, toDate),
    at = from.entries.findIndex((entry) => entry.id === blockId);
  if (at < 0) throw new Error('Блок для переноса не найден.');
  const [entry] = from.entries.splice(at, 1);
  to.entries.splice(integer(index, to.entries.length, 0, to.entries.length), 0, entry);
  validateAllocation(to);
  from.edited = true;
  to.edited = true;
  return next;
}
export function addCustomTopic(
  state: StudyPlanningState,
  input: { subject: SubjectId; title: string; notes?: string; topicId?: string },
  now?: StudyClock,
): { state: StudyPlanningState; id: string } {
  if (!subject(input.subject) || !line(input.title))
    throw new Error('Укажи предмет и название своей темы.');
  if (state.customTopics.length >= 300) throw new Error('В списке уже 300 собственных тем.');
  const next = clone(state),
    id = nextId(next, 'custom');
  next.customTopics.push({
    id,
    subject: input.subject,
    title: line(input.title),
    notes: line(input.notes, 2000),
    createdAt: instant(now),
    ...(lessonId(input.topicId, input.subject) ? { topicId: input.topicId } : {}),
  });
  return { state: next, id };
}
export function recordSchoolTopic(
  state: StudyPlanningState,
  input: {
    date: LocalDate;
    subject: SubjectId;
    title: string;
    note?: string;
    status?: SchoolTopicObservation['status'];
    curriculumNodeId?: string;
    topicId?: string;
  },
  now?: StudyClock,
): { state: StudyPlanningState; id: string } {
  requireDate(input.date);
  if (!subject(input.subject) || !line(input.title))
    throw new Error('Укажи предмет и школьную тему.');
  if (input.status && !['needs-help', 'practice', 'understood'].includes(input.status))
    throw new Error('Выбери понятный статус школьной темы.');
  const next = clone(state),
    id = nextId(next, 'school');
  next.schoolTopics.push({
    id,
    date: input.date,
    subject: input.subject,
    title: line(input.title),
    note: line(input.note, 2000),
    status: input.status ?? 'practice',
    createdAt: instant(now),
    ...(safeId(input.curriculumNodeId) ? { curriculumNodeId: input.curriculumNodeId } : {}),
    ...(lessonId(input.topicId, input.subject) ? { topicId: input.topicId } : {}),
  });
  next.schoolTopics = next.schoolTopics.slice(-1000);
  return { state: next, id };
}

function requireRun(state: StudyPlanningState, id: string): StudyDayRun {
  const run = state.runs[id];
  if (!run) throw new Error('Занятие дня не найдено.');
  return run;
}
function openRun(state: StudyPlanningState, id: string) {
  const run = requireRun(state, id);
  if (!['active', 'paused'].includes(run.status))
    throw new Error('Итог этого занятия уже сохранён. Начни новое занятие.');
  if (state.activeRunId && state.activeRunId !== id)
    throw new Error('Сначала заверши другое начатое занятие.');
  return run;
}
export function startStudyDay(
  state: StudyPlanningState,
  date: LocalDate,
  now?: StudyClock,
): { state: StudyPlanningState; runId: string; resumed: boolean } {
  requireDate(date);
  const active = state.activeRunId && state.runs[state.activeRunId];
  if (active && ['active', 'paused'].includes(active.status))
    return { state: resumeStudyDay(state, active.id), runId: active.id, resumed: true };
  const plan = state.days[date];
  if (!plan?.entries.some((entry) => entry.kind !== 'break'))
    throw new Error('Добавь хотя бы один учебный блок в этот день.');
  validateAllocation(plan);
  const next = clone(state),
    id = nextId(next, 'day');
  next.runs[id] = {
    id,
    date,
    startedAt: instant(now),
    status: 'active',
    blocks: plan.entries.map((entry) => ({
      ...structuredClone(entry),
      status: 'pending',
      attemptBaseline: [],
      sessionActiveMsAtStart: 0,
      activeMs: 0,
    })),
  };
  next.activeRunId = id;
  return { state: next, runId: id, resumed: false };
}
function sessionAttempts(block: StudyBlockRun, learning: LearningState): Attempt[] {
  if (!block.sessionId || !block.topicId || !block.subject) return [];
  const session = learning.sessions[block.sessionId];
  if (!session || session.subject !== block.subject || session.topicId !== block.topicId) return [];
  const taskIds = new Set(
    topics.find((topic) => topic.id === block.topicId)?.tasks.map((task) => task.id) ?? [],
  );
  return (learning.progress[block.topicId]?.attempts ?? []).filter(
    (attempt) =>
      attempt.sessionId === block.sessionId &&
      taskIds.has(attempt.taskId) &&
      !!timestamp(attempt.at) &&
      typeof attempt.correct === 'boolean' &&
      typeof attempt.assisted === 'boolean',
  );
}
const attemptIdentity = (attempt: Attempt) =>
  JSON.stringify([attempt.taskId, attempt.at, attempt.correct, attempt.assisted]);
function collectBlockEvidence(
  block: StudyBlockRun,
  learning: LearningState,
  at: string,
): StudyBlockEvidence {
  const result = emptyEvidence();
  if (!block.startedAt) return result;
  result.activeMs = block.activeMs;
  const session = block.sessionId ? learning.sessions[block.sessionId] : undefined;
  if (!session || session.topicId !== block.topicId || session.subject !== block.subject)
    return result;
  result.sessionId = session.id;
  // Session activity is recorded by the app's focus/idle-aware clock, not by wall time here.
  result.activeMs = Math.max(
    result.activeMs,
    Math.max(0, (session.activeMs ?? 0) - block.sessionActiveMsAtStart),
  );
  const baseline = new Map<string, number>();
  for (const id of block.attemptBaseline) baseline.set(id, (baseline.get(id) ?? 0) + 1);
  for (const attempt of sessionAttempts(block, learning)) {
    const id = attemptIdentity(attempt),
      before = baseline.get(id) ?? 0;
    if (before) {
      baseline.set(id, before - 1);
      continue;
    }
    const date = timestamp(attempt.at)!;
    if (date < block.startedAt || date > at) continue;
    result.attempts += 1;
    if (!attempt.correct) result.incorrect += 1;
    else if (attempt.assisted) result.assistedCorrect += 1;
    else result.independentCorrect += 1;
  }
  return result;
}
export function startStudyBlock(
  state: StudyPlanningState,
  runId: string,
  blockId: string,
  learning: LearningState,
  sessionId?: string,
  now?: StudyClock,
): StudyPlanningState {
  const next = clone(state),
    run = openRun(next, runId),
    block = run.blocks.find((entry) => entry.id === blockId);
  if (!block) throw new Error('Учебный блок не найден.');
  if (['completed', 'skipped'].includes(block.status))
    throw new Error('Этот блок уже завершён или пропущен.');
  if (run.activeBlockId && run.activeBlockId !== blockId)
    throw new Error('Сначала заверши или пропусти текущий блок.');
  if (block.startedAt) {
    if (sessionId && block.sessionId !== sessionId)
      throw new Error('Начатый блок связан с другим занятием.');
    run.status = 'active';
    block.status = 'active';
    run.activeBlockId = block.id;
    next.activeRunId = run.id;
    return next;
  }
  if (sessionId) {
    const session = learning.sessions[sessionId];
    if (
      block.kind === 'break' ||
      !session ||
      !block.topicId ||
      session.topicId !== block.topicId ||
      session.subject !== block.subject
    )
      throw new Error('Выбери занятие именно этого предмета и темы.');
    block.sessionId = sessionId;
    block.sessionActiveMsAtStart = integer(session.activeMs, 0, 0, 86_400_000);
  }
  block.startedAt = instant(now);
  block.status = 'active';
  block.attemptBaseline = sessionAttempts(block, learning).map(attemptIdentity);
  run.activeBlockId = block.id;
  run.status = 'active';
  next.activeRunId = run.id;
  return next;
}
export function pauseStudyDay(state: StudyPlanningState, runId: string): StudyPlanningState {
  const next = clone(state),
    run = openRun(next, runId);
  run.status = 'paused';
  for (const block of run.blocks) if (block.status === 'active') block.status = 'paused';
  return next;
}
export function resumeStudyDay(state: StudyPlanningState, runId: string): StudyPlanningState {
  const next = clone(state),
    run = openRun(next, runId);
  run.status = 'active';
  next.activeRunId = runId;
  const block = run.blocks.find((entry) => entry.id === run.activeBlockId);
  if (block?.status === 'paused') block.status = 'active';
  return next;
}
/** The UI may supply only measured foreground activity, at most one minute per tick. */
export function recordStudyActivity(
  state: StudyPlanningState,
  runId: string,
  blockId: string,
  deltaMs: number,
): StudyPlanningState {
  if (!Number.isFinite(deltaMs) || deltaMs <= 0 || deltaMs > 60_000) return state;
  const run = state.runs[runId],
    block = run?.blocks.find((entry) => entry.id === blockId);
  if (run?.status !== 'active' || block?.status !== 'active' || run.activeBlockId !== block.id)
    return state;
  return {
    ...state,
    runs: {
      ...state.runs,
      [runId]: {
        ...run,
        blocks: run.blocks.map((entry) =>
          entry.id === blockId
            ? { ...entry, activeMs: Math.min(86_400_000, block.activeMs + Math.floor(deltaMs)) }
            : entry,
        ),
      },
    },
  };
}
export function addStudyActiveTime(
  state: StudyPlanningState,
  runId: string,
  deltaMs: number,
): StudyPlanningState {
  const run = state.runs[runId];
  if (!run?.activeBlockId || !Number.isFinite(deltaMs) || deltaMs <= 0 || deltaMs > 5000)
    return state;
  return recordStudyActivity(state, runId, run.activeBlockId, deltaMs);
}
export function setStudyBlockNote(
  state: StudyPlanningState,
  runId: string,
  blockId: string,
  note: string,
): StudyPlanningState {
  const next = clone(state),
    run = openRun(next, runId),
    block = run.blocks.find((entry) => entry.id === blockId);
  if (!block) throw new Error('Учебный блок не найден.');
  block.note = typeof note === 'string' ? note.slice(0, 2000) : '';
  return next;
}
export function completeStudyBlock(
  state: StudyPlanningState,
  runId: string,
  blockId: string,
  learning: LearningState,
  now?: StudyClock,
): StudyPlanningState {
  const old = requireRun(state, runId),
    prior = old.blocks.find((entry) => entry.id === blockId);
  if (prior?.status === 'completed') return state; // repeated clicks never duplicate evidence
  const next = clone(state),
    run = openRun(next, runId),
    block = run.blocks.find((entry) => entry.id === blockId);
  if (!block?.startedAt || !['active', 'paused'].includes(block.status))
    throw new Error('Сначала начни этот блок. Открытие плана не завершает задания.');
  const at = instant(now);
  if (at < block.startedAt) throw new Error('Время завершения раньше начала блока.');
  block.evidence = collectBlockEvidence(block, learning, at);
  block.status = 'completed';
  block.completedAt = at;
  if (run.activeBlockId === blockId) delete run.activeBlockId;
  return next;
}
export function skipStudyBlock(
  state: StudyPlanningState,
  runId: string,
  blockId: string,
  learning: LearningState,
  now?: StudyClock,
): StudyPlanningState {
  const prior = requireRun(state, runId).blocks.find((entry) => entry.id === blockId);
  if (prior?.status === 'skipped') return state;
  const next = clone(state),
    run = openRun(next, runId),
    block = run.blocks.find((entry) => entry.id === blockId);
  if (!block || block.status === 'completed')
    throw new Error('Завершённый блок нельзя превратить в пропущенный.');
  const at = instant(now);
  if (block.startedAt && at < block.startedAt)
    throw new Error('Время завершения раньше начала блока.');
  if (block.startedAt) block.evidence = collectBlockEvidence(block, learning, at);
  block.status = 'skipped';
  block.completedAt = at;
  if (run.activeBlockId === blockId) delete run.activeBlockId;
  return next;
}
function summarizeRun(run: StudyDayRun, at: string, endedEarly: boolean): StudyDayReport {
  const rows = run.blocks
    .filter((block) => block.kind !== 'break' && !!block.startedAt)
    .map((block) => ({
      ...hydrateEvidence(block.evidence),
      id: block.id,
      title: block.title,
      status: block.status,
    }));
  const totals = rows.reduce(
    (sum, row) => ({
      attempts: sum.attempts + row.attempts,
      independentCorrect: sum.independentCorrect + row.independentCorrect,
      assistedCorrect: sum.assistedCorrect + row.assistedCorrect,
      incorrect: sum.incorrect + row.incorrect,
      activeMs: sum.activeMs + row.activeMs,
    }),
    emptyEvidence(),
  );
  return {
    ...totals,
    runId: run.id,
    date: run.date,
    finishedAt: at,
    endedEarly,
    plannedMinutes: run.blocks.reduce((sum, block) => sum + block.minutes, 0),
    completedMinutes: run.blocks
      .filter((block) => block.status === 'completed')
      .reduce((sum, block) => sum + block.minutes, 0),
    completedBlocks: run.blocks.filter(
      (block) => block.kind !== 'break' && block.status === 'completed',
    ).length,
    completedBreaks: run.blocks.filter(
      (block) => block.kind === 'break' && block.status === 'completed',
    ).length,
    skippedBlocks: run.blocks.filter(
      (block) => block.kind !== 'break' && block.status === 'skipped',
    ).length,
    unfinishedBlocks: run.blocks.filter(
      (block) => block.kind !== 'break' && !['completed', 'skipped'].includes(block.status),
    ).length,
    sessionCount: new Set(rows.flatMap((row) => (row.sessionId ? [row.sessionId] : []))).size,
    blocks: rows,
    limitations: [
      'Завершение блока — отметка о работе, а не подтверждение освоения темы.',
      'Плановые минуты включают перерывы и не равны фактически измеренному времени.',
      'Попытки взяты только из связанных занятий после старта блока; помощь учитывается отдельно.',
      'Класс и школьное распределение — ориентир; программа ЕГЭ не заменяет расписание учителя.',
    ],
  };
}
export function finishStudyDay(
  state: StudyPlanningState,
  runId: string,
  learning: LearningState,
  options: { early?: boolean; now?: StudyClock } = {},
): StudyPlanningState {
  const prior = requireRun(state, runId);
  if (prior.status === 'completed' || prior.status === 'finished-early') return state;
  const next = clone(state),
    run = openRun(next, runId),
    at = instant(options.now);
  if (at < run.startedAt) throw new Error('Время итога раньше начала занятия.');
  const remaining = run.blocks.some((block) => !['completed', 'skipped'].includes(block.status));
  if (remaining && !options.early)
    throw new Error('Остались незавершённые блоки. Выбери досрочный итог или продолжи занятие.');
  for (const block of run.blocks) {
    if (block.startedAt && !block.evidence)
      block.evidence = collectBlockEvidence(block, learning, at);
    if (block.status === 'active') block.status = 'paused';
  }
  run.status = options.early ? 'finished-early' : 'completed';
  run.finishedAt = at;
  delete run.activeBlockId;
  run.report = summarizeRun(run, at, !!options.early);
  if (next.activeRunId === runId) delete next.activeRunId;
  return next;
}
/** Shared by the saved PDF text and report UI, including sessions shorter than a minute. */
export function formatStudyActivityTime(activeMs: number): string {
  const ms = Number.isFinite(activeMs) ? Math.max(0, activeMs) : 0;
  return ms < 60_000 ? `${Math.floor(ms / 1000)} с` : `${Math.floor(ms / 60_000)} мин`;
}
export function buildStudyReportText(report: StudyDayReport): string {
  return [
    `# Итог занятия — ${report.date}`,
    report.endedEarly
      ? 'Занятие завершено досрочно.'
      : 'Запланированные блоки разобраны; пропущенные отмечены отдельно.',
    `Завершено учебных блоков: ${report.completedBlocks}. Перерывов: ${report.completedBreaks}. Пропущено учебных блоков: ${report.skippedBlocks}. Осталось незавершёнными: ${report.unfinishedBlocks}.`,
    `В плане: ${report.plannedMinutes} мин, включая перерывы. Плановая длительность завершённых блоков: ${report.completedMinutes} мин. Это не замер фактического времени.`,
    `Измеренная учебная активность: ${formatStudyActivityTime(report.activeMs)}.`,
    `Проверенных попыток: ${report.attempts}. Самостоятельных верных: ${report.independentCorrect}. Верных с помощью: ${report.assistedCorrect}. Ошибок: ${report.incorrect}.`,
    ...report.blocks.map(
      (block) =>
        `## ${block.title}\nСтатус: ${{ pending: 'не начат', active: 'начат', paused: 'не завершён', completed: 'завершён', skipped: 'пропущен' }[block.status]}. Проверенных попыток: ${block.attempts}; самостоятельно верно: ${block.independentCorrect}; с помощью: ${block.assistedCorrect}; ошибок: ${block.incorrect}.`,
    ),
    '## Как читать итог',
    ...report.limitations,
  ].join('\n\n');
}
