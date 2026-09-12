import { useId, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  BookOpen,
  ChevronDown,
  ExternalLink,
  FileText,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import { baseExamTaskMap, curriculumNodes } from '../domain/curriculum-data';
import { getSource } from '../domain/sources';
import './basic-exam-guide.css';

const shortTitles: Record<number, string> = {
  1: 'Вычисления',
  2: 'Задачи из жизни',
  3: 'Таблицы и диаграммы',
  4: 'Выражения в задаче',
  5: 'Вероятность',
  6: 'Чтение данных',
  7: 'График функции',
  8: 'Логические рассуждения',
  9: 'Геометрия вокруг нас',
  10: 'Планиметрия',
  11: 'Геометрия в пространстве',
  12: 'Фигуры на плоскости',
  13: 'Стереометрия',
  14: 'Числовые выражения',
  15: 'Вычисления в задачах',
  16: 'Преобразование выражений',
  17: 'Уравнения',
  18: 'Выражения и неравенства',
  19: 'Выбор способа решения',
  20: 'Текстовые задачи и уравнения',
  21: 'Способ решения задачи',
};

const normalize = (value: string) => value.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
const mathSections = curriculumNodes.filter(
  (node) => node.subject === 'math' && node.assessmentStatus === 'section',
);
const sectionByCode = new Map(mathSections.map((node) => [node.code, node]));
const specification = getSource('fipi-math-2026');

/** A source-backed overview of exam positions. It does not assign every codifier leaf to the basic exam. */
export function BasicExamGuide({ onSelectNode }: { onSelectNode: (id: string) => void }) {
  const id = useId();
  const [query, setQuery] = useState('');
  const [section, setSection] = useState('all');
  const [opening, setOpening] = useState(false);
  const [notice, setNotice] = useState('');
  const canOpenPdf = typeof window !== 'undefined' && !!window.cosmos?.openReference;
  const visible = useMemo(() => {
    const words = normalize(query).trim().split(/\s+/).filter(Boolean);
    return baseExamTaskMap.filter((task) => {
      if (section !== 'all' && !task.contentCodes.includes(section)) return false;
      if (/^\d+$/.test(query.trim())) return task.taskNumber === Number(query.trim());
      const text = normalize(
        [
          shortTitles[task.taskNumber] || task.title,
          task.title,
          ...task.contentCodes.map((code) => sectionByCode.get(code)?.title || ''),
        ].join(' '),
      );
      return words.every((word) => text.includes(word));
    });
  }, [query, section]);

  async function openSpecification() {
    if (!window.cosmos?.openReference || opening) return;
    setOpening(true);
    setNotice('');
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        window.cosmos.openReference('fipi-math-2026-specification-basic'),
        new Promise<{ ok: boolean }>((resolve) => {
          timeout = setTimeout(() => resolve({ ok: false }), 8000);
        }),
      ]);
      if (!result.ok)
        setNotice(
          'Спецификация сейчас не открылась. Официальный комплект доступен по ссылке ФИПИ рядом.',
        );
    } catch {
      setNotice(
        'Спецификация сейчас не открылась. Официальный комплект доступен по ссылке ФИПИ рядом.',
      );
    } finally {
      if (timeout) clearTimeout(timeout);
      setOpening(false);
    }
  }

  return (
    <section className="basic-exam-guide" aria-labelledby={`${id}-title`}>
      <div className="basic-exam-heading">
        <div>
          <span className="basic-exam-kicker">
            <ShieldCheck size={15} aria-hidden="true" /> ФИПИ · БАЗОВЫЙ УРОВЕНЬ · 2026
          </span>
          <h2 id={`${id}-title`}>21 позиция базового ЕГЭ</h2>
          <p>
            Посмотри, какие умения проверяет экзамен. Раскрой карточку, чтобы прочитать точную
            формулировку спецификации и перейти к связанному разделу.
          </p>
        </div>
        <div className="basic-exam-count" aria-hidden="true">
          <strong>21</strong>
          <span>
            позиция в плане
            <br />
            экзамена
          </span>
        </div>
      </div>

      <div className="basic-exam-context">
        <BookOpen size={19} aria-hidden="true" />
        <p>
          <strong>Раздел — шире одного задания.</strong> Математический кодификатор общий для базы и
          профиля. Спецификация базы указывает разделы 1–7; это не означает, что все их подтемы
          входят в базовый экзамен.
        </p>
      </div>

      <div className="basic-exam-filters">
        <label className="basic-exam-search" htmlFor={`${id}-query`}>
          <span>Найти позицию</span>
          <span className="basic-exam-input-wrap">
            <Search size={17} aria-hidden="true" />
            <input
              id={`${id}-query`}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Номер или навык"
              type="search"
            />
          </span>
        </label>
        <label htmlFor={`${id}-section`}>
          <span>Раздел содержания</span>
          <select
            id={`${id}-section`}
            value={section}
            onChange={(event) => setSection(event.target.value)}
          >
            <option value="all">Все разделы</option>
            {mathSections.map((node) => (
              <option value={node.code} key={node.id}>
                {node.code}. {node.title}
              </option>
            ))}
          </select>
        </label>
        <span className="basic-exam-results" role="status" aria-live="polite">
          Показано {visible.length} из {baseExamTaskMap.length}
        </span>
      </div>

      <div className="basic-exam-grid">
        {visible.map((task) => (
          <details
            className="basic-exam-card"
            data-exam-section={task.contentCodes[0]}
            key={task.taskNumber}
          >
            <summary>
              <span className="basic-exam-card-top">
                <span className="basic-exam-number">{task.taskNumber}</span>
                <span className="basic-exam-level">Базовый</span>
                <ChevronDown className="basic-exam-chevron" size={17} aria-hidden="true" />
              </span>
              <strong>{shortTitles[task.taskNumber] || task.title}</strong>
              <span className="basic-exam-card-bottom">
                <span>
                  {task.contentCodes.length === 1 ? 'Раздел' : 'Разделы'}{' '}
                  {task.contentCodes.join(' · ')}
                </span>
                <span>Подробнее</span>
              </span>
            </summary>
            <div className="basic-exam-card-body">
              <span className="basic-exam-detail-label">Формулировка спецификации</span>
              <p className="basic-exam-requirement">{task.title}</p>
              <span className="basic-exam-detail-label">Коды содержания · открыть раздел</span>
              <div className="basic-exam-code-links">
                {task.contentCodes.map((code) => {
                  const node = sectionByCode.get(code);
                  return node ? (
                    <button
                      type="button"
                      key={code}
                      onClick={() => onSelectNode(node.id)}
                      aria-label={`Открыть раздел ${code}: ${node.title}`}
                    >
                      <span>{code}</span>
                      {node.title}
                      <ArrowUpRight size={14} aria-hidden="true" />
                    </button>
                  ) : (
                    <span key={code}>{code}</span>
                  );
                })}
              </div>
              <div className="basic-exam-requirement-codes">
                <span>Коды проверяемых требований</span>
                <strong>{task.requirementCodes.join(' · ')}</strong>
              </div>
              <p className="basic-exam-page">
                <FileText size={15} aria-hidden="true" />
                <span>
                  Спецификация базы 2026
                  <br />
                  <strong>Печатная с. {task.printedPage}</strong> · лист PDF {task.page}
                </span>
              </p>
              {canOpenPdf && (
                <button
                  className="basic-exam-open-pdf"
                  type="button"
                  disabled={opening}
                  onClick={() => void openSpecification()}
                >
                  <FileText size={15} aria-hidden="true" />
                  {opening ? 'Открываем PDF…' : 'Открыть спецификацию'}
                </button>
              )}
            </div>
          </details>
        ))}
      </div>

      {!visible.length && (
        <div className="basic-exam-empty">
          <Search size={23} aria-hidden="true" />
          <p>По этому сочетанию номера, навыка и раздела позиций не найдено.</p>
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setSection('all');
            }}
          >
            <X size={15} aria-hidden="true" /> Сбросить фильтры
          </button>
        </div>
      )}

      <footer className="basic-exam-source">
        <div>
          <ShieldCheck size={17} aria-hidden="true" />
          <span>
            <strong>Официальная спецификация · проверено 08.09.2026</strong>
            <small>
              Приложение, печатные с. 10–12. Короткие названия карточек сформулированы Cosmos;
              полные требования взяты из документа.
            </small>
          </span>
        </div>
        {specification?.url && (
          <a href={specification.url} target="_blank" rel="noreferrer">
            Комплект ФИПИ 2026
            <ExternalLink size={14} aria-hidden="true" />
          </a>
        )}
        {!canOpenPdf && <p>Офлайн-PDF доступен в установленном приложении.</p>}
        {notice && (
          <p className="basic-exam-notice" role="status">
            {notice}
          </p>
        )}
      </footer>
    </section>
  );
}
