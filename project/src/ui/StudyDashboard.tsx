import { useEffect, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileText,
  GraduationCap,
  Pause,
  Play,
  Plus,
  Search,
  Sparkles,
  Trash2,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { subjects } from '../domain/catalog';
import { curriculumNodes } from '../domain/curriculum-data';
import type { LearningState, SubjectId } from '../domain/types';
import type { StudyWorkspace } from '../domain/workspace';
import {
  createPlanningState,
  generateStudyPlan,
  localStudyDate,
  shiftStudyDate,
  studyDayMinutes,
  updateStudyDayMinutes,
  updateStudyBlock,
  removeStudyBlock,
  moveStudyBlock,
  type StudyPlanningState,
  type StudyBlock,
  type StudyPreferences,
  type StudyDayRun,
} from '../domain/study-plan';
import { OrbitArt } from './OrbitArt';
import './study-workspace.css';

type StateProps = {
  state: LearningState;
  setState: React.Dispatch<React.SetStateAction<LearningState>>;
  notify: (text: string) => void;
};
export const humanStudyDate = (date: string) =>
  new Date(date + 'T12:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
const kindNames: Record<StudyBlock['kind'], string> = {
  study: 'Разобраться',
  review: 'Повторить',
  school: 'Из школы',
  custom: 'Мой вопрос',
  break: 'Отдохнуть',
};
export function SchoolSync({
  state,
  onAdd,
}: {
  state: LearningState;
  onAdd: (input: {
    title: string;
    subject: SubjectId;
    date: string;
    minutes: number;
    status: 'needs-help' | 'practice' | 'understood';
    note?: string;
  }) => boolean;
}) {
  const [title, setTitle] = useState(''),
    [subject, setSubject] = useState<SubjectId>('math'),
    [date, setDate] = useState(localStudyDate()),
    [status, setStatus] = useState<'needs-help' | 'practice' | 'understood'>('practice'),
    [saved, setSaved] = useState(false);
  const latest = state.planning?.schoolTopics.at(-1);
  return (
    <details className="study-school-panel">
      <summary>
        <GraduationCap size={23} />
        <span>
          <strong>Что проходили в школе?</strong>
          <small>
            {latest
              ? `${latest.title} · ${humanStudyDate(latest.date)}`
              : 'Добавь тему урока — Cosmos учтёт её в подготовке'}
          </small>
        </span>
        <Plus size={18} />
      </summary>
      <div className="study-school-body">
        <p>
          Кодификатор задаёт цели экзамена, а твой учитель — порядок школьных уроков. Соединим их
          через темы, которые ты отмечаешь здесь.
        </p>
        <form
          className="study-school-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (onAdd({ title, subject, date, minutes: 25, status })) {
              setSaved(true);
              setTitle('');
            }
          }}
        >
          <label className="wide">
            Сегодня проходили
            <input
              aria-label="Тема школьного урока"
              placeholder="Например: модули и уравнения с модулем"
              maxLength={200}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setSaved(false);
              }}
            />
          </label>
          <label>
            Предмет
            <select value={subject} onChange={(e) => setSubject(e.target.value as SubjectId)}>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Дата урока
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="wide">
            Как получилось
            <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
              <option value="practice">Хочу закрепить</option>
              <option value="needs-help">Нужен разбор</option>
              <option value="understood">Понятно, только запомнить</option>
            </select>
          </label>
          <button className="button primary wide" disabled={!title.trim() || !date}>
            <Check size={17} /> Учесть школьную тему
          </button>
        </form>
        {saved && (
          <p className="study-success" role="status">
            Школьная тема сохранена.{' '}
            {status === 'understood'
              ? 'Отметка ученика не считается проверенным освоением.'
              : 'Она включена в выбранный день; автоматический хвост плана сокращён в пределах бюджета.'}
          </p>
        )}
      </div>
    </details>
  );
}
export function DailyDashboard({
  state,
  onStart,
  onPlan,
  onCatalog,
  onCheckin,
  onReport,
  onSchool,
  onRoom,
  onMaterials,
  onMinutes,
}: {
  state: LearningState;
  onStart: () => void;
  onPlan: () => void;
  onCatalog: () => void;
  onCheckin: () => void;
  onReport: (id: string) => void;
  onSchool: React.ComponentProps<typeof SchoolSync>['onAdd'];
  onRoom: (subject: SubjectId) => void;
  onMaterials: () => void;
  onMinutes: (minutes: number) => void;
}) {
  const planning = state.planning || createPlanningState(),
    today = localStudyDate(),
    day = planning.days[today],
    active = planning.activeRunId ? planning.runs[planning.activeRunId] : undefined;
  const budget = day?.budgetMinutes ?? planning.preferences.dailyMinutes;
  const [minutes, setMinutes] = useState(budget || 120);
  useEffect(() => setMinutes(budget || 120), [budget]);
  const reports = Object.values(planning.runs)
    .filter((run) => run.report)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, 3);
  const teaching = day?.entries.filter((block) => block.kind !== 'break') || [];
  return (
    <section className="study-space daily-dashboard" aria-label="Сегодняшняя подготовка">
      <div className="study-heading">
        <div>
          <span className="eyebrow">ТВОЙ МАРШРУТ К ЕГЭ</span>
          <h1>Привет, {state.profile.name}!</h1>
          <p>
            {humanStudyDate(today)} · {planning.preferences.schoolGrade} класс ·{' '}
            {planning.preferences.mathLevel === 'basic'
              ? 'Базовая математика'
              : planning.preferences.mathLevel === 'profile'
                ? 'Профильная математика'
                : 'Уровень математики можно выбрать в плане'}
          </p>
        </div>
        <button className="text-button" onClick={onPlan}>
          <CalendarDays size={18} /> Весь план <ArrowRight size={16} />
        </button>
      </div>
      <div className="daily-hero">
        <section className="daily-invitation">
          <span className="pill">
            <Sparkles size={14} /> COSMOS ВЕДЁТ ПО ШАГАМ
          </span>
          <h2>
            {active ? 'Продолжим с места,' : 'Сегодня — понятный'}
            <br />
            <span>{active ? 'где остановились.' : 'шаг к твоей цели.'}</span>
          </h2>
          <p>
            {active
              ? `Занятие от ${humanStudyDate(active.date)} сохранено. Текущий шаг, ответы и оставшаяся последовательность на месте.`
              : `Выбирай время, нажимай начать. Я соберу работу по предметам, добавлю повторения и перерывы. В конце — твой отчёт с реальными попытками и ошибками.`}
          </p>
          <button className="button primary" onClick={onStart}>
            <Play size={18} />
            {active ? 'Продолжить сегодняшнее занятие' : 'Начать сегодняшнее занятие'}
            <ArrowRight size={18} />
          </button>
          <p className="small">
            {teaching.length} учебных {teaching.length === 1 ? 'блок' : 'блока'} ·{' '}
            {day?.entries.filter((block) => block.kind === 'break').length || 0} перерыва · работает
            локально
          </p>
          <div className="daily-orbit">
            <OrbitArt />
          </div>
        </section>
        <aside className="daily-time-card">
          <span className="eyebrow">СКОЛЬКО ВРЕМЕНИ ЕСТЬ?</span>
          <div className="minutes-display">
            {minutes}
            <small>минут, включая отдых</small>
          </div>
          <div className="time-presets">
            {[30, 60, 90, 120].map((n) => (
              <button
                key={n}
                className={minutes === n ? 'active' : ''}
                disabled={!!active}
                onClick={() => {
                  setMinutes(n);
                  onMinutes(n);
                }}
              >
                {n === 120 ? '2 часа' : `${n} мин`}
              </button>
            ))}
          </div>
          <label>
            Другое время
            <input
              aria-label="Минут на сегодняшнее занятие"
              type="number"
              min={5}
              max={360}
              step={5}
              disabled={!!active}
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
            />
          </label>
          <button
            className="text-button"
            disabled={!!active || !Number.isFinite(minutes) || minutes < 5 || minutes > 360}
            onClick={() => onMinutes(minutes)}
          >
            Применить время <Check size={16} />
          </button>
          <p className="small muted">
            {active
              ? 'Время уже начатого занятия сохранено. Следующие дни можно менять в плане.'
              : 'Будет одна последовательность. Подробности и перестановка тем — в плане.'}
          </p>
        </aside>
      </div>
      <section className="daily-path">
        <div className="daily-path-head">
          <h2>Зачем эти темы сегодня</h2>
          <button className="text-button" onClick={onPlan}>
            Посмотреть последовательность <ArrowRight size={15} />
          </button>
        </div>
        <div className="daily-path-grid">
          {teaching.slice(0, 4).map((block, i) => (
            <article className="daily-path-item" data-subject={block.subject} key={block.id}>
              <span>{String(i + 1).padStart(2, '0')}</span>
              <div>
                <strong>{block.title}</strong>
                <small>
                  {subjects.find((s) => s.id === block.subject)?.title} · {block.minutes} мин ·{' '}
                  {kindNames[block.kind]}
                </small>
                <small>
                  {block.kind === 'school'
                    ? 'Продолжение школьного урока'
                    : block.kind === 'review'
                      ? 'Наступил срок повторения'
                      : block.topicId
                        ? 'Объяснение и проверяемая практика'
                        : 'Обзор пункта программы, затем самостоятельная заметка'}
                </small>
              </div>
            </article>
          ))}
        </div>
        {!teaching.length && (
          <p className="muted">
            На сегодня отдых. При нажатии «Начать» Cosmos предложит занятие на выбранное время.
          </p>
        )}
      </section>
      <div className="study-two-columns">
        <SchoolSync state={state} onAdd={onSchool} />
        <section className="study-card study-route-confidence">
          <BookOpen size={26} />
          <h2>Это пригодится на экзамене?</h2>
          <p>
            Открой каталог: у каждой темы есть раздел программы, источник и связь со школой. Личные
            вопросы и школьные дополнения помечены отдельно.
          </p>
          <button className="text-button" onClick={onCatalog}>
            Все темы ЕГЭ <ArrowRight size={16} />
          </button>
        </section>
      </div>
      <details className="study-extra">
        <summary>Диагностика, комнаты и мои материалы</summary>
        <div className="study-extra-actions">
          <button className="button secondary" onClick={onCheckin}>
            Стартовая диагностика
          </button>
          <button className="button secondary" onClick={onMaterials}>
            Мои материалы
          </button>
          {subjects.map((s) => (
            <button className="button secondary" key={s.id} onClick={() => onRoom(s.id)}>
              {s.title}
            </button>
          ))}
        </div>
        <p className="small muted">
          Диагностика помогает уточнить маршрут, но её не нужно проходить перед каждым занятием.
        </p>
      </details>
      {!!reports.length && (
        <section className="daily-reports">
          <h2>Последние итоги</h2>
          <div className="study-report-list">
            {reports.map((run) => (
              <button key={run.id} onClick={() => onReport(run.id)}>
                <FileText size={20} />
                <span>
                  <strong>{humanStudyDate(run.date)}</strong>
                  <small>
                    {' '}
                    · {run.report!.completedBlocks} блоков · {run.report!.independentCorrect}{' '}
                    самостоятельных верных ответов
                    {run.status === 'finished-early' ? ' · досрочный итог' : ''}
                  </small>
                </span>
                <ArrowRight size={18} />
              </button>
            ))}
          </div>
        </section>
      )}
    </section>
  );
}

function BlockEditor({
  block,
  index,
  date,
  onChange,
  onRemove,
  onMove,
  onOpen,
}: {
  block: StudyBlock;
  index: number;
  date: string;
  onChange: (minutes: number) => void;
  onRemove: () => void;
  onMove: (date: string, index?: number) => void;
  onOpen: () => void;
}) {
  const [minutes, setMinutes] = useState(block.minutes),
    [target, setTarget] = useState(date);
  useEffect(() => setMinutes(block.minutes), [block.minutes]);
  return (
    <article className="study-block-editor" data-subject={block.subject}>
      <span className="block-order">{String(index + 1).padStart(2, '0')}</span>
      <div>
        <span className="study-type-label">
          {kindNames[block.kind]}
          {block.subject ? ` · ${subjects.find((s) => s.id === block.subject)?.title}` : ''}
        </span>
        <strong>{block.title}</strong>
        <details className="block-reason">
          <summary>Почему эта тема</summary>
          <p>{block.reason}</p>
          {block.curriculumNodeId && (
            <button className="text-button" onClick={onOpen}>
              Карта темы <ArrowRight size={14} />
            </button>
          )}
        </details>
      </div>
      <label>
        Минут
        <input
          aria-label={`Минут: ${block.title}`}
          type="number"
          min={1}
          max={240}
          value={minutes}
          onChange={(e) => setMinutes(Number(e.target.value))}
        />
        <button className="text-button" onClick={() => onChange(minutes)}>
          Сохранить
        </button>
      </label>
      <label>
        Перенести на
        <input
          type="date"
          aria-label={`Дата: ${block.title}`}
          value={target}
          onChange={(e) => setTarget(e.target.value)}
        />
        <button
          className="text-button"
          disabled={!target || target === date}
          onClick={() => onMove(target)}
        >
          Перенести
        </button>
      </label>
      <div className="block-buttons">
        <button
          className="icon-button"
          disabled={index === 0}
          onClick={() => onMove(date, index - 1)}
          aria-label={`Выше: ${block.title}`}
        >
          <ArrowUp size={16} />
        </button>
        <button
          className="icon-button"
          onClick={() => onMove(date, index + 1)}
          aria-label={`Ниже: ${block.title}`}
        >
          <ArrowDown size={16} />
        </button>
        <button className="icon-button" onClick={onRemove} aria-label={`Убрать: ${block.title}`}>
          <Trash2 size={16} />
        </button>
      </div>
    </article>
  );
}
export function StudyCalendar({
  state,
  setState,
  notify,
  view,
  onView,
  onCatalog,
  onStart,
  onSchool,
  onTopic,
}: {} & StateProps & {
    view: StudyWorkspace;
    onView: (view: StudyWorkspace) => void;
    onCatalog: (date: string) => void;
    onStart: (date: string) => void;
    onSchool: React.ComponentProps<typeof SchoolSync>['onAdd'];
    onTopic: (id: string) => void;
  }) {
  const planning = state.planning || createPlanningState(),
    today = localStudyDate(),
    selected = view.planDate || today;
  const [preferences, setPreferences] = useState<StudyPreferences>(planning.preferences),
    [budget, setBudget] = useState(
      planning.days[selected]?.budgetMinutes ?? planning.preferences.dailyMinutes,
    );
  useEffect(
    () => setBudget(planning.days[selected]?.budgetMinutes ?? planning.preferences.dailyMinutes),
    [selected, planning.days[selected]?.budgetMinutes],
  );
  const period = view.planPeriod;
  const anchor = new Date(selected + 'T12:00:00'),
    first = new Date(anchor);
  if (period === 'week') first.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  else first.setDate(1);
  const count =
    period === 'week' ? 7 : new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const dates = Array.from({ length: count }, (_, i) => shiftStudyDate(localStudyDate(first), i));
  const day = planning.days[selected],
    runForDay = Object.values(planning.runs).find(
      (run) => run.date === selected && ['active', 'paused'].includes(run.status),
    );
  function change(fn: (planning: StudyPlanningState) => StudyPlanningState) {
    try {
      setState((current) => ({
        ...current,
        planning: fn(current.planning || createPlanningState()),
      }));
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Изменение не сохранено.');
    }
  }
  function generate(replace = false) {
    try {
      setState((current) => ({
        ...current,
        planning: generateStudyPlan(
          current.planning || createPlanningState(),
          current,
          curriculumNodes,
          { ...preferences, period, anchorDate: selected, replace },
        ),
      }));
      notify(
        replace
          ? 'Неначатые дни выбранного периода пересобраны.'
          : 'План заполнен. Существующие дни сохранены.',
      );
    } catch (error) {
      notify(error instanceof Error ? error.message : 'План не изменён.');
    }
  }
  function shift(direction: number) {
    const next = new Date(selected + 'T12:00:00');
    if (period === 'week') next.setDate(next.getDate() + direction * 7);
    else {
      next.setDate(1);
      next.setMonth(next.getMonth() + direction);
    }
    onView({ ...view, planDate: localStudyDate(next) });
  }
  return (
    <section className="study-space" aria-label="Календарь подготовки">
      <div className="study-heading">
        <div>
          <span className="eyebrow">ЕГЭ, ШКОЛА И ТВОЙ ТЕМП</span>
          <h1>Мой план подготовки</h1>
          <p>
            Сначала выбери день. Его темы и редактирование появятся ниже — календарь остаётся
            понятным.
          </p>
        </div>
        <button className="button primary" onClick={() => onStart(today)}>
          <Play size={17} /> Заниматься сегодня
        </button>
      </div>
      <div className="study-plan-toolbar">
        <div className="study-segments">
          <button
            className={period === 'week' ? 'active' : ''}
            onClick={() => onView({ ...view, planPeriod: 'week' })}
          >
            Неделя
          </button>
          <button
            className={period === 'month' ? 'active' : ''}
            onClick={() => onView({ ...view, planPeriod: 'month' })}
          >
            Месяц
          </button>
        </div>
        <div className="study-segments">
          <button onClick={() => shift(-1)} aria-label="Предыдущий период">
            <ChevronLeft size={17} />
          </button>
          <button onClick={() => onView({ ...view, planDate: today })}>
            {first.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}
          </button>
          <button onClick={() => shift(1)} aria-label="Следующий период">
            <ChevronRight size={17} />
          </button>
        </div>
        <button className="button secondary" onClick={() => generate(false)}>
          <Sparkles size={17} /> Заполнить свободные дни
        </button>
      </div>
      <div
        className={`study-calendar ${period}`}
        aria-label={period === 'week' ? 'План недели' : 'План месяца'}
      >
        {dates.map((date) => {
          const item = planning.days[date],
            finished = Object.values(planning.runs).some((run) => run.date === date && run.report);
          return (
            <button
              key={date}
              className={`study-day ${date === selected ? 'selected' : ''} ${date === today ? 'today' : ''}`}
              onClick={() => onView({ ...view, planDate: date })}
              aria-label={`${humanStudyDate(date)}${date === selected ? ', выбран' : ''}`}
            >
              <small>
                {new Date(date + 'T12:00:00').toLocaleDateString('ru-RU', { weekday: 'short' })}
              </small>
              <b>{Number(date.slice(-2))}</b>
              <em>
                {item?.entries.length
                  ? `${studyDayMinutes(item)} мин`
                  : item?.budgetMinutes === 0
                    ? 'Отдых'
                    : 'Без плана'}
              </em>
              <small>
                {finished
                  ? 'Есть итог'
                  : item?.entries.filter((block) => block.kind !== 'break').length
                    ? `${item.entries.filter((block) => block.kind !== 'break').length} учебных блоков`
                    : ''}
              </small>
            </button>
          );
        })}
      </div>
      <section className="study-card">
        <div className="study-day-title">
          <div>
            <span className="eyebrow">ВЫБРАННЫЙ ДЕНЬ</span>
            <h2>{humanStudyDate(selected)}</h2>
            <p className="small muted">
              {day
                ? `${studyDayMinutes(day)} из ${day.budgetMinutes} минут распределено`
                : 'Для этого дня пока нет последовательности'}
              {runForDay ? ' · занятие уже начато' : ''}
            </p>
          </div>
          <div className="study-day-budget">
            <label>
              Время дня
              <input
                aria-label="Бюджет выбранного дня"
                type="number"
                min={0}
                max={360}
                step={5}
                value={budget}
                disabled={!!runForDay}
                onChange={(e) => setBudget(Number(e.target.value))}
              />
            </label>
            <button
              className="button secondary"
              disabled={!!runForDay || !Number.isFinite(budget) || budget < 0 || budget > 360}
              onClick={() =>
                change((s) => updateStudyDayMinutes(s, selected, budget, { trim: true }))
              }
            >
              Применить
            </button>
          </div>
        </div>
        {runForDay ? (
          <div className="study-banner">
            <Pause size={21} />
            <div>
              <strong>Последовательность начатого занятия сохранена</strong>
              <span>Заверши его или подведи досрочный итог, чтобы менять этот день.</span>
            </div>
            <button className="button primary" onClick={() => onStart(selected)}>
              Продолжить <ArrowRight size={17} />
            </button>
          </div>
        ) : (
          <>
            <p className="small muted">
              При уменьшении времени сокращается конец дня. Свои темы можно добавлять, менять
              местами и переносить.
            </p>
            {day?.entries.map((block, index) => (
              <BlockEditor
                key={block.id}
                block={block}
                index={index}
                date={selected}
                onChange={(minutes) =>
                  change((s) => updateStudyBlock(s, selected, block.id, { minutes }))
                }
                onRemove={() => change((s) => removeStudyBlock(s, selected, block.id))}
                onMove={(date, index) =>
                  change((s) => moveStudyBlock(s, selected, date, block.id, index))
                }
                onOpen={() => block.curriculumNodeId && onTopic(block.curriculumNodeId)}
              />
            ))}
          </>
        )}
        {!day?.entries.length && (
          <div className="study-empty">
            <CalendarDays size={30} />
            <h3>Этот день можно оставить свободным</h3>
            <p>Или заполнить период автоматически, а затем добавить свои темы.</p>
          </div>
        )}
        <div className="study-run-controls">
          <button
            className="button secondary"
            disabled={!!runForDay}
            onClick={() => onCatalog(selected)}
          >
            <Plus size={17} /> Добавить тему в этот день
          </button>
          {selected === today && (
            <button className="text-button" onClick={() => onStart(selected)}>
              Начать последовательность <ArrowRight size={16} />
            </button>
          )}
        </div>
      </section>
      <details className="study-plan-settings">
        <summary>Настроить маршрут: предметы, класс, время и дни недели</summary>
        <div className="study-preferences-grid">
          <label>
            Класс
            <select
              value={preferences.schoolGrade}
              onChange={(e) =>
                setPreferences({ ...preferences, schoolGrade: Number(e.target.value) })
              }
            >
              {[5, 6, 7, 8, 9, 10, 11].map((n) => (
                <option key={n} value={n}>
                  {n} класс
                </option>
              ))}
            </select>
          </label>
          <label>
            ЕГЭ по математике
            <select
              value={preferences.mathLevel}
              onChange={(e) =>
                setPreferences({
                  ...preferences,
                  mathLevel: e.target.value as StudyPreferences['mathLevel'],
                })
              }
            >
              <option value="basic">Базовая</option>
              <option value="profile">Профильная</option>
              <option value="undecided">Пока не определился</option>
            </select>
          </label>
          <label>
            Год экзамена
            <input
              type="number"
              min={2026}
              max={2035}
              value={preferences.examYear}
              onChange={(e) => setPreferences({ ...preferences, examYear: Number(e.target.value) })}
            />
          </label>
          <label>
            Минут в учебный день
            <input
              type="number"
              min={5}
              max={360}
              step={5}
              value={preferences.dailyMinutes}
              onChange={(e) =>
                setPreferences({ ...preferences, dailyMinutes: Number(e.target.value) })
              }
            />
          </label>
          <label>
            Главный ориентир
            <select
              value={preferences.goal}
              onChange={(e) =>
                setPreferences({ ...preferences, goal: e.target.value as StudyPreferences['goal'] })
              }
            >
              <option value="balanced">ЕГЭ вместе со школой</option>
              <option value="ege">Маршрут ЕГЭ</option>
              <option value="school">Текущая школьная программа</option>
            </select>
          </label>
        </div>
        <div className="study-subject-checks">
          {subjects.map((s) => (
            <label className="study-check" key={s.id}>
              <input
                type="checkbox"
                checked={preferences.subjects.includes(s.id)}
                onChange={(e) =>
                  setPreferences({
                    ...preferences,
                    subjects: e.target.checked
                      ? [...preferences.subjects, s.id]
                      : preferences.subjects.filter((id) => id !== s.id),
                  })
                }
              />
              {s.title}
            </label>
          ))}
        </div>
        <span className="small muted">Учебные дни</span>
        <div className="study-weekdays">
          {[
            [1, 'Пн'],
            [2, 'Вт'],
            [3, 'Ср'],
            [4, 'Чт'],
            [5, 'Пт'],
            [6, 'Сб'],
            [0, 'Вс'],
          ].map(([day, label]) => (
            <button
              key={day}
              className={preferences.weekdays.includes(Number(day)) ? 'active' : ''}
              onClick={() =>
                setPreferences({
                  ...preferences,
                  weekdays: preferences.weekdays.includes(Number(day))
                    ? preferences.weekdays.filter((n) => n !== day)
                    : [...preferences.weekdays, Number(day)],
                })
              }
            >
              {label}
            </button>
          ))}
        </div>
        <p className="small muted">
          Школьные классы — ориентир. Утверждённые материалы для будущего года экзамена появятся
          позднее. База и профиль не смешиваются по предположению о школьном уровне.
        </p>
        <div className="study-run-controls">
          <button
            className="button primary"
            disabled={!preferences.subjects.length || !preferences.weekdays.length}
            onClick={() => generate(false)}
          >
            Сохранить и заполнить свободные дни
          </button>
          <button
            className="text-button"
            disabled={!preferences.subjects.length || !preferences.weekdays.length}
            onClick={() => generate(true)}
          >
            Пересобрать неначатые дни периода
          </button>
        </div>
      </details>
      <SchoolSync state={state} onAdd={onSchool} />
    </section>
  );
}
