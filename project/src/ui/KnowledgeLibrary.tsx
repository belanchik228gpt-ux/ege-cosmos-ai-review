import { useEffect, useState } from 'react';
import { ArrowRight, BookOpen, Check, CircleHelp, Library, Search, Sparkles } from 'lucide-react';
import { subjects, topics, type SubjectId } from '../domain';
import { knowledgeCards, retrieveKnowledge } from '../domain/knowledge';
import { Heading, IconBadge } from './App';
import { SourceLinks } from './SourceLinks';
import './reading-flow.css';

export function KnowledgeLibrary({
  initialCardId,
  onBegin,
}: {
  initialCardId?: string;
  onBegin: (id: string) => void;
}) {
  const initial = knowledgeCards.find((c) => c.id === initialCardId);
  const [readerTab, setReaderTab] = useState<'explanation' | 'example' | 'practice'>('explanation');
  const [cardsOpen, setCardsOpen] = useState(false);
  const [subject, setSubject] = useState<SubjectId>(initial?.subject || 'math'),
    [query, setQuery] = useState(''),
    [selectedId, setSelectedId] = useState(initial?.id || ''),
    [attempt, setAttempt] = useState(''),
    [hint, setHint] = useState(false),
    [reveal, setReveal] = useState(false);
  useEffect(() => {
    const selected = knowledgeCards.find((c) => c.id === initialCardId);
    if (selected) {
      setSubject(selected.subject);
      setSelectedId(selected.id);
      setQuery('');
    }
  }, [initialCardId]);
  const filtered = query.trim()
    ? retrieveKnowledge(subject, query, undefined, 30)
    : knowledgeCards.filter((c) => c.subject === subject);
  const card = filtered.find((c) => c.id === selectedId) || filtered[0];
  useEffect(() => {
    setAttempt('');
    setHint(false);
    setReveal(false);
    setReaderTab('explanation');
  }, [card?.id]);
  const lesson = card?.topicIds.find((id) => topics.some((t) => t.id === id));
  return (
    <div className={`flow-knowledge subject-${subject}`}>
      <Heading
        eyebrow="ПОНЯТНО. ПО ШАГАМ. ПОД РУКОЙ."
        title="База знаний"
        description={`${knowledgeCards.length} учебных карточек на твоём компьютере. Объяснения и примеры доступны без интернета.`}
        action={
          <IconBadge color="cyan">
            <Library size={27} />
          </IconBadge>
        }
      />
      <div className="knowledge-toolbar">
        <div className="tabs" aria-label="Предмет базы знаний">
          {subjects.map((s) => (
            <button
              key={s.id}
              className={`subject-${s.id} ${subject === s.id ? 'active' : ''}`}
              onClick={() => {
                setSubject(s.id);
                setQuery('');
                setSelectedId('');
              }}
            >
              {s.title}
            </button>
          ))}
        </div>
        <label className="search">
          <Search size={17} />
          <input
            aria-label="Поиск в базе знаний"
            placeholder="Тема, правило или вопрос…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>
      <button
        className="button secondary flow-library-picker"
        aria-expanded={cardsOpen}
        onClick={() => setCardsOpen(!cardsOpen)}
      >
        <Library size={17} />
        {cardsOpen ? 'Вернуться к чтению' : `Все карточки · ${filtered.length}`}
      </button>
      <div className={`knowledge-layout ${cardsOpen || !card ? 'flow-cards-open' : ''}`}>
        <aside className="knowledge-list" aria-label="Учебные карточки">
          {filtered.map((item) => (
            <button
              key={item.id}
              className={card?.id === item.id ? 'selected' : ''}
              onClick={() => {
                setSelectedId(item.id);
                setCardsOpen(false);
              }}
            >
              <BookOpen size={18} />
              <span>
                <strong>{item.title}</strong>
                <small>{item.summary}</small>
              </span>
              <ArrowRight size={15} />
            </button>
          ))}
          {!filtered.length && (
            <div className="empty-state">
              <p>В этом предмете подходящих карточек пока нет. Попробуй более короткий запрос.</p>
            </div>
          )}
        </aside>
        {card && (
          <article className="knowledge-reader" key={card.id}>
            <div className="card-top">
              <span className="pill">
                <Sparkles size={13} />
                УЧЕБНЫЙ МАТЕРИАЛ COSMOS
              </span>
              <span className="small muted">{subjects.find((s) => s.id === subject)?.title}</span>
            </div>
            <h2>{card.title}</h2>
            <nav className="flow-reader-tabs" aria-label="Режим учебной карточки">
              {(
                [
                  { id: 'explanation', label: 'Понять' },
                  { id: 'example', label: 'Пример' },
                  { id: 'practice', label: 'Самопроверка' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  className={readerTab === tab.id ? 'active' : ''}
                  aria-pressed={readerTab === tab.id}
                  onClick={() => setReaderTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
            {readerTab === 'explanation' && (
              <>
                <div className="knowledge-explanation">
                  {card.explanation.map((text, i) => (
                    <p key={i}>{text}</p>
                  ))}
                </div>
                {card.formula && <div className="knowledge-formula">{card.formula}</div>}
                <details className="flow-disclosure knowledge-mistakes">
                  <summary>Где легко ошибиться</summary>
                  {card.mistakes.map((mistake, i) => (
                    <p key={i}>
                      <CircleHelp size={16} />
                      <span>{mistake}</span>
                    </p>
                  ))}
                </details>
                <button
                  className="button secondary flow-reader-next"
                  onClick={() => setReaderTab('example')}
                >
                  Посмотреть пример <ArrowRight size={16} />
                </button>
              </>
            )}
            {readerTab === 'example' && (
              <section className="knowledge-example">
                <span className="eyebrow">РАЗБЕРЁМ НА ПРИМЕРЕ</span>
                <h3>{card.example.problem}</h3>
                <ol>
                  {card.example.steps.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
                <div className="example-answer">
                  <Check size={17} />
                  {card.example.answer}
                </div>
                <span className="small muted">Авторский пример · не официальное задание ФИПИ</span>
                <button
                  className="button secondary flow-reader-next"
                  onClick={() => setReaderTab('practice')}
                >
                  Попробовать самому <ArrowRight size={16} />
                </button>
              </section>
            )}
            {readerTab === 'practice' && (
              <section className="knowledge-checkpoint">
                <span className="eyebrow">ТЕПЕРЬ ТВОЯ МЫСЛЬ</span>
                <h3>{card.checkpoint.question}</h3>
                <textarea
                  aria-label="Моя версия ответа"
                  placeholder="Сначала попробуй своими словами…"
                  value={attempt}
                  onChange={(e) => setAttempt(e.target.value)}
                  maxLength={3000}
                />
                <div className="checkpoint-actions">
                  <button className="text-button" onClick={() => setHint(true)}>
                    <CircleHelp size={15} />
                    Маленькая подсказка
                  </button>
                  <button
                    className="button secondary"
                    disabled={!attempt.trim()}
                    onClick={() => setReveal(true)}
                  >
                    Свериться с разбором
                    <ArrowRight size={15} />
                  </button>
                </div>
                {hint && <p className="checkpoint-hint">{card.checkpoint.hint}</p>}
                {reveal && (
                  <div className="checkpoint-answer">
                    <strong>Разбор</strong>
                    <p>{card.checkpoint.answer}</p>
                    <span className="small muted">
                      Самопроверка в библиотеке не меняет учебный прогресс. Самостоятельные попытки
                      учитываются в занятиях.
                    </span>
                  </div>
                )}
              </section>
            )}
            {lesson && (
              <button className="button primary" onClick={() => onBegin(lesson)}>
                Перейти к сцене и практике
                <ArrowRight size={17} />
              </button>
            )}
            <details className="knowledge-sources flow-disclosure">
              <summary>Источники и статус материала</summary>
              <p>
                Объяснение составлено Cosmos. Ссылки на ФИПИ относятся к программе и формату
                экзамена; источники учебных фактов отмечены отдельно.
              </p>
              <SourceLinks
                ids={card.curriculumSourceIds}
                subject={subject}
                label="ФИПИ · программа и формат"
              />
              <SourceLinks
                ids={card.factSourceIds}
                subject={subject}
                label="Источники учебных фактов"
              />
            </details>
          </article>
        )}
      </div>
    </div>
  );
}
