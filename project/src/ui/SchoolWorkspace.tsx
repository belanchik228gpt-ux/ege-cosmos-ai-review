import { InfoTip } from './InfoTip';
import { visibleSubtopics } from '../domain/school-topic-search';
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type SetStateAction,
} from 'react';
import {
  ArrowRight,
  Atom,
  BookOpen,
  Brain,
  CalendarDays,
  Check,
  RotateCcw,
  ChevronRight,
  Compass,
  Download,
  FileText,
  FlaskConical,
  Globe2,
  GraduationCap,
  Languages,
  Landmark,
  Leaf,
  Library,
  Monitor,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Sigma,
  Sparkles,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import type { LearningState } from '../domain';
import {
  getProgramSource,
  getSchoolSubject,
  getSchoolUnit,
  programSubjects,
  programUnits,
  programTracks,
  getUnitTrack,
  schoolSources,
  schoolUnits,
  type SchoolGrade,
  type SchoolSubjectId,
  type SchoolUnit,
} from '../domain/school-program';
import {
  createSchoolState,
  planSchoolDays,
  schoolDate,
  startSchoolLesson,
  suggestedSchoolUnits,
  type SchoolDocument,
  type SchoolState,
  type SchoolView,
} from '../domain/school-state';
import { SchoolRoom, type UpdateSchool } from './SchoolRoom';
import { DialogueScene } from '../scenes/DialogueScene';
import { TutorMarkdown } from './TutorMarkdown';
import type { OpenAIController } from './useOpenAI';
import './school.css';
import { PlanMinutes } from './PlanMinutes';
import {
  subtopicProgress,
  setSchoolTopicSkipped,
  schoolTopicSkip,
  schoolUnitSkipped,
} from '../domain/school-progress';

const icons: Record<SchoolSubjectId, typeof Atom> = {
  math: Sigma,
  russian: BookOpen,
  literature: Library,
  english: Languages,
  history: Landmark,
  social: Users,
  geography: Globe2,
  physics: Atom,
  chemistry: FlaskConical,
  biology: Leaf,
  informatics: Monitor,
  project: Compass,
};
export const schoolViewNames: Record<SchoolView, string> = {
  today: 'Сегодня в школе',
  subjects: 'Школьные предметы',
  room: 'Школьное занятие',
  plan: 'Школьный план',
  documents: 'Школьные конспекты',
  memory: 'Школьная память',
};
export function SchoolWorkspace({
  state,
  setState,
  ai,
  onConnect,
  notify,
  searchSignal = 0,
}: {
  state: LearningState;
  setState: Dispatch<SetStateAction<LearningState>>;
  ai: OpenAIController;
  onConnect: () => void;
  notify: (s: string) => void;
  searchSignal?: number;
}) {
  const school = state.school || createSchoolState(),
    today = schoolDate();
  const [allSubtopics, setAllSubtopics] = useState<string>();
  const [track, setTrack] = useState('all');
  const [query, setQuery] = useState(''),
    [course, setCourse] = useState<SchoolSubjectId>(),
    [day, setDay] = useState(today),
    [weekStart, setWeekStart] = useState(today),
    [planQuery, setPlanQuery] = useState(''),
    [openUnit, setOpenUnit] = useState<string>();
  const search = useRef<HTMLInputElement>(null);
  const update: UpdateSchool = (fn) =>
    setState((s) => ({ ...s, school: fn(s.school || createSchoolState()) }));
  useEffect(() => {
    if (searchSignal) {
      setCourse(undefined);
      setTimeout(() => search.current?.focus(), 50);
    }
  }, [searchSignal]);
  const subjects = programSubjects(school.grade),
    available = subjects.map((s) => s.id);
  const visibleCourse = course && available.includes(course) ? course : undefined;
  useEffect(() => setTrack('all'), [visibleCourse, school.grade]);
  const active = school.activeLessonId ? school.lessons[school.activeLessonId] : undefined;
  const gradeLessons = Object.values(school.lessons)
    .filter((l) => l.grade === school.grade)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const selectedUnits = schoolUnits.filter((u) => u.grade === school.grade),
    studied = selectedUnits.filter(
      (u) => school.progress[u.id]?.studiedAt || schoolUnitSkipped(school, u.id),
    ).length;
  const dayItems = (school.days[day] || []).filter(
    (i) => getSchoolUnit(i.unitId)?.grade === school.grade,
  );
  const go = (view: SchoolView) => update((s) => ({ ...s, view }));
  const start = (
    unit: SchoolUnit,
    mode: 'lesson' | 'diagnostic' | 'homework' | 'own' = 'lesson',
    focus = '',
    minutes = 25,
    plan?: { itemId: string; date: string },
  ) => {
    update((s) => {
      const existing = plan
        ? Object.values(s.lessons).find(
            (l) => !l.completedAt && l.planItemId === plan.itemId && l.planDate === plan.date,
          )
        : Object.values(s.lessons)
            .filter(
              (l) => !l.completedAt && l.unitId === unit.id && l.focus === focus && l.mode === mode,
            )
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
      return existing
        ? { ...s, activeLessonId: existing.id, view: 'room' }
        : startSchoolLesson(s, unit, mode, focus, minutes, plan);
    });
    window.scrollTo({ top: 0 });
  };
  const add = (unit: SchoolUnit, date = day) => {
    update((s) => ({
      ...s,
      days: {
        ...s.days,
        [date]: [
          ...(s.days[date] || []),
          { id: crypto.randomUUID(), unitId: unit.id, minutes: 25, done: false, note: '' },
        ],
      },
    }));
    notify(
      `«${unit.title}» добавлена на ${new Date(date + 'T12:00:00').toLocaleDateString('ru-RU')}.`,
    );
  };
  function startToday() {
    const planned = (school.days[today] || []).find(
      (i) => !i.done && getSchoolUnit(i.unitId)?.grade === school.grade,
    );
    if (planned) {
      start(getSchoolUnit(planned.unitId)!, 'lesson', planned.note, planned.minutes, {
        itemId: planned.id,
        date: today,
      });
      return;
    }
    const next = planSchoolDays(school, today, 1, school.dailyMinutes),
      item = (next.days[today] || []).find(
        (i) => !i.done && getSchoolUnit(i.unitId)?.grade === school.grade,
      );
    if (item)
      update(() =>
        startSchoolLesson(next, getSchoolUnit(item.unitId)!, 'lesson', item.note, item.minutes, {
          itemId: item.id,
          date: today,
        }),
      );
    else {
      go('subjects');
      notify('Выбери тему для повторения или добавь свою тему в план.');
    }
  }
  if (school.view === 'room' && active)
    return (
      <SchoolRoom
        key={active.id}
        school={school}
        lesson={active}
        settings={state.settings}
        name={state.profile.name}
        update={update}
        ai={ai}
        onConnect={onConnect}
        onBack={() => {
          setCourse(active.subject);
          go('subjects');
        }}
        onDocument={() => go('documents')}
        notify={notify}
      />
    );
  return (
    <section
      className={`school-workspace ${visibleCourse && school.view === 'subjects' ? 'school-course-focused' : ''}`}
    >
      <header className="school-heading">
        <div>
          <span className="school-eyebrow">
            <GraduationCap size={16} />
            ШКОЛА · 7–11 КЛАССЫ
          </span>
          <h1>{schoolViewNames[school.view === 'room' ? 'today' : school.view]}</h1>
          <p>Понимай материал уроков, разбирай домашнюю работу и двигайся в своём темпе.</p>
        </div>
      </header>
      {school.view === 'today' && (
        <>
          <div className="school-hero ton618-school-hero">
            <div>
              <span className="school-eyebrow">ТВОЙ МАРШРУТ НА СЕГОДНЯ</span>
              <h2>{state.profile.name}, что разберём?</h2>
              <p>
                Выбери время — Cosmos распределит школьные темы на короткие занятия. Можно начать с
                урока в школе или своей домашней работы.
              </p>
              <div className="school-actions">
                <label>
                  Время на сегодня
                  <select
                    aria-label="Минут на школьный день"
                    value={school.dailyMinutes}
                    onChange={(e) =>
                      update((s) => ({ ...s, dailyMinutes: Number(e.target.value) }))
                    }
                  >
                    {[25, 45, 60, 90, 120, 180, 240].map((n) => (
                      <option key={n} value={n}>
                        {n} мин
                      </option>
                    ))}
                  </select>
                </label>
                <button className="button primary" onClick={() => active && !active.completedAt && active.grade === school.grade ? go('room') : startToday()}>
                  Продолжить занятие
                  <ArrowRight size={18} />
                </button>
                <button className="text-button" onClick={() => go('plan')}>Мой план</button>
              </div>
            </div>
          </div>
          <div className="school-metrics">
            <div>
              <span>{subjects.length}</span>
              <p>предметов в {school.grade}-м классе</p>
            </div>
            <div>
              <span>
                {studied}
                <small> / {selectedUnits.length}</small>
              </span>
              <p>разделов отмечено разобранными</p>
              <progress value={studied} max={selectedUnits.length || 1} />
            </div>
            <div>
              <span>{gradeLessons.filter((l) => l.completedAt).length}</span>
              <p>занятий завершено</p>
            </div>
          </div>
          {active && !active.completedAt && active.grade === school.grade && (
            <button className="school-continue" onClick={() => go('room')}>
              <div>
                <small>Продолжить сохранённое занятие</small>
                <strong>{active.title}</strong>
                <span>
                  {getSchoolSubject(active.subject).title} · {active.grade} класс
                </span>
              </div>
              <ArrowRight />
            </button>
          )}
          <div className="school-section-title">
            <h2>Ближайшие шаги</h2>
            <button className="text-button" onClick={() => go('plan')}>
              Весь план
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="school-unit-grid">
            {((school.days[today] || [])
              .filter((i) => !i.done && getSchoolUnit(i.unitId)?.grade === school.grade)
              .map((i) => getSchoolUnit(i.unitId)!)
              .slice(0, 4).length
              ? (school.days[today] || [])
                  .filter((i) => !i.done && getSchoolUnit(i.unitId)?.grade === school.grade)
                  .map((i) => getSchoolUnit(i.unitId)!)
                  .slice(0, 4)
              : suggestedSchoolUnits(school)
            ).map((u) => (
              <QuickUnit key={u.id} unit={u} onOpen={() => start(u)} />
            ))}
          </div>
          <details className="school-panel">
            <summary>Какие предметы включать в мой план?</summary>
            <div className="school-choice-grid">
              {subjects.map((s) => (
                <label key={s.id}>
                  <input
                    type="checkbox"
                    checked={school.selectedSubjects.includes(s.id)}
                    onChange={(e) =>
                      update((x) => ({
                        ...x,
                        selectedSubjects: e.target.checked
                          ? [...x.selectedSubjects, s.id]
                          : x.selectedSubjects.filter((id) => id !== s.id),
                      }))
                    }
                  />
                  {s.title}
                </label>
              ))}
            </div>
          </details>
          <div className="school-section-title">
            <h2>Последние занятия</h2>
            <button className="text-button" onClick={() => go('subjects')}>
              Выбрать другой предмет
            </button>
          </div>
          <div className="school-history">
            {gradeLessons.slice(0, 8).map((l) => (
              <button
                key={l.id}
                onClick={() =>
                  update((s) => ({ ...s, activeLessonId: l.id, subject: l.subject, view: 'room' }))
                }
              >
                <span style={{ color: getSchoolSubject(l.subject).color }}>
                  {getSchoolSubject(l.subject).title}
                </span>
                <strong>{l.title}</strong>
                <small>
                  {l.completedAt ? 'Итог сохранён' : 'Можно продолжить'} ·{' '}
                  {new Date(l.updatedAt).toLocaleDateString('ru-RU')}
                </small>
                <ChevronRight size={17} />
              </button>
            ))}
            {!gradeLessons.length && (
              <p className="school-muted">
                Здесь появятся твои уроки, диагностики и разборы домашней работы.
              </p>
            )}
          </div>
        </>
      )}
      {school.view === 'subjects' && (
        <>
          <div className="school-search">
            <Search size={20} />
            <input
              ref={search}
              aria-label="Поиск школьных тем"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск по темам и содержанию: модуль, молекула, Present Perfect…"
            />
            {query && (
              <button aria-label="Очистить поиск" onClick={() => setQuery('')}>
                <X size={17} />
              </button>
            )}
          </div>
          {visibleCourse && (
            <div className="school-section-title">
              <button
                className="button"
                onClick={() => {
                  setCourse(undefined);
                  setOpenUnit(undefined);
                }}
              >
                Все предметы
              </button>
              <h2 style={{ color: getSchoolSubject(visibleCourse).color }}>
                {getSchoolSubject(visibleCourse).title}
              </h2>
            </div>
          )}
          {visibleCourse && programTracks(visibleCourse, school.grade).length > 1 && (
            <nav className="school-track-picker" aria-label="Курсы предмета">
              <button className={track === 'all' ? 'selected' : ''} onClick={() => setTrack('all')}>
                Все курсы <small>Идут параллельно</small>
              </button>
              {programTracks(visibleCourse, school.grade).map((item, index) => (
                <div key={item.id} className={track === item.id ? 'selected' : ''}>
                  <button onClick={() => setTrack(item.id)}>
                    <strong>{item.title}</strong>
                    <small>{item.units.length} разделов{index === 0 ? ' · своя последовательность' : ''}</small>
                  </button>
                  {item.entryTopic && (
                    <button
                      className="text-button"
                      onClick={() => start(item.units[0], 'lesson', item.entryTopic)}
                    >
                      Начать с аксиом →
                    </button>
                  )}
                </div>
              ))}
            </nav>
          )}
          {!visibleCourse && !query && (
            <div className="school-subject-grid">
              {subjects.map((s) => {
                const Icon = icons[s.id],
                  units = programUnits(s.id, school.grade),
                  done = units.filter(
                    (u) => school.progress[u.id]?.studiedAt || schoolUnitSkipped(school, u.id),
                  ).length;
                return (
                  <button
                    key={s.id}
                    className="school-subject-card"
                    style={{ '--school-color': s.color } as CSSProperties}
                    onClick={() => {
                      setCourse(s.id);
                      setTrack('all');
                      update((x) => ({ ...x, subject: s.id }));
                    }}
                  >
                    <div className="school-subject-icon">
                      <Icon size={33} />
                      <i />
                    </div>
                    <span className="school-card-grade">{school.grade} класс</span>
                    <h2>{s.title}</h2>
                    <p>{s.description}</p>
                    <div className="school-card-tail">
                      <small>
                        {units.length} разделов · {units.reduce((n, u) => n + u.topics.length, 0)}{' '}
                        подтем
                      </small>
                      <ArrowRight size={19} />
                    </div>
                    <progress value={done} max={units.length || 1} />
                    <small>
                      {done ? `Разобрано ${done} из ${units.length}` : 'Начни с любой темы'}
                    </small>
                  </button>
                );
              })}
            </div>
          )}
          {(visibleCourse || query) && (
            <div className="school-course-list">
              {(visibleCourse ? [getSchoolSubject(visibleCourse)] : subjects).map((s) => {
                const units = programUnits(s.id, school.grade, query).filter(
                  (u) => !visibleCourse || track === 'all' || getUnitTrack(u).id === track,
                );
                if (!units.length) return null;
                return (
                  <section key={s.id} style={{ '--school-color': s.color } as CSSProperties}>
                    {!visibleCourse && <h2>{s.title}</h2>}
                    {units.map((u) => (
                      <article
                        key={u.id}
                        className={`school-topic-card ${openUnit === u.id ? 'expanded' : ''}`}
                      >
                              <button
                                className="topic-known-icon"
                                title={schoolUnitSkipped(school, u.id) ? 'Вернуть в изучение' : 'Уже знаю'}
                                aria-label={`${schoolUnitSkipped(school, u.id) ? 'Вернуть в изучение' : 'Уже знаю'}: ${u.title}`}
                                onClick={() =>
                                  update((s) =>
                                    setSchoolTopicSkipped(
                                      s,
                                      u.id,
                                      undefined,
                                      !schoolUnitSkipped(s, u.id),
                                    ),
                                  )
                                }
                              >
                                {schoolUnitSkipped(school, u.id) ? <RotateCcw size={16} /> : <Check size={16} />}
                              </button>
                        <button
                          className="school-topic-title"
                          onClick={() => setOpenUnit(openUnit === u.id ? undefined : u.id)}
                          aria-expanded={openUnit === u.id || !!query.trim()}
                        >
                          <span className="school-unit-index">
                            {String(getUnitTrack(u).order).padStart(2, '0')}
                          </span>
                          <span>
                            <small>
                              {getUnitTrack(u).parallel ? `${getUnitTrack(u).title} · ` : ''}
                              {u.section}
                            </small>
                            <strong>{u.title}</strong>
                            <em>
                              {u.topics.length} подтем ·{' '}
                              {schoolUnitSkipped(school, u.id)
                                ? 'Пропущено — уже знаю: 100%'
                                : school.progress[u.id]?.studiedAt
                                  ? 'Разобрано, можно закрепить'
                                  : school.progress[u.id]?.openedAt
                                    ? 'В процессе'
                                    : 'Ещё не разбирали'}
                            </em>
                          </span>
                          <ChevronRight size={21} />
                        </button>
                        {(openUnit === u.id || !!query.trim()) && (
                          <div className="school-topic-content">
                            <TutorMarkdown text={u.intro} />
                            <div className="school-actions">
                              <button className="button primary" onClick={() => start(u)}>
                                Изучать раздел
                                <ArrowRight size={17} />
                              </button>
                              <button className="button" onClick={() => start(u, 'diagnostic')}>
                                Проверить знания
                              </button>
                              <button className="button" onClick={() => start(u, 'homework')}>
                                Разобрать домашнюю работу
                              </button>
                              <button className="button" onClick={() => add(u)}>
                                <Plus size={16} />В план
                              </button>

                            </div>
                            <h3>Содержание раздела</h3>
                            <InfoTip text="Процент показывает этапы занятия по этой подтеме, а не оценку знаний. Завершение раздела не отмечает все подтемы автоматически." />
                            <div className="school-subtopics">
                              {visibleSubtopics(u, query, allSubtopics === u.id).map(
                                ({ focus: t, label, index }) => (
                                  <div className="school-subtopic-row" key={index}>
                                    <button onClick={() => start(u, 'lesson', t)}>
                                      <span>{index + 1}</span>
                                      <div className="school-subtopic-copy">
                                        <TutorMarkdown text={label} inline />
                                        {subtopicProgress(school, u.id, t) > 0 && <><small>
                                          {schoolTopicSkip(school, u.id, t)
                                            ? 'Пропущено — уже знаю: 100%'
                                            : `Пройдено занятие: ${subtopicProgress(school, u.id, t)}%`}
                                        </small>
                                        <progress
                                          aria-label={`Прогресс: ${t}`}
                                          value={subtopicProgress(school, u.id, t)}
                                          max={100}
                                        /></>}
                                      </div>
                                      <ArrowRight size={14} />
                                    </button>
                                    <button
                                      className="school-skip-topic topic-known-icon"
                                      title={schoolTopicSkip(school, u.id, t) ? 'Вернуть в изучение' : 'Уже знаю'}
                                      aria-label={`${schoolTopicSkip(school, u.id, t) ? 'Вернуть' : 'Пропустить'} тему: ${t}`}
                                      onClick={() =>
                                        update((s) =>
                                          setSchoolTopicSkipped(
                                            s,
                                            u.id,
                                            t,
                                            !schoolTopicSkip(s, u.id, t),
                                          ),
                                        )
                                      }
                                    >
                                      {schoolTopicSkip(school, u.id, t) ? <RotateCcw size={16} /> : <Check size={16} />}
                                    </button>
                                  </div>
                                ),
                              )}
                            </div>
                            {visibleSubtopics(u, query, allSubtopics === u.id).length <
                              u.topics.length &&
                              allSubtopics !== u.id && (
                                <button
                                  className="text-button"
                                  onClick={() => {
                                    setAllSubtopics(u.id);
                                    setCourse(u.subject);
                                    setQuery('');
                                  }}
                                >
                                  Показать всё содержание ({u.topics.length})
                                </button>
                              )}
                            {u.notes && <InfoTip text={u.notes} />}
                            <ProgramEvidence unit={u} notify={notify} />
                          </div>
                        )}
                      </article>
                    ))}
                  </section>
                );
              })}
              {!(visibleCourse ? [visibleCourse] : available).some(
                (s) => programUnits(s, school.grade, query).length,
              ) && (
                <div className="school-panel">
                  <h2>Пока не нашлось</h2>
                  <p>
                    Попробуй другое слово или класс. Свою задачу можно обсудить в комнате нужного
                    предмета.
                  </p>
                </div>
              )}
            </div>
          )}
          <details className="school-panel">
            <summary>
              <ShieldCheck size={18} />
              Как составлена программа и какие учебники можно сверить
            </summary>
            <p>
              Темы связаны с федеральными рабочими программами. Для 10–11 классов выбран базовый
              уровень. Порядок изучения может отличаться в твоей школе. Карточки объединяют близкие
              пункты программы в разделы.
            </p>
            <p>
              Обществознание с сентября 2026 года — с 9-го класса, химия — с 8-го. Индивидуальный
              проект — авторский маршрут по общим требованиям ФГОС. Технология, ИЗО, музыка,
              физкультура и ОБЗР исключены по твоему выбору; иностранный язык — только английский.
            </p>
            <p>
              Библиографические ссылки ведут к издателям. Полные тексты учебников не включены в
              приложение; локально сохранены официальные программы. Объяснения, примеры и проверки в
              Cosmos — авторские.
            </p>
            <div className="school-source-list">
              {schoolSources
                .filter(
                  (s) =>
                    s.kind === 'textbook-reference' &&
                    s.grades.includes(school.grade) &&
                    (!visibleCourse || s.subject === visibleCourse),
                )
                .map((s) => (
                  <a key={s.id} href={s.url} target="_blank" rel="noreferrer">
                    <BookOpen size={16} />
                    <span>
                      {s.title}
                      <small>
                        {s.publisher} · {s.edition}
                      </small>
                    </span>
                  </a>
                ))}
            </div>
          </details>
        </>
      )}
      {school.view === 'plan' && (
        <>
          <div className="school-panel school-plan-builder">
            <div>
              <h2>План, который можно менять</h2>
              <p>
                Сначала выбери дату и время. Добавляй школьные темы, меняй порядок и вписывай свои
                задания.
              </p>
            </div>
            <div className="school-actions">
              <label>
                С даты
                <input
                  type="date"
                  aria-label="Дата школьного плана"
                  value={day}
                  onChange={(e) => {
                    if (e.target.value) {
                      setDay(e.target.value);
                      setWeekStart(e.target.value);
                    }
                  }}
                />
              </label>
              <label>
                Минут в день
                <PlanMinutes
                  value={school.dailyMinutes}
                  min={10}
                  label="Минут в школьном дне"
                  onCommit={(minutes) => update((s) => ({ ...s, dailyMinutes: minutes }))}
                />
              </label>
              {[
                { n: 1, t: 'День' },
                { n: 7, t: 'Неделя' },
                { n: 30, t: 'Месяц' },
              ].map((o) => (
                <button
                  className="button"
                  key={o.n}
                  onClick={() => {
                    update((s) => planSchoolDays(s, day, o.n, s.dailyMinutes));
                    notify('Новые дни заполнены. Твои существующие записи сохранены.');
                  }}
                >
                  {o.t}
                </button>
              ))}
            </div>
          </div>
          <div className="school-actions">
            <button
              className="button"
              onClick={() => {
                const d = new Date(weekStart + 'T12:00:00');
                d.setDate(d.getDate() - 7);
                setWeekStart(schoolDate(d));
              }}
            >
              ← Предыдущая неделя
            </button>
            <button
              className="button"
              onClick={() => {
                setDay(today);
                setWeekStart(today);
              }}
            >
              Сегодня
            </button>
            <button
              className="button"
              onClick={() => {
                const d = new Date(weekStart + 'T12:00:00');
                d.setDate(d.getDate() + 7);
                setWeekStart(schoolDate(d));
              }}
            >
              Следующая неделя →
            </button>
          </div>
          <div className="school-day-tabs">
            {Array.from({ length: 7 }, (_, i) => {
              const d = new Date(weekStart + 'T12:00:00');
              d.setDate(d.getDate() + i);
              const date = schoolDate(d),
                items = (school.days[date] || []).filter(
                  (x) => getSchoolUnit(x.unitId)?.grade === school.grade,
                );
              return (
                <button
                  key={date}
                  className={day === date ? 'active' : ''}
                  onClick={() => setDay(date)}
                >
                  <small>{d.toLocaleDateString('ru-RU', { weekday: 'short' })}</small>
                  <strong>{d.getDate()}</strong>
                  <span>{items.length} занятий</span>
                </button>
              );
            })}
          </div>
          <div className="school-section-title">
            <h2>
              {new Date(day + 'T12:00:00').toLocaleDateString('ru-RU', {
                day: 'numeric',
                month: 'long',
              })}
            </h2>
            <span>
              {dayItems.reduce((n, i) => n + i.minutes, 0)} мин ·{' '}
              {dayItems.filter((i) => i.done).length} / {dayItems.length} завершено
            </span>
          </div>
          <div className="school-plan-items">
            {dayItems.map((item, index) => {
              const u = getSchoolUnit(item.unitId)!,
                s = getSchoolSubject(u.subject);
              return (
                <article
                  key={item.id}
                  className="school-panel"
                  style={{ '--school-color': s.color } as CSSProperties}
                >
                  <div className="school-section-title">
                    <div>
                      <small style={{ color: s.color }}>
                        {s.title} · {u.grade} класс
                      </small>
                      <h3>{u.title}</h3>
                    </div>
                    {item.done ? (
                      <span className="school-done">
                        <Check size={17} />
                        Занятие завершено
                      </span>
                    ) : (
                      <button
                        className="button primary"
                        onClick={() =>
                          start(u, 'lesson', item.note, item.minutes, {
                            itemId: item.id,
                            date: day,
                          })
                        }
                      >
                        Начать
                        <ArrowRight size={16} />
                      </button>
                    )}
                  </div>
                  <div className="school-actions">
                    <label>
                      Минут
                      <PlanMinutes
                        value={item.minutes}
                        label={`Минут на ${u.title}`}
                        onCommit={(minutes) =>
                          update((x) => ({
                            ...x,
                            days: {
                              ...x.days,
                              [day]: (x.days[day] || []).map((i) =>
                                i.id === item.id ? { ...i, minutes } : i,
                              ),
                            },
                          }))
                        }
                      />
                    </label>
                    <label className="school-grow">
                      Моя задача
                      <input
                        aria-label={`Заметка к ${u.title}`}
                        value={item.note}
                        onChange={(e) => {
                          const note = e.target.value;
                          update((x) => ({
                            ...x,
                            days: {
                              ...x.days,
                              [day]: x.days[day].map((i) =>
                                i.id === item.id ? { ...i, note } : i,
                              ),
                            },
                          }));
                        }}
                        placeholder="Например: упражнение из учебника, подготовка к контрольной…"
                      />
                    </label>
                    <button
                      className="button"
                      aria-label="Поднять занятие"
                      disabled={index === 0}
                      onClick={() =>
                        update((x) => {
                          const all = [...x.days[day]],
                            at = all.findIndex((i) => i.id === item.id),
                            previous = all.findIndex((i) => i.id === dayItems[index - 1].id);
                          [all[at], all[previous]] = [all[previous], all[at]];
                          return { ...x, days: { ...x.days, [day]: all } };
                        })
                      }
                    >
                      ↑
                    </button>
                    <button
                      className="button"
                      aria-label={`Удалить из плана ${u.title}`}
                      onClick={() =>
                        update((x) => ({
                          ...x,
                          days: { ...x.days, [day]: x.days[day].filter((i) => i.id !== item.id) },
                        }))
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </article>
              );
            })}
            {!dayItems.length && (
              <div className="school-panel">
                <h3>Свободный день</h3>
                <p>Составь план кнопками выше или добавь тему самостоятельно.</p>
              </div>
            )}
          </div>
          <div className="school-panel">
            <h2>Добавить тему на этот день</h2>
            <div className="school-search">
              <Search size={18} />
              <input
                aria-label="Тема для школьного плана"
                value={planQuery}
                onChange={(e) => setPlanQuery(e.target.value)}
                placeholder="Начни писать название темы…"
              />
            </div>
            <p className="school-muted">
              Изменения сохраняются автоматически. Выбери раздел, затем впиши своё упражнение в поле
              «Моя задача».
            </p>
            {
              <div className="school-plan-search">
                {subjects
                  .flatMap((s) => programUnits(s.id, school.grade, planQuery))
                  .slice(0, 15)
                  .map((u) => (
                    <button key={u.id} onClick={() => add(u)}>
                      <span>{getSchoolSubject(u.subject).title}</span>
                      {u.title}
                      <Plus size={16} />
                    </button>
                  ))}
              </div>
            }
          </div>
        </>
      )}
      {school.view === 'documents' && (
        <SchoolDocuments
          school={school}
          update={update}
          settings={state.settings}
          notify={notify}
        />
      )}
      {school.view === 'memory' && (
        <SchoolMemory key={school.grade} school={school} update={update} />
      )}
      <footer className="school-footer">
        <span>
          <ShieldCheck size={15} />
          Школьные занятия и прогресс сохраняются на этом устройстве
        </span>
        <span>Школа · {school.grade} класс</span>
      </footer>
    </section>
  );
}
function QuickUnit({ unit, onOpen }: { unit: SchoolUnit; onOpen: () => void }) {
  const s = getSchoolSubject(unit.subject),
    Icon = icons[s.id];
  return (
    <button
      className="school-quick-unit"
      onClick={onOpen}
      style={{ '--school-color': s.color } as CSSProperties}
    >
      <Icon size={23} />
      <small>
        {s.title} · {unit.grade} класс
      </small>
      <h3>{unit.title}</h3>
      <p>{unit.objectives[0]}</p>
      <span>
        Перейти к теме
        <ArrowRight size={16} />
      </span>
    </button>
  );
}
function ProgramEvidence({ unit, notify }: { unit: SchoolUnit; notify: (s: string) => void }) {
  const source = getProgramSource(unit.sourceId);
  if (!source) return null;
  return (
    <details className="school-evidence">
      <summary>
        <ShieldCheck size={14} />
        Основание программы · {source.edition}
      </summary>
      <p>
        <a href={source.url} target="_blank" rel="noreferrer">
          {source.title}
        </a>
        <br />
        Страницы PDF: {unit.pages.join(', ')}. Проверено {source.checkedAt}.
      </p>
      {source.notes && <p>{source.notes}</p>}
      <button
        className="button"
        onClick={async () => {
          const result = await window.cosmos?.openSchoolSource(source.id);
          if (!result?.ok)
            notify('Локальная копия не открылась. Используй ссылку на официальный документ.');
        }}
      >
        Открыть локальный источник
      </button>
    </details>
  );
}
export function SchoolDocuments({
  school,
  update,
  settings,
  notify,
  homework = false,
}: {
  school: SchoolState;
  update: UpdateSchool;
  settings: LearningState['settings'];
  notify: (s: string) => void;
  homework?: boolean;
}) {
  const docs = school.documents
      .filter((d) => homework || d.grade === school.grade)
      .slice()
      .reverse(),
    [selected, setSelected] = useState(''),
    [edit, setEdit] = useState(false),
    [busy, setBusy] = useState(false);
  const doc = docs.find((d) => d.id === selected) || docs[0];
  const patch = (changes: Partial<SchoolDocument>) => {
    if (doc)
      update((s) => ({
        ...s,
        documents: s.documents.map((d) =>
          d.id === doc.id
            ? { ...d, ...changes, updatedAt: new Date().toISOString(), path: undefined }
            : d,
        ),
      }));
  };
  async function save(format: 'html' | 'pdf' | 'md' | 'txt' | 'docx') {
    if (!doc || busy) return;
    setBusy(true);
    try {
      const result = await window.cosmos?.exportDocument({
        mode: 'school',
        grade: doc.grade,
        subject: doc.subject,
        topicId: doc.unitId,
        title: doc.title,
        content: doc.content,
        drawings: doc.drawings,
        format,
        style: 'cosmos',
        scale: settings.documentScale,
        documentType: homework ? 'Разбор домашней работы' : 'Школьный конспект',
      });
      if (result?.ok && result.path) {
        update((s) => ({
          ...s,
          documents: s.documents.map((d) =>
            d.id === doc.id &&
            d.updatedAt === doc.updatedAt &&
            d.content === doc.content &&
            d.title === doc.title
              ? { ...d, path: result.path }
              : d,
          ),
        }));
        notify('Файл конспекта сохранён. Можно открыть его кнопкой «Открыть файл».');
      } else notify('Файл не сохранён. Черновик конспекта остаётся в приложении.');
    } catch {
      notify('Экспорт не завершился. Черновик сохранён.');
    } finally {
      setBusy(false);
    }
  }
  if (!doc)
    return (
      <div className="school-panel school-empty">
        <FileText size={42} />
        <h2>{homework ? 'Конспекты домашних работ' : 'Сохранённые файлы'}</h2>
        <p>
          Открой занятие и нажми «Конспект». В черновик попадут объяснения, твои вопросы и рисунки.
          Его можно отредактировать и сохранить в PDF, HTML, DOCX или текст.
        </p>
      </div>
    );
  return (
    <div className="school-documents">
      <div className="school-document-list">
        {docs.map((d) => (
          <button
            key={d.id}
            className={d.id === doc.id ? 'active' : ''}
            onClick={() => {
              setSelected(d.id);
              setEdit(false);
            }}
          >
            <FileText size={18} />
            <span>
              {d.title}
              <small>
                {getSchoolSubject(d.subject).title} ·{' '}
                {new Date(d.createdAt).toLocaleDateString('ru-RU')} ·{' '}
                {d.path ? 'Файл сохранён' : 'Черновик'}
              </small>
            </span>
          </button>
        ))}
      </div>
      <div className="school-document-preview">
        <div className="school-actions">
          <button className="button" disabled={busy} onClick={() => setEdit(!edit)}>
            <Pencil size={15} />
            {edit ? 'Предпросмотр' : 'Редактировать'}
          </button>
          {(['pdf', 'html', 'docx', 'md', 'txt'] as const).map((f) => (
            <button key={f} className="button" disabled={busy} onClick={() => void save(f)}>
              <Download size={15} />
              {f.toUpperCase()}
            </button>
          ))}
          {doc.path && (
            <button
              className="button primary"
              onClick={() => void window.cosmos?.openPath(doc.path!)}
            >
              Открыть файл
            </button>
          )}
        </div>
        {edit ? (
          <>
            <label>
              Название
              <input
                disabled={busy}
                value={doc.title}
                onChange={(e) => patch({ title: e.target.value })}
              />
            </label>
            <textarea
              aria-label="Текст школьного конспекта"
              className="school-document-editor"
              disabled={busy}
              value={doc.content}
              onChange={(e) => patch({ content: e.target.value })}
            />
          </>
        ) : (
          <div className="school-document-paper">
            <TutorMarkdown text={doc.content} />
            {doc.drawings.map((drawing, index) => (
              <DialogueScene
                key={index}
                drawing={drawing}
                id={`school-doc-${doc.id}-${index}`}
                subject={doc.subject}
                settings={settings}
                active={false}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
function SchoolMemory({ school, update }: { school: SchoolState; update: UpdateSchool }) {
  const [subject, setSubject] = useState<SchoolSubjectId>(
      programSubjects(school.grade).some((s) => s.id === school.subject)
        ? school.subject
        : programSubjects(school.grade)[0]?.id || 'math',
    ),
    [text, setText] = useState('');
  const facts = school.facts.filter((f) => f.grade === school.grade && f.subject === subject);
  return (
    <>
      <div className="school-panel">
        <h2>Что Cosmos учитывает в школьных занятиях</h2>
        <p>
          Заметки и предварительные итоги относятся к выбранному предмету и классу. Ты можешь
          исправить или удалить любой факт.
        </p>
        <label>
          Предмет
          <select
            aria-label="Предмет"
            value={subject}
            onChange={(e) => setSubject(e.target.value as SchoolSubjectId)}
          >
            {programSubjects(school.grade).map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          Добавить учебную заметку
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Например: на уроке проходили законы Ньютона, хочу разобраться со вторым законом…"
          />
        </label>
        <button
          className="button primary"
          disabled={!text.trim()}
          onClick={() => {
            update((s) => ({
              ...s,
              facts: [
                ...s.facts,
                {
                  id: crypto.randomUUID(),
                  subject,
                  grade: school.grade,
                  text: text.trim(),
                  at: new Date().toISOString(),
                  origin: 'student',
                },
              ],
            }));
            setText('');
          }}
        >
          Сохранить заметку
        </button>
      </div>
      <div className="school-memory-list">
        {facts.map((f) => (
          <article className="school-panel" key={f.id}>
            <small>
              {f.origin === 'student' ? 'Твоя заметка' : 'Предварительный итог Cosmos'} ·{' '}
              {new Date(f.at).toLocaleDateString('ru-RU')}
            </small>
            <textarea
              aria-label="Сохранённый школьный факт"
              value={f.text}
              onChange={(e) =>
                update((s) => ({
                  ...s,
                  facts: s.facts.map((x) => (x.id === f.id ? { ...x, text: e.target.value } : x)),
                }))
              }
            />
            <button
              className="text-button"
              onClick={() => update((s) => ({ ...s, facts: s.facts.filter((x) => x.id !== f.id) }))}
            >
              <Trash2 size={15} />
              Удалить факт
            </button>
          </article>
        ))}
        {!facts.length && (
          <p className="school-muted">Пока нет сохранённых фактов по этому предмету и классу.</p>
        )}
      </div>
    </>
  );
}
