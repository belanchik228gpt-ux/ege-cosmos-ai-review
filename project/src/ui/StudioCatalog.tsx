import { useMemo, useState, type CSSProperties } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  RotateCcw,
  ChevronRight,
  Search,
  Sparkles,
  ExternalLink,
  CalendarPlus,
  Play,
} from 'lucide-react';
import { subjects, sources, type LearningState, type SubjectId } from '../domain';
import { schoolTopics, listSchoolTopics, type SchoolTopic } from '../domain/school-catalog';
import { curriculumNodes } from '../domain/curriculum-data';
import { CurriculumScene } from '../scenes/CurriculumScene';
import { TutorMarkdown } from './TutorMarkdown';
import { BasicExamGuide } from './BasicExamGuide';
import { egeTopicProgress, isEgeTopicSkipped } from '../domain/ege-topic-skips';
export function StudioCatalog({
  state,
  initialSubject,
  onOpen,
  onPractice,
  onAdd,
  onSkip,
}: {
  state: LearningState;
  initialSubject?: SubjectId;
  onOpen: (t: SchoolTopic) => void;
  onPractice: (id: string) => void;
  onAdd: (t: SchoolTopic) => void;
  onSkip?: (topicId: string, skipped: boolean) => void;
}) {
  const [subject, setSubject] = useState<SubjectId | 'all'>(initialSubject ?? 'all'),
    [grade, setGrade] = useState(0),
    [query, setQuery] = useState(''),
    [page, setPage] = useState(0),
    [selected, setSelected] = useState<SchoolTopic>(),
    [catalogView, setCatalogView] = useState<'topics' | 'basic'>(
      initialSubject === 'math' && (state.planning?.preferences.mathLevel ?? 'basic') === 'basic'
        ? 'basic'
        : 'topics',
    ),
    [sectionId, setSectionId] = useState<string>();
  const showMathGuide = subject === 'all' || subject === 'math';
  const showingBasic = showMathGuide && catalogView === 'basic';
  const selectedSection = curriculumNodes.find(
    (node) =>
      node.id === sectionId && node.subject === 'math' && node.assessmentStatus === 'section',
  );
  const sectionTopics = selectedSection
    ? schoolTopics.filter(
        (topic) =>
          topic.subject === 'math' &&
          topic.curriculumCodes.some(
            (code) => code === selectedSection.code || code.startsWith(`${selectedSection.code}.`),
          ),
      )
    : [];
  function openBasicSection(id: string) {
    const exactTopic = schoolTopics.find(
      (topic) => topic.subject === 'math' && topic.curriculumNodeIds.includes(id),
    );
    if (exactTopic) setSelected(exactTopic);
    else setSectionId(id);
    window.scrollTo(0, 0);
  }
  const filtered = useMemo(
    () =>
      listSchoolTopics({
        subject: subject === 'all' ? undefined : subject,
        grade: grade || undefined,
        query,
        mathLevel: state.planning?.preferences.mathLevel ?? 'basic',
      }),
    [subject, grade, query, state.planning?.preferences.mathLevel],
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 18)),
    index = Math.min(page, pages - 1);
  const progressControls = (topic: SchoolTopic) => {
    const skipped = isEgeTopicSkipped(state, topic.id),
      percent = egeTopicProgress(state, topic.id);
    return (
      <div>
        <div className="studio-topic-footer">
          {percent > 0 && <span>
            {skipped ? 'Пропущено вручную' : 'Пройдено занятие'} · {percent}%
          </span>}
          {onSkip && (
            <button
              type="button"
              className="topic-known-icon"
              aria-label={`${skipped ? 'Вернуть тему в обучение' : 'Пропустить уже знакомую тему'}: ${topic.title}`}
              title={
                skipped
                  ? 'Вернуть в изучение'
                  : 'Уже знаю'
              }
              onClick={() => onSkip(topic.id, !skipped)}
            >
              {skipped ? <RotateCcw size={16} /> : <Check size={16} />}
            </button>
          )}
        </div>
        {percent > 0 && <progress
          max={100}
          value={percent}
          aria-label={`Пройдено занятие: ${topic.title}`}
          style={{ width: '100%', accentColor: 'var(--topic-color)' }}
        />}
      </div>
    );
  };
  if (selected) {
    const color = subjects.find((s) => s.id === selected.subject)!.color,
      node = curriculumNodes.find((n) => n.id === selected.curriculumNodeIds[0]);
    return (
      <section className="studio-topic-detail" style={{ '--topic-color': color } as CSSProperties}>
        <button className="text-button" onClick={() => setSelected(undefined)}>
          <ArrowLeft size={16} />К списку тем
        </button>
        <div className="studio-topic-heading">
          <span className="studio-tag">
            ФИПИ · {selected.curriculumCodes.join(', ')} · {selected.grades.join('–')} класс
          </span>
          <h1>{selected.title}</h1>
          <p>{selected.goal}</p>
          {progressControls(selected)}
          {isEgeTopicSkipped(state, selected.id) && (
            <p className="studio-small">
              Ты отметил тему как знакомую. Это ручной пропуск, а не результат экзамена или проверка
              знаний. Его можно отменить.
            </p>
          )}
          <div className="studio-actions">
            <button className="button primary" onClick={() => onOpen(selected)}>
              <Sparkles size={17} />
              Разобрать с Cosmos
            </button>
            <button className="button secondary" onClick={() => onAdd(selected)}>
              <CalendarPlus size={17} />В план
            </button>
            {selected.lessonTopicIds[0] && (
              <button
                className="text-button"
                onClick={() => onPractice(selected.lessonTopicIds[0])}
              >
                <Play size={16} />
                Локальная практика
              </button>
            )}
          </div>
        </div>
        <div className="studio-topic-columns">
          <div className="studio-card">
            <h2>Что входит в тему</h2>
            <ul className="studio-content-list">
              {selected.subtopics.map((s, i) => (
                <li key={i}>
                  <span>{String(i + 1).padStart(2, '0')}</span>
                  <p>{s}</p>
                </li>
              ))}
            </ul>
            <h3>Ключевые понятия</h3>
            <div className="studio-chips">
              {selected.keyConcepts.map((s, i) => (
                <span key={i}>{s}</span>
              ))}
            </div>
            {selected.formulas.length > 0 && (
              <>
                <h3>Формулы и правила</h3>
                {selected.formulas.map((s, i) => (
                  <div key={i} className="studio-formula">
                    <TutorMarkdown text={s} />
                  </div>
                ))}
              </>
            )}
          </div>
          <div className="studio-card">
            <h2>Как будем разбираться</h2>
            <p>
              {selected.context
                .split('\n')
                .find(
                  (s) =>
                    !s.startsWith('Цель') &&
                    s.length > 120 &&
                    !s.startsWith('Состав') &&
                    !s.startsWith('Опорные'),
                ) || selected.goal}
            </p>
            <h3>Перед началом</h3>
            <ul>
              {selected.prerequisites.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
            <h3>Источники</h3>
            {selected.sourceIds
              .filter((id) => id !== 'cosmos-training')
              .map((id) => {
                const source = sources.find((s) => s.id === id);
                return source ? (
                  <a
                    className="studio-source"
                    key={id}
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <BookOpen size={17} />
                    <span>
                      {source.title}
                      <small>
                        {source.version} · проверено {source.checkedAt}
                      </small>
                    </span>
                    <ExternalLink size={14} />
                  </a>
                ) : null;
              })}
            <p className="studio-small">{selected.gradeNote}</p>
            <p className="studio-small">{selected.examLevelNote}</p>
            <p className="studio-small">
              Состав темы подтверждён кодификатором. Разборы и примеры Cosmos — авторские учебные
              материалы.
            </p>
          </div>
        </div>
        {node && (
          <details className="studio-card">
            <summary>Визуальное знакомство с темой</summary>
            <CurriculumScene
              node={node}
              quality={state.settings.quality}
              reducedMotion={state.settings.reducedMotion}
              autoplay={false}
              persistenceKey={`catalog:${selected.id}`}
            />
          </details>
        )}
      </section>
    );
  }
  return (
    <section className="studio-catalog">
      <div className="studio-page-heading">
        <div>
          <span className="studio-eyebrow">ТВОЯ КАРТА ПОДГОТОВКИ</span>
          <h1>{showingBasic ? 'Базовый ЕГЭ по математике' : 'Все темы ЕГЭ'}</h1>
          <p>
            {showingBasic
              ? 'Начни с конкретных умений из спецификации своего экзамена.'
              : 'Выбери тему — посмотри её содержание и начни разбор.'}
          </p>
        </div>
        <span className="studio-tag">
          {showingBasic
            ? '21 позиция · спецификация 2026'
            : `${schoolTopics.length} пунктов кодификатора`}
        </span>
      </div>
      {showMathGuide && (
        <div className="studio-card">
          <h2>Твой ориентир для базовой математики</h2>
          <p>
            В общем каталоге {schoolTopics.filter((topic) => topic.subject === 'math').length}{' '}
            пунктов математики: кодификатор объединяет базовый и профильный уровни. Не все подтемы
            этого списка входят в базовый экзамен. Для базы сначала посмотри 21 позицию из
            спецификации ФИПИ 2026.
          </p>
          <div className="studio-actions" role="group" aria-label="Каталог математики">
            <button
              type="button"
              className={`button ${showingBasic ? 'primary' : 'secondary'}`}
              aria-pressed={showingBasic}
              onClick={() => {
                setCatalogView('basic');
                setSectionId(undefined);
              }}
            >
              <BookOpen size={17} />
              Базовый ЕГЭ · 21 позиция
            </button>
            <button
              type="button"
              className={`button ${!showingBasic ? 'primary' : 'secondary'}`}
              aria-pressed={!showingBasic}
              onClick={() => {
                setCatalogView('topics');
                setSectionId(undefined);
              }}
            >
              Общий каталог тем
            </button>
          </div>
        </div>
      )}
      {showingBasic ? (
        selectedSection ? (
          <>
            <button className="text-button" onClick={() => setSectionId(undefined)}>
              <ArrowLeft size={16} />К 21 позиции базового ЕГЭ
            </button>
            <div className="studio-card">
              <span className="studio-tag">Общий кодификатор · раздел {selectedSection.code}</span>
              <h2>{selectedSection.title}</h2>
              <p>
                Спецификация базы ссылается на этот общий раздел. Ниже — проверяемые пункты этого
                раздела из кодификатора двух уровней. Принадлежность раздела к базе не переносится
                автоматически на каждую карточку: точный перечень подтем конкретного базового
                задания здесь не установлен.
              </p>
              <p className="studio-small">
                Выбери конкретную тему, чтобы прочитать её содержание. В план попадёт только та
                карточка, которую ты добавишь сам.
              </p>
            </div>
            <div className="studio-topic-grid">
              {sectionTopics.map((topic) => (
                <article
                  key={topic.id}
                  className="studio-topic-card"
                  style={
                    {
                      '--topic-color': subjects.find((s) => s.id === 'math')!.color,
                    } as CSSProperties
                  }
                >
                  <div className="studio-topic-kicker">
                    <span>Общий кодификатор</span>
                    <span>{topic.curriculumCodes.join(', ')}</span>
                  </div>
                  <h2>
                    <button
                      className="text-button"
                      style={{ font: 'inherit', color: 'inherit', textAlign: 'left' }}
                      onClick={() => {
                        setSelected(topic);
                        window.scrollTo(0, 0);
                      }}
                    >
                      {topic.title}
                    </button>
                  </h2>
                  <p>{topic.goal}</p>
                  {progressControls(topic)}
                  <div className="studio-topic-footer">
                    <button
                      className="text-button"
                      onClick={() => {
                        setSelected(topic);
                        window.scrollTo(0, 0);
                      }}
                    >
                      Посмотреть состав темы
                    </button>
                    <ChevronRight size={17} />
                  </div>
                </article>
              ))}
            </div>
          </>
        ) : (
          <BasicExamGuide onSelectNode={openBasicSection} />
        )
      ) : (
        <>
          <div className="studio-filterbar">
            <label className="studio-search">
              <Search size={18} />
              <input
                aria-label="Поиск тем"
                placeholder="Найти тему, понятие или код ФИПИ…"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(0);
                }}
              />
            </label>
            <select
              aria-label="Предмет каталога"
              value={subject}
              onChange={(e) => {
                setSubject(e.target.value as SubjectId | 'all');
                setSectionId(undefined);
                setCatalogView(
                  e.target.value === 'math' &&
                    (state.planning?.preferences.mathLevel ?? 'basic') === 'basic'
                    ? 'basic'
                    : 'topics',
                );
                setPage(0);
              }}
            >
              <option value="all">Все предметы</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
            <select
              aria-label="Класс каталога"
              value={grade}
              onChange={(e) => {
                setGrade(+e.target.value);
                setPage(0);
              }}
            >
              <option value={0}>8–11 классы</option>
              {[8, 9, 10, 11].map((n) => (
                <option key={n} value={n}>
                  {n} класс
                </option>
              ))}
            </select>
          </div>
          <p className="studio-small">
            Найдено {filtered.length}. Классы помогают выбрать порядок повторения; состав экзамена
            задаёт ФИПИ. Освоение подтверждают самостоятельные задания.
          </p>
          <div className="studio-topic-grid">
            {filtered.slice(index * 18, index * 18 + 18).map((t) => {
              const s = subjects.find((s) => s.id === t.subject)!,
                sessions = Object.values(state.cloudSessions ?? {}).filter(
                  (l) => l.topicId === t.id,
                ),
                studied = sessions.some((l) => l.completedAt);
              return (
                <article
                  key={t.id}
                  className="studio-topic-card"
                  style={{ '--topic-color': s.color } as CSSProperties}
                >
                  <div className="studio-topic-kicker">
                    <span>{s.title}</span>
                    <span>{t.curriculumCodes[0]}</span>
                  </div>
                  <h2>
                    <button
                      className="text-button"
                      style={{ font: 'inherit', color: 'inherit', textAlign: 'left' }}
                      onClick={() => {
                        setSelected(t);
                        window.scrollTo(0, 0);
                      }}
                    >
                      {t.subtopics[0] || t.title}
                    </button>
                  </h2>
                  <p>{t.subtopics.length > 1 ? t.subtopics.slice(1, 4).join(' · ') : t.goal}</p>
                  <div className="studio-chips">
                    {t.grades.map((g) => (
                      <span key={g}>{g} класс</span>
                    ))}
                  </div>
                  {progressControls(t)}
                  <div className="studio-topic-footer">
                    <button
                      className="text-button"
                      onClick={() => {
                        setSelected(t);
                        window.scrollTo(0, 0);
                      }}
                    >
                      {studied ? (
                        <>
                          <Check size={14} />
                          Обсуждали
                        </>
                      ) : sessions.length ? (
                        'В процессе'
                      ) : (
                        'Начать знакомство'
                      )}
                    </button>
                    <ChevronRight size={17} />
                  </div>
                </article>
              );
            })}
          </div>
          {!filtered.length && (
            <div className="studio-card">
              <h2>Такую тему не нашли</h2>
              <p>Попробуй более короткое название или убери фильтр класса.</p>
              <button
                className="button secondary"
                onClick={() => {
                  setQuery('');
                  setGrade(0);
                  setSubject('all');
                }}
              >
                Сбросить фильтры
              </button>
            </div>
          )}
          <div className="studio-pagination">
            <button
              className="button secondary"
              disabled={index === 0}
              onClick={() => {
                setPage(index - 1);
                window.scrollTo(0, 0);
              }}
            >
              <ArrowLeft size={15} />
              Назад
            </button>
            <span>
              {index + 1} / {pages}
            </span>
            <button
              className="button secondary"
              disabled={index + 1 >= pages}
              onClick={() => {
                setPage(index + 1);
                window.scrollTo(0, 0);
              }}
            >
              Далее
              <ArrowRight size={15} />
            </button>
          </div>
        </>
      )}
    </section>
  );
}
