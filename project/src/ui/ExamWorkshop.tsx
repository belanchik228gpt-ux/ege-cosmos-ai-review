import { useState, type CSSProperties } from 'react';
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  ClipboardCheck,
  ExternalLink,
  Landmark,
  Layers3,
  Lightbulb,
  PenLine,
  Sigma,
  Sparkles,
} from 'lucide-react';
import { subjects, type SubjectId } from '../domain';
import { getExamTasks, getExamTask, type ExamWorkshopTask } from '../domain/exam-workshop';
import './exam-workshop.css';

const subjectIcons = { math: Sigma, russian: BookOpen, history: Landmark, social: Layers3 };
type DetailTab = 'requirements' | 'format' | 'tips';
const tabs = [
  { id: 'requirements' as const, label: 'Требования', Icon: ClipboardCheck },
  { id: 'format' as const, label: 'Оформление', Icon: PenLine },
  { id: 'tips' as const, label: 'Советы и ошибки', Icon: Lightbulb },
];

export function ExamWorkshop({
  initialSubject = 'math',
  onStart,
}: {
  initialSubject?: SubjectId;
  onStart: (task: ExamWorkshopTask, total: number) => void;
}) {
  const [subject, setSubject] = useState<SubjectId>(initialSubject);
  const [selectedNumbers, setSelectedNumbers] = useState<Partial<Record<SubjectId, number>>>({});
  const [tab, setTab] = useState<DetailTab>('requirements');
  const [count, setCount] = useState('10');
  const tasks = getExamTasks(subject);
  const selected = getExamTask(subject, selectedNumbers[subject] ?? tasks[0]?.number ?? 1);
  const subjectInfo = subjects.find((item) => item.id === subject)!;
  const total = Number(count);
  const validCount = count.trim() !== '' && Number.isInteger(total) && total >= 1 && total <= 30;

  return (
    <section
      className="exam-workshop"
      style={{ '--exam-color': subjectInfo.color } as CSSProperties}
    >
      <header className="exam-workshop-heading">
        <span className="eyebrow">ОТ ТРЕБОВАНИЯ К САМОСТОЯТЕЛЬНОМУ РЕШЕНИЮ</span>
        <h1>Как решать ЕГЭ</h1>
        <p>Выбери номер, разберись в оформлении и потренируйся на серии примеров.</p>
      </header>

      <div className="exam-subjects" aria-label="Предмет тренировки">
        {subjects.map((item) => {
          const Icon = subjectIcons[item.id];
          return (
            <button
              key={item.id}
              type="button"
              className={subject === item.id ? 'selected' : ''}
              aria-pressed={subject === item.id}
              style={{ '--exam-color': item.color } as CSSProperties}
              onClick={() => {
                setSubject(item.id);
                setTab('requirements');
              }}
            >
              <Icon size={23} />
              <span>
                <strong>{item.title}</strong>
                <small>
                  {item.id === 'math' ? 'Базовый уровень' : 'ЕГЭ 2026'} ·{' '}
                  {getExamTasks(item.id).length} номеров
                </small>
              </span>
              {subject === item.id && <Check className="exam-subject-check" size={16} />}
            </button>
          );
        })}
      </div>

      <div className="exam-workshop-layout">
        <aside className="exam-number-panel">
          <div className="exam-section-label">
            <span>01</span>
            <h2>Выбери номер</h2>
          </div>
          <div className="exam-number-grid" aria-label={`Номера заданий: ${subjectInfo.title}`}>
            {tasks.map((task) => (
              <button
                type="button"
                key={task.id}
                className={selected?.id === task.id ? 'selected' : ''}
                aria-pressed={selected?.id === task.id}
                aria-label={`Задание ${task.number}: ${task.title}`}
                title={task.title}
                onClick={() => {
                  setSelectedNumbers((current) => ({ ...current, [subject]: task.number }));
                  setTab('requirements');
                }}
              >
                {task.number}
              </button>
            ))}
          </div>
          <p>
            Номер — позиция в экзаменационной работе. Внутри него могут встречаться разные темы.
          </p>
          {subject === 'math' && (
            <div className="exam-level-note">
              <Sigma size={17} />
              <span>Здесь задания базового ЕГЭ. Профильный уровень имеет другую структуру.</span>
            </div>
          )}
        </aside>

        {selected ? (
          <article className="exam-task-panel" key={selected.id}>
            <header className="exam-task-heading">
              <span className="exam-task-number">№ {selected.number}</span>
              <div>
                <span className="exam-task-subject">
                  {subjectInfo.title} · ЕГЭ {selected.editionYear}
                </span>
                <h2>{selected.title}</h2>
              </div>
              {selected.maxPoints !== undefined && (
                <span className="exam-points">Максимум баллов: {selected.maxPoints}</span>
              )}
            </header>
            <div className="exam-detail-tabs" role="tablist" aria-label="Разбор задания">
              {tabs.map(({ id, label, Icon }) => (
                <button
                  type="button"
                  key={id}
                  role="tab"
                  id={`exam-tab-${id}`}
                  aria-controls="exam-task-details"
                  aria-selected={tab === id}
                  tabIndex={tab === id ? 0 : -1}
                  onKeyDown={(event) => {
                    const index = tabs.findIndex((item) => item.id === id);
                    const next =
                      event.key === 'ArrowRight'
                        ? (index + 1) % tabs.length
                        : event.key === 'ArrowLeft'
                          ? (index + tabs.length - 1) % tabs.length
                          : event.key === 'Home'
                            ? 0
                            : event.key === 'End'
                              ? tabs.length - 1
                              : undefined;
                    if (next === undefined) return;
                    event.preventDefault();
                    setTab(tabs[next].id);
                    document.getElementById(`exam-tab-${tabs[next].id}`)?.focus();
                  }}
                  className={tab === id ? 'selected' : ''}
                  onClick={() => setTab(id)}
                >
                  <Icon size={16} />
                  {label}
                </button>
              ))}
            </div>
            <div
              className="exam-task-details"
              id="exam-task-details"
              role="tabpanel"
              aria-labelledby={`exam-tab-${tab}`}
            >
              {tab === 'requirements' && (
                <>
                  <h3>Что нужно показать в ответе</h3>
                  <ul>
                    {selected.officialRequirements.map((text, index) => (
                      <li key={index}>
                        <Check size={16} />
                        <span>{text}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="exam-detail-note">
                    Краткое изложение требований. Полная формулировка и критерии — в официальном
                    источнике ниже.
                  </p>
                  {selected.criteriaNote && (
                    <p className="exam-criteria-note">{selected.criteriaNote}</p>
                  )}
                </>
              )}
              {tab === 'format' && (
                <>
                  <h3>Как записать ответ</h3>
                  <div className="exam-answer-format">
                    <PenLine size={22} />
                    <p>{selected.answerFormat}</p>
                  </div>
                  <p className="exam-detail-note">
                    В тренировке можно рассуждать своими словами. Финальную запись сверяй с форматом
                    этого номера.
                  </p>
                  {selected.criteriaNote && (
                    <p className="exam-criteria-note">{selected.criteriaNote}</p>
                  )}
                </>
              )}
              {tab === 'tips' && (
                <>
                  <h3>На что обратить внимание</h3>
                  <ul>
                    {selected.tips.map((text, index) => (
                      <li key={index}>
                        <ChevronRight size={16} />
                        <span>{text}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="exam-detail-note">
                    Советы Cosmos для самопроверки. Это не дополнительные официальные критерии
                    оценивания.
                  </p>
                </>
              )}
            </div>
            <footer className="exam-source">
              <a href={selected.sourceUrl} target="_blank" rel="noreferrer">
                <BookOpen size={16} />
                <span>{selected.sourceLabel}</span>
                <ExternalLink size={14} />
              </a>
              <span>
                Проверено {selected.checkedAt.slice(0, 10).split('-').reverse().join('.')} ·{' '}
                Спецификация, страницы PDF: {selected.pages.join(', ')}
                {selected.demoPages?.length
                  ? ` · Демоверсия, страницы PDF: ${selected.demoPages.join(', ')}`
                  : ''}
              </span>
            </footer>
          </article>
        ) : (
          <div className="exam-task-panel exam-unavailable">
            <h2>Материалы этого предмета пока не добавлены</h2>
            <p>Выбери другой предмет, чтобы открыть проверенные требования.</p>
          </div>
        )}
      </div>

      {selected && (
        <section className="exam-training-panel">
          <div className="exam-training-intro">
            <span className="exam-training-icon">
              <Sparkles size={23} />
            </span>
            <div>
              <h2>Потренируем номер {selected.number}</h2>
              <p>По одному примеру: твоя попытка, разбор и следующий шаг.</p>
            </div>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (validCount) onStart(selected, total);
            }}
          >
            <div className="exam-count-control">
              <label htmlFor="exam-example-count">Количество примеров</label>
              <div>
                <input
                  id="exam-example-count"
                  type="number"
                  min="1"
                  max="30"
                  step="1"
                  inputMode="numeric"
                  value={count}
                  onChange={(event) => setCount(event.target.value)}
                  aria-invalid={!validCount}
                  aria-describedby="exam-count-help"
                />
                {[5, 10, 15].map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={total === value}
                    className={total === value ? 'selected' : ''}
                    onClick={() => setCount(String(value))}
                  >
                    {value}
                  </button>
                ))}
              </div>
              <small id="exam-count-help">
                {validCount ? 'От 1 до 30 за одну серию' : 'Введи целое число от 1 до 30'}
              </small>
            </div>
            <button className="button primary exam-start" type="submit" disabled={!validCount}>
              <span>Открыть тренировку</span>
              <ArrowRight size={18} />
            </button>
          </form>
          <p className="exam-training-disclosure">
            Преподаватель создаёт тренировочные примеры, а не официальные задания ФИПИ. Для живого
            разбора нужен подключённый OpenAI; требования можно читать без входа.
          </p>
        </section>
      )}
    </section>
  );
}
