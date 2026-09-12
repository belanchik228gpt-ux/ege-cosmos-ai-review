import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarPlus,
  Check,
  GraduationCap,
  Library,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { subjects, getTopic } from '../domain/catalog';
import { curriculumNodes } from '../domain/curriculum-data';
import type { CurriculumNode } from '../domain/curriculum-data/types';
import type { LearningState, SubjectId } from '../domain/types';
import type { StudyWorkspace } from '../domain/workspace';
import { CurriculumScene } from '../scenes/CurriculumScene';
import { ScenePlayer } from '../scenes/ScenePlayer';
import { SourceLinks } from './SourceLinks';
import { BasicExamGuide } from './BasicExamGuide';
import './study-workspace.css';

const normalize = (text: string) =>
  text.toLowerCase().replace(/ё/g, 'е').replace(/[|]/g, ' модуль ');
export function searchCurriculum(nodes: CurriculumNode[], query: string) {
  const words = normalize(query).trim().split(/\s+/).filter(Boolean);
  return nodes.filter((node) => {
    const haystack = normalize([node.title, node.code, node.section, ...node.keywords].join(' '));
    return words.every((word) => haystack.includes(word));
  });
}
export function CurriculumBrowser({
  state,
  view,
  onView,
  onAdd,
  onLesson,
  personalTopics,
  onPersonal,
  today,
  onPlan,
}: {
  state: LearningState;
  view: StudyWorkspace;
  onView: (view: StudyWorkspace) => void;
  onAdd: (node: CurriculumNode, date: string, minutes: number) => boolean;
  onLesson: (topicId: string) => void;
  personalTopics: Array<{ id: string; subject: SubjectId; title: string }>;
  onPersonal: (input: {
    title: string;
    subject: SubjectId;
    date: string;
    minutes: number;
  }) => boolean;
  today: string;
  onPlan: () => void;
}) {
  const [date, setDate] = useState(view.planDate || today);
  const [minutes, setMinutes] = useState(20);
  const [personalTitle, setPersonalTitle] = useState('');
  const [personalSubject, setPersonalSubject] = useState<SubjectId>('math');
  const [added, setAdded] = useState('');
  const pane = view.curriculumPane || 'overview';
  const setPane = (pane: NonNullable<StudyWorkspace['curriculumPane']>) =>
    onView({ ...view, curriculumPane: pane });
  const selected = curriculumNodes.find((node) => node.id === view.curriculumNodeId);
  const visible = useMemo(
    () =>
      searchCurriculum(
        curriculumNodes.filter(
          (node) =>
            (view.curriculumSubject === 'all' || node.subject === view.curriculumSubject) &&
            (view.curriculumGrade === 'all' ||
              node.schoolGrades.includes(Number(view.curriculumGrade))) &&
            (view.showSchoolOnly || node.assessmentStatus !== 'not-assessed-in-edition'),
        ),
        view.curriculumQuery,
      ),
    [view.curriculumSubject, view.curriculumGrade, view.showSchoolOnly, view.curriculumQuery],
  );
  const groups = useMemo(() => {
    const result = new Map<string, CurriculumNode[]>();
    for (const node of visible) {
      const key = `${node.subject}:${node.section}`;
      result.set(key, [...(result.get(key) || []), node]);
    }
    return [...result.entries()];
  }, [visible]);
  function open(node: CurriculumNode) {
    onView({ ...view, curriculumNodeId: node.id, curriculumPane: 'overview' });
    setAdded('');
    window.scrollTo({ top: 0 });
  }
  const lesson = selected?.lessonTopicId ? getTopic(selected.lessonTopicId) : undefined;
  const isBasicMath =
    view.curriculumSubject === 'math' && state.planning?.preferences.mathLevel === 'basic';
  const showBasicGuide = isBasicMath && view.curriculumMathMode !== 'catalog';
  const availableLessons = [
    ...new Set(
      selected?.lessonTopicIds || (selected?.lessonTopicId ? [selected.lessonTopicId] : []),
    ),
  ]
    .map(getTopic)
    .filter((topic): topic is NonNullable<typeof topic> => !!topic);
  return (
    <section className="curriculum-browser study-space" aria-label="Каталог тем ЕГЭ">
      <div className="study-heading">
        <div>
          <span className="eyebrow">ПОНИМАТЬ, ЗАЧЕМ ТЫ УЧИШЬСЯ</span>
          <h1>{selected ? 'Карта темы' : 'Темы ЕГЭ и школы'}</h1>
          <p>Программа экзамена, школьные темы и твои вопросы — с понятным местом в маршруте.</p>
        </div>
        <button className="button secondary" onClick={onPlan}>
          <CalendarPlus size={17} /> Мой план
        </button>
      </div>
      {selected ? (
        <>
          <button
            className="text-button"
            onClick={() => onView({ ...view, curriculumNodeId: undefined })}
          >
            <ArrowLeft size={17} /> К результатам поиска · {visible.length}
          </button>
          <article className="curriculum-detail" data-subject={selected.subject}>
            <div className="curriculum-detail-head">
              <span className="pill">
                <ShieldCheck size={14} /> ФИПИ · {selected.editionYear} · {selected.code}
              </span>
              <span className="mini-tag">
                {subjects.find((s) => s.id === selected.subject)?.title}
              </span>
            </div>
            <h2>
              {lesson?.title ||
                (selected.title.length > 130 ? selected.title.slice(0, 127) + '…' : selected.title)}
            </h2>
            <p className="muted">{selected.section}</p>
            {(!!lesson || selected.title.length > 130) && (
              <details>
                <summary>Полная формулировка кодификатора</summary>
                <p>{selected.title}</p>
              </details>
            )}
            <nav className="topic-content-tabs" aria-label="Содержание карточки темы">
              {(
                [
                  ['overview', 'Суть и цель', 'purple'],
                  ['visual', 'Объяснение в сцене', 'cyan'],
                  ['practice', 'Примеры и практика', 'green'],
                  ['sources', 'Программа и источники', 'amber'],
                ] as const
              ).map(([id, title, color]) => (
                <button
                  key={id}
                  className={`topic-content-tab ${color} ${pane === id ? 'active' : ''}`}
                  aria-pressed={pane === id}
                  onClick={() => setPane(id)}
                >
                  {title}
                </button>
              ))}
            </nav>
            <section className="topic-content-panel" aria-label="Материал выбранной темы">
              {pane === 'overview' && (
                <>
                  <div className="curriculum-context">
                    <div>
                      <ShieldCheck />
                      <strong>
                        {selected.assessmentStatus === 'not-assessed-in-edition'
                          ? 'Для школьной программы'
                          : 'Ориентир для ЕГЭ'}
                      </strong>
                      <p>
                        {selected.assessmentStatus === 'not-assessed-in-edition'
                          ? 'В этой редакции не включено в проверяемое содержание. Можно добавить по своему желанию.'
                          : `Раздел ${selected.code} кодификатора ${selected.editionYear}. Это учебная цель, а не обещание конкретного номера задания.`}
                      </p>
                    </div>
                    <div>
                      <GraduationCap />
                      <strong>{selected.schoolGrades.join(', ')} классы</strong>
                      <p>
                        {selected.gradeNote ||
                          'Ориентировочная связь с программой. Твой школьный порядок может отличаться.'}
                      </p>
                    </div>
                    <div>
                      <BookOpen />
                      <strong>
                        {lesson
                          ? 'Урок и самостоятельная практика'
                          : 'Визуальный обзор и самостоятельный разбор'}
                      </strong>
                      <p>
                        {lesson
                          ? 'Есть объяснение по шагам и задания с проверкой.'
                          : 'Карта помогает разобрать состав темы. Полный проверяемый урок для этого пункта пока не подготовлен.'}
                      </p>
                    </div>
                  </div>
                  {selected.assessmentNote && (
                    <p className="topic-assessment-note">{selected.assessmentNote}</p>
                  )}
                  {!!selected.notAssessedFragments?.length && (
                    <details className="topic-exclusions">
                      <summary>Какие части формулировки не проверяются в этой редакции</summary>
                      <ul>
                        {selected.notAssessedFragments.map((fragment) => (
                          <li key={fragment}>{fragment}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                  {selected.subject === 'math' && (
                    <p className="topic-assessment-note">
                      Кодификатор математики общий для базы и профиля. Этот пункт сам по себе не
                      подтверждает включение всех его частей в базовый экзамен. Перечень 21 позиции
                      базы доступен в каталоге математики.
                    </p>
                  )}
                  <button className="button secondary" onClick={() => setPane('visual')}>
                    Посмотреть объяснение <ArrowRight size={16} />
                  </button>
                </>
              )}
              {pane === 'visual' &&
                (lesson && lesson.sceneId !== 'math-absolute' ? (
                  <ScenePlayer
                    persistenceKey={`catalog:${selected.id}`}
                    sceneId={lesson.sceneId}
                    quality={state.settings.quality}
                    reducedMotion={state.settings.reducedMotion}
                    autoplay={state.settings.sceneAutoplay}
                    initialSpeed={state.settings.sceneSpeed}
                  />
                ) : (
                  <CurriculumScene
                    persistenceKey={`catalog:${selected.id}`}
                    node={
                      lesson?.id === 'math-absolute'
                        ? { ...selected, id: 'math-absolute' }
                        : selected
                    }
                    quality={state.settings.quality}
                    reducedMotion={state.settings.reducedMotion}
                    autoplay={state.settings.sceneAutoplay}
                    initialSpeed={state.settings.sceneSpeed}
                  />
                ))}
              {pane === 'practice' && (
                <div className="topic-practice">
                  <span className="study-type-label">САМОСТОЯТЕЛЬНОСТЬ ВМЕСТО УГАДЫВАНИЯ</span>
                  <h3>
                    {availableLessons.length
                      ? 'Уроки по частям этой темы'
                      : 'Разобрать тему по своей заметке'}
                  </h3>
                  <p>
                    {availableLessons.length
                      ? 'В каждом уроке — небольшой шаг объяснения, визуальная сцена, подсказки и проверяемые попытки. Один урок может охватывать только часть широкого пункта кодификатора.'
                      : 'Пока доступна визуальная карта. Проверяемые задания для этого пункта ещё не подготовлены. Можно добавить самостоятельный разбор в план и сохранить свои выводы.'}
                  </p>
                  <div className="topic-lesson-grid">
                    {availableLessons.map((topic) => (
                      <button
                        className="topic-lesson-card"
                        key={topic.id}
                        onClick={() => onLesson(topic.id)}
                      >
                        <BookOpen size={21} />
                        <strong>{topic.title}</strong>
                        <span>
                          {topic.tasks.length} заданий · {topic.durationMinutes} мин
                        </span>
                        <small>Авторский тренировочный материал</small>
                        <span>
                          Начать разбор <ArrowRight size={16} />
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {pane === 'sources' && (
                <div className="topic-sources">
                  <span className="study-type-label">МОЖНО ПРОВЕРИТЬ ПЕРВОИСТОЧНИК</span>
                  <h3>Место темы в программе</h3>
                  <p>{selected.title}</p>
                  <SourceLinks ids={[selected.sourceId]} subject={selected.subject} />
                  <p className="small muted">
                    Кодификатор: страница PDF {selected.page}
                    {selected.printedPage ? ` · печатная ${selected.printedPage}` : ''}.{' '}
                    {selected.editionStatus === 'draft'
                      ? 'Проект редакции.'
                      : 'Утверждённая редакция.'}{' '}
                    Школьная привязка не является календарём твоего учителя.
                  </p>
                  {selected.examLevelNote && <p>{selected.examLevelNote}</p>}
                  <p className="small muted">
                    Сцены, объяснения и задания Cosmos — авторские учебные материалы. Они не
                    обозначаются официальными заданиями ФИПИ.
                  </p>
                </div>
              )}
            </section>
            <div className="curriculum-add-row">
              <label>
                В какой день
                <input
                  type="date"
                  aria-label="Дата для темы"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
              <label>
                Минут
                <input
                  type="number"
                  min={5}
                  max={120}
                  step={5}
                  value={minutes}
                  onChange={(e) =>
                    setMinutes(Math.max(5, Math.min(120, Number(e.target.value) || 5)))
                  }
                />
              </label>
              <button
                className="button primary"
                disabled={!date}
                onClick={() => {
                  setAdded('');
                  if (onAdd(selected, date, minutes))
                    setAdded(
                      'Тема добавлена в выбранный день. Посмотреть последовательность можно в плане.',
                    );
                }}
              >
                <Plus size={17} /> Добавить в день
              </button>
              {lesson && (
                <button className="button secondary" onClick={() => onLesson(lesson.id)}>
                  Открыть урок <ArrowRight size={17} />
                </button>
              )}
            </div>
            {added && (
              <p role="status" className="study-success">
                <Check size={17} />
                {added}
              </p>
            )}
          </article>
        </>
      ) : (
        <>
          <div className="curriculum-intro">
            <ShieldCheck size={26} />
            <div>
              <strong>Сначала видна цель — затем выбираем следующий шаг</strong>
              <p>
                Каталог построен по кодификаторам ФИПИ 2026. Исключённые из проверки пункты скрыты
                по умолчанию. Для будущего экзамена будем сверять новую редакцию; список 2026 не
                выдаётся за утверждённый ЕГЭ-{state.planning?.preferences.examYear || 2028}.
              </p>
            </div>
            <span className="curriculum-total">
              {
                curriculumNodes.filter((n) => n.assessmentStatus !== 'not-assessed-in-edition')
                  .length
              }
              <small>пунктов и разделов</small>
            </span>
          </div>
          <nav className="curriculum-subjects" aria-label="Предмет каталога">
            <button
              className={view.curriculumSubject === 'all' ? 'active' : ''}
              onClick={() => onView({ ...view, curriculumSubject: 'all' })}
            >
              Все предметы
            </button>
            {subjects.map((s) => (
              <button
                key={s.id}
                data-subject={s.id}
                className={view.curriculumSubject === s.id ? 'active' : ''}
                onClick={() => onView({ ...view, curriculumSubject: s.id })}
              >
                {s.title}
              </button>
            ))}
          </nav>
          {isBasicMath && (
            <nav className="topic-content-tabs" aria-label="Программа математики">
              <button
                className={`topic-content-tab purple ${showBasicGuide ? 'active' : ''}`}
                aria-pressed={showBasicGuide}
                onClick={() => onView({ ...view, curriculumMathMode: 'exam' })}
              >
                Базовый ЕГЭ · 21 позиция
              </button>
              <button
                className={`topic-content-tab cyan ${!showBasicGuide ? 'active' : ''}`}
                aria-pressed={!showBasicGuide}
                onClick={() => onView({ ...view, curriculumMathMode: 'catalog' })}
              >
                Общий кодификатор и школа
              </button>
            </nav>
          )}
          {showBasicGuide ? (
            <BasicExamGuide
              onSelectNode={(id) => {
                const node = curriculumNodes.find((n) => n.id === id);
                if (node) open(node);
              }}
            />
          ) : (
            <>
              <div className="curriculum-filters">
                <label className="search">
                  <Search size={18} />
                  <input
                    aria-label="Поиск по всем темам ЕГЭ"
                    placeholder="Например: модуль, причастие, реформы, 2.1…"
                    value={view.curriculumQuery}
                    maxLength={200}
                    onChange={(e) => onView({ ...view, curriculumQuery: e.target.value })}
                  />
                </label>
                <label>
                  Школьный класс
                  <select
                    value={view.curriculumGrade}
                    onChange={(e) => onView({ ...view, curriculumGrade: e.target.value })}
                  >
                    <option value="all">Любой</option>
                    {[5, 6, 7, 8, 9, 10, 11].map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </label>
                <label className="study-check">
                  <input
                    type="checkbox"
                    checked={view.showSchoolOnly}
                    onChange={(e) => onView({ ...view, showSchoolOnly: e.target.checked })}
                  />{' '}
                  Показать и школьные дополнения
                </label>
              </div>
              <div className="study-result-count" role="status">
                Найдено: {visible.length} · формулировки из кодификатора, классы — ориентир
              </div>
              {groups.map(([key, nodes]) => (
                <details
                  className="curriculum-section"
                  data-subject={nodes[0].subject}
                  key={key}
                  open={view.curriculumQuery.trim() ? true : undefined}
                >
                  <summary>
                    <Library size={18} />
                    <span>
                      {subjects.find((s) => s.id === nodes[0].subject)?.title} · {nodes[0].section}
                    </span>
                    <b>{nodes.length}</b>
                  </summary>
                  <div className="curriculum-list">
                    {nodes.map((node) => (
                      <button
                        className={`curriculum-node ${node.assessmentStatus === 'section' ? 'is-section' : ''}`}
                        key={node.id}
                        data-subject={node.subject}
                        onClick={() => open(node)}
                      >
                        <span className="curriculum-code">{node.code}</span>
                        <span>
                          <strong>{node.title}</strong>
                          <small>
                            {node.schoolGrades.join('–')} кл. ·{' '}
                            {node.lessonTopicId ? 'Урок с практикой' : 'Визуальная карта'}
                            {node.assessmentStatus === 'not-assessed-in-edition'
                              ? ' · Школьное дополнение'
                              : ''}
                          </small>
                        </span>
                        <ArrowRight size={16} />
                      </button>
                    ))}
                  </div>
                </details>
              ))}
              {!visible.length && (
                <div className="study-empty">
                  <Search size={30} />
                  <h3>Совпадений пока нет</h3>
                  <p>
                    Попробуй короткое слово или добавь свой вопрос ниже. Личная тема не становится
                    официальным пунктом ЕГЭ.
                  </p>
                  <button
                    className="button secondary"
                    onClick={() =>
                      onView({
                        ...view,
                        curriculumQuery: '',
                        curriculumGrade: 'all',
                        curriculumSubject: 'all',
                      })
                    }
                  >
                    Сбросить поиск
                  </button>
                </div>
              )}
            </>
          )}
          <section className="study-personal">
            <div>
              <span className="eyebrow">ТВОЁ ЛЮБОПЫТСТВО ТОЖЕ ВАЖНО</span>
              <h2>Свои темы и вопросы</h2>
              <p>
                Добавь школьную задачу или тему, которую хочется обсудить. Она сохранится отдельно
                от официальной программы.
              </p>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!personalTitle.trim() || !date) return;
                const saved = onPersonal({
                  title: personalTitle.trim(),
                  subject: personalSubject,
                  date,
                  minutes,
                });
                if (saved) {
                  setPersonalTitle('');
                  setAdded('Личная тема сохранена и добавлена в выбранный день.');
                } else setAdded('');
              }}
            >
              <label>
                Тема
                <input
                  placeholder="Например: как решать уравнения с модулем"
                  value={personalTitle}
                  maxLength={200}
                  onChange={(e) => setPersonalTitle(e.target.value)}
                />
              </label>
              <label>
                Предмет
                <select
                  value={personalSubject}
                  onChange={(e) => setPersonalSubject(e.target.value as SubjectId)}
                >
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                День
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </label>
              <button className="button primary" disabled={!personalTitle.trim() || !date}>
                <Plus size={17} /> Добавить свою тему
              </button>
            </form>
            {added && <p role="status">{added}</p>}
            <div className="personal-topic-list">
              {personalTopics.map((topic) => (
                <span key={topic.id} data-subject={topic.subject}>
                  <Sparkles size={14} />
                  {topic.title}
                  <small>{subjects.find((s) => s.id === topic.subject)?.title} · личная</small>
                </span>
              ))}
            </div>
          </section>
        </>
      )}
    </section>
  );
}
