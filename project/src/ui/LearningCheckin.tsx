import { useContext, useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, CircleHelp, ClipboardCheck, Send, Sparkles, X } from 'lucide-react';
import type { LearningState, SubjectId } from '../domain/types';
import { subjects } from '../domain/catalog';
import {
  advanceDiagnostic,
  answerDiagnostic,
  diagnosticRoute,
  hintDiagnostic,
  latestDiagnostic,
  practiceId,
  practiceTask,
  isPracticeRevealed,
  startDiagnostic,
  type DiagnosticRecord,
  type PracticeSummary,
} from '../domain/diagnostics';
import { SourceLinks } from './SourceLinks';
import { PreferencesContext } from './PreferencesContext';
import './learning-tools.css';

export interface LearningCheckinProps {
  state: LearningState;
  onChange: (state: LearningState) => void;
  subject: SubjectId;
  onClose?: () => void;
  onOpenLesson?: (topicId: string) => void;
  onPlan?: () => void;
}
export function PracticeSummaryView({
  summary,
  subject,
  onOpenLesson,
}: {
  summary: PracticeSummary;
  subject: SubjectId;
  onOpenLesson?: (topicId: string) => void;
}) {
  return (
    <section className="practice-summary" aria-label="Сохранённый учебный итог">
      <div className="practice-summary-title">
        <Check size={20} />
        <h3>Это я запомню для наших занятий</h3>
      </div>
      <p>{summary.text}</p>
      <div className="practice-skill-list">
        {summary.skills.map((skill) => (
          <div
            key={skill.topicId}
            className={skill.needsPractice ? 'practice-skill needs-practice' : 'practice-skill'}
          >
            <div>
              <strong>{skill.topicTitle}</strong>
              <span>
                {skill.needsPractice ? 'Вернёмся маленькими шагами' : 'Получилось в этой проверке'}
              </span>
            </div>
            {onOpenLesson && (
              <button
                type="button"
                className="text-button"
                onClick={() => onOpenLesson(skill.topicId)}
              >
                К теме <ArrowRight size={15} />
              </button>
            )}
          </div>
        ))}
      </div>
      <p className="practice-limit">{summary.limitation}</p>
      <SourceLinks ids={summary.sourceIds} subject={subject} compact />
    </section>
  );
}

export function PracticeConversation({
  record,
  name,
  inputLabel,
  onAnswer,
  onHint,
  onAdvance,
  onSkip,
}: {
  record: DiagnosticRecord;
  name: string;
  inputLabel: string;
  onAnswer: (text: string, submissionId: string) => void;
  onHint: () => void;
  onAdvance: () => void;
  onSkip: () => void;
}) {
  const [answer, setAnswer] = useState('');
  const preferences = useContext(PreferencesContext);
  const transcript = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const item = record.items[record.currentIndex];
  const task = item && practiceTask(item);
  const revealed = isPracticeRevealed(record);
  function sendAnswer() {
    if (!answer.trim() || !task) return;
    onAnswer(answer, practiceId('submission'));
    setAnswer('');
  }
  useEffect(() => {
    setAnswer('');
  }, [record.id, record.currentIndex, record.phase]);
  useEffect(() => {
    const element = transcript.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [record.id, record.transcript.length]);
  return (
    <div className="practice-conversation">
      <div className="practice-dialogue-head">
        <span>
          <Sparkles size={17} /> Cosmos рядом
        </span>
        <span>
          {record.phase === 'completed'
            ? 'Разговор сохранён'
            : `Шаг ${record.currentIndex + 1} из ${record.items.length}`}
        </span>
      </div>
      <div
        className="practice-transcript"
        ref={transcript}
        role="log"
        aria-label="Переписка с Cosmos"
        aria-live="polite"
        aria-relevant="additions text"
      >
        {record.transcript.map((turn) => (
          <article key={turn.id} className={`practice-message ${turn.role} ${turn.kind}`}>
            <span className="practice-speaker">
              {turn.role === 'cosmos' ? (
                <>
                  <Sparkles size={13} /> Cosmos
                </>
              ) : (
                name
              )}
            </span>
            <p>{turn.text}</p>
          </article>
        ))}
      </div>
      {record.phase === 'question' && (
        <form
          className="practice-composer"
          onSubmit={(event) => {
            event.preventDefault();
            sendAnswer();
          }}
        >
          <label htmlFor={`${record.id}-answer`}>{inputLabel}</label>
          <textarea
            id={`${record.id}-answer`}
            ref={input}
            value={answer}
            maxLength={2000}
            rows={2}
            placeholder="Ответ, вопрос, «не понимаю» или просьба показать разбор…"
            onChange={(event) => setAnswer(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === 'Enter' &&
                !event.shiftKey &&
                (preferences?.enterToSend || event.ctrlKey || event.metaKey)
              ) {
                event.preventDefault();
                sendAnswer();
              }
            }}
            disabled={!task}
          />
          {task?.choices && (
            <div className="practice-choices" aria-label="Варианты для собственного ответа">
              {task.choices.map((choice) => (
                <button
                  type="button"
                  key={choice}
                  onClick={() => {
                    setAnswer(choice);
                    input.current?.focus();
                  }}
                >
                  {choice}
                </button>
              ))}
            </div>
          )}
          <div className="practice-composer-actions">
            <button
              type="button"
              className="text-button"
              onClick={onHint}
              disabled={!task || revealed}
            >
              <CircleHelp size={16} />
              {item && record.hintedItemIds.includes(item.id)
                ? 'Ещё одна подсказка'
                : 'Маленькая подсказка'}
            </button>
            {!revealed && (
              <button
                type="button"
                className="text-button"
                onClick={() => onAnswer('напиши ответ', practiceId('reveal'))}
                disabled={!task}
              >
                Показать разбор
              </button>
            )}
            <button
              type="button"
              className="text-button"
              onClick={() => (revealed ? onAnswer('дальше', practiceId('next')) : onSkip())}
              disabled={!task}
            >
              {revealed ? 'Дальше без проверки' : 'Пока пропустить'}
            </button>
            <button type="submit" className="button primary" disabled={!answer.trim() || !task}>
              <Send size={16} />
              Ответить Cosmos
            </button>
          </div>
          {revealed && (
            <p className="practice-limit" role="status">
              Готовый разбор открыт. Ответ с этой опорой сохраним отдельно; самостоятельным
              измерением знаний он не считается.
            </p>
          )}
          {!task && (
            <p role="status">
              Материал этого вопроса обновился. Этот ответ пока нельзя проверить; сохранённая
              переписка доступна.
            </p>
          )}
        </form>
      )}
      {record.phase === 'feedback' && (
        <div className="practice-next">
          <p>Не торопись: можно перечитать короткий разбор выше.</p>
          <button type="button" className="button primary" onClick={onAdvance}>
            {record.currentIndex + 1 === record.items.length
              ? 'Сохранить итог'
              : 'Следующий вопрос'}
            <ArrowRight size={17} />
          </button>
        </div>
      )}
    </div>
  );
}

export function LearningCheckin({
  state,
  onChange,
  subject,
  onClose,
  onOpenLesson,
  onPlan,
}: LearningCheckinProps) {
  const [selectedId, setSelectedId] = useState('');
  useEffect(() => {
    setSelectedId('');
  }, [subject]);
  const records = Object.values(state.diagnostics ?? {})
    .filter((record) => record.subject === subject)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const record =
    records.find((candidate) => candidate.id === selectedId) ?? latestDiagnostic(state, subject);
  const subjectTitle = subjects.find((candidate) => candidate.id === subject)?.title;
  const route = record?.route ?? (!record ? diagnosticRoute(state, subject) : undefined);
  function begin() {
    const result = startDiagnostic(state, subject);
    setSelectedId(result.diagnosticId);
    onChange(result.state);
  }
  return (
    <section
      className="learning-checkin learning-tools"
      aria-label={`Короткая диагностика: ${subjectTitle}`}
    >
      <header className="practice-page-heading">
        <div>
          <span className="eyebrow">ЗНАКОМИМСЯ С ТВОИМИ НАВЫКАМИ</span>
          <h2>{route ? 'С чего начать твой маршрут' : 'Три вопроса с Cosmos'}</h2>
          <p>
            {route
              ? `${route.schoolGrade} класс · ${route.mathLevel === 'basic' ? 'базовая математика' : route.mathLevel === 'profile' ? 'профильная математика: проверка опорных навыков' : 'математика'} · 3 коротких задания`
              : `${subjectTitle} · короткий разговор, чтобы найти удобную точку старта.`}
          </p>
        </div>
        {onClose && (
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Вернуться к занятию"
          >
            <X size={20} />
          </button>
        )}
      </header>
      {!record ? (
        <div className="practice-start">
          <div className="practice-start-icon">
            <ClipboardCheck size={34} />
          </div>
          <h3>{state.profile.name}, с чего начнём?</h3>
          <p>
            {route
              ? 'Начнём с уравнения с модулем, процентов и действий с дробями. '
              : 'Ты отвечаешь на один вопрос. '}
            Я проверяю попытку, помогаю разобраться и задаю следующий вопрос. В конце сохраню, что
            уже получается и куда нам вернуться.
          </p>
          <button type="button" className="button primary" onClick={begin}>
            Начать короткий разговор
            <ArrowRight size={17} />
          </button>
          <span className="practice-limit">
            Авторские тренировочные задания. Это не полный пробник ЕГЭ.
            {route
              ? ' Класс помогает выбрать маршрут; он не обозначает официальную сложность этих заданий.'
              : ''}
          </span>
        </div>
      ) : (
        <>
          {records.length > 1 && (
            <label className="practice-history-picker">
              Сохранённый разговор
              <select value={record.id} onChange={(event) => setSelectedId(event.target.value)}>
                {records.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {new Date(candidate.createdAt).toLocaleString('ru-RU')} ·{' '}
                    {candidate.phase === 'completed'
                      ? 'итог сохранён'
                      : `${candidate.responses.length}/${candidate.items.length}`}
                  </option>
                ))}
              </select>
            </label>
          )}
          <PracticeConversation
            record={record}
            name={state.profile.name}
            inputLabel="Мой ответ в диагностике"
            onAnswer={(text, id) => onChange(answerDiagnostic(state, record.id, text, id))}
            onHint={() => onChange(hintDiagnostic(state, record.id))}
            onAdvance={() => onChange(advanceDiagnostic(state, record.id))}
            onSkip={() =>
              onChange(answerDiagnostic(state, record.id, '', practiceId('skip'), undefined, true))
            }
          />
          {record.summary && (
            <>
              <PracticeSummaryView
                summary={record.summary}
                subject={subject}
                onOpenLesson={onOpenLesson}
              />
              <div className="practice-completed-actions">
                <button type="button" className="text-button" onClick={begin}>
                  Новая короткая проверка
                </button>
                {onPlan && (
                  <button type="button" className="button primary" onClick={onPlan}>
                    К моему плану подготовки <ArrowRight size={17} />
                  </button>
                )}
                {onClose && (
                  <button
                    type="button"
                    className={onPlan ? 'text-button' : 'button primary'}
                    onClick={onClose}
                  >
                    Вернуться к занятию
                    <ArrowRight size={17} />
                  </button>
                )}
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
