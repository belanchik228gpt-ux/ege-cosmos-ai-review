import { useState, type ReactNode } from 'react';
import {
  ArrowRight,
  BookOpen,
  Check,
  Clock3,
  Coffee,
  FileText,
  Pause,
  Play,
  SkipForward,
  Square,
  Sparkles,
} from 'lucide-react';
import { subjects, getTopic } from '../domain/catalog';
import { curriculumNodes } from '../domain/curriculum-data';
import { dailyErrorReviews, dailyReportContent } from '../domain/study-actions';
import type { LearningState, LearningDocument } from '../domain/types';
import type { StudyDayRun } from '../domain/study-plan';
import { formatStudyActivityTime } from '../domain/study-plan';
import { humanStudyDate } from './StudyDashboard';
import { CurriculumScene } from '../scenes/CurriculumScene';
import { SourceLinks } from './SourceLinks';
import './study-workspace.css';

export function StudyRunView({
  state,
  setState,
  run,
  notify,
  onEnter,
  onNext,
  onSkip,
  onFinish,
  onPause,
  onNote,
  onPlan,
  onHome,
  lesson,
}: {
  state: LearningState;
  setState: React.Dispatch<React.SetStateAction<LearningState>>;
  run: StudyDayRun;
  notify: (text: string) => void;
  onEnter: (blockId: string) => void;
  onNext: () => void;
  onSkip: () => void;
  onFinish: (early: boolean) => void;
  onPause: () => void;
  onNote: (note: string) => void;
  onPlan: () => void;
  onHome: () => void;
  lesson?: ReactNode;
}) {
  const [exporting, setExporting] = useState(false),
    [exportPath, setExportPath] = useState('');
  const current = run.blocks.find((block) => block.id === run.activeBlockId),
    next = run.blocks.find((block) => block.status === 'pending');
  const node = current?.curriculumNodeId
    ? curriculumNodes.find((node) => node.id === current.curriculumNodeId)
    : undefined;
  const completed = run.blocks.filter(
    (block) => block.kind !== 'break' && block.status === 'completed',
  ).length;
  const total = run.blocks.filter((block) => block.kind !== 'break').length;
  const skipped = run.blocks.filter(
    (block) => block.kind !== 'break' && block.status === 'skipped',
  ).length;
  const unfinished = total - completed - skipped;
  const seconds = Math.floor((current?.activeMs || 0) / 1000),
    clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  const allFinished = run.blocks.every((block) => ['completed', 'skipped'].includes(block.status));
  const sourceIds = [
    ...new Set(
      run.blocks
        .filter((block) => block.startedAt)
        .flatMap((block) => {
          const node = curriculumNodes.find((node) => node.id === block.curriculumNodeId),
            topic = block.topicId ? getTopic(block.topicId) : undefined;
          return [node?.sourceId, topic?.sourceId, ...(topic?.sourceIds || [])].filter(
            (id): id is string => !!id,
          );
        }),
    ),
  ];
  async function exportReport() {
    if (!window.cosmos || !run.report) {
      notify('Экспорт доступен в настольном приложении.');
      return;
    }
    setExporting(true);
    const title = `Итог занятия · ${humanStudyDate(run.date)}`,
      content = dailyReportContent(state, run.id);
    try {
      const result = await window.cosmos.exportDocument({
        title,
        subject: 'all',
        content,
        format: 'pdf',
        documentType: 'Отчёт о прогрессе',
        style: state.settings.documentStyle,
        scale: state.settings.documentScale,
      });
      if (!result.ok || !result.path) throw new Error('Файл отчёта не был создан.');
      const path = result.path,
        at = new Date().toISOString();
      const document: LearningDocument = {
        id: crypto.randomUUID(),
        title,
        subject: 'all',
        createdAt: at,
        content,
        type: 'Отчёт о прогрессе',
        sources: sourceIds,
        status: 'training',
        path,
        style: state.settings.documentStyle,
      };
      setState((current) => ({ ...current, documents: [...current.documents, document] }));
      setExportPath(path);
      notify('PDF-отчёт сохранён.');
    } catch {
      notify('Не удалось сохранить PDF. Сам итог занятия остаётся в приложении.');
    } finally {
      setExporting(false);
    }
  }
  if (run.report) {
    const report = run.report,
      errors = dailyErrorReviews(state, run.id);
    return (
      <section className="study-space study-daily-report" aria-label="Итог занятия дня">
        <div className="study-heading">
          <div>
            <span className="eyebrow">COSMOS · ИТОГ СОХРАНЁН</span>
            <h1>
              {run.status === 'finished-early'
                ? 'Сегодня остановились здесь'
                : 'Посмотри, что получилось'}
            </h1>
            <p>{humanStudyDate(run.date)} · к этому отчёту можно вернуться с главной.</p>
          </div>
          <button className="button primary" onClick={onHome}>
            На сегодня <ArrowRight size={17} />
          </button>
        </div>
        <section className="study-card">
          <div className="study-report-greeting">
            <Sparkles size={25} />
            <p>
              {state.profile.name}, я сохранил нашу работу.{' '}
              {report.endedEarly
                ? 'Незаконченные шаги остались незавершёнными — они не превратились в освоенные темы.'
                : 'Завершённые и пропущенные шаги отмечены отдельно.'}{' '}
              Следующий план учитывает ошибки и срок повторения.
            </p>
          </div>
          <div className="study-report-metrics">
            <div>
              <strong>
                {report.completedBlocks}/{total}
              </strong>
              <span>учебных блоков завершено</span>
            </div>
            <div>
              <strong>{report.independentCorrect}</strong>
              <span>самостоятельных верных ответов</span>
            </div>
            <div>
              <strong>{report.incorrect}</strong>
              <span>попыток с ошибкой</span>
            </div>
            <div>
              <strong>{formatStudyActivityTime(report.activeMs)}</strong>
              <span>измеренной учебной активности</span>
            </div>
          </div>
          <p className="small">
            Учебные блоки: завершено {report.completedBlocks}, пропущено {report.skippedBlocks},
            осталось {report.unfinishedBlocks}.
          </p>
          <p className="small muted">
            План — {report.plannedMinutes} мин с перерывами. Плановая длительность завершённых
            блоков — {report.completedMinutes} мин; это не фактически проведённое время. Ответов с
            помощью — {report.assistedCorrect}.
          </p>
        </section>
        <section className="study-card study-report-content">
          <h2>Что разбирали</h2>
          {run.blocks
            .filter((block) => block.kind !== 'break')
            .map((block) => (
              <article className="study-report-block" data-subject={block.subject} key={block.id}>
                <span className="study-type-label">
                  {subjects.find((s) => s.id === block.subject)?.title} ·{' '}
                  {block.status === 'completed'
                    ? 'Работа по блоку завершена'
                    : block.status === 'skipped'
                      ? 'Пропущен'
                      : block.startedAt
                        ? 'Начали, но не завершили'
                        : 'Не начинали'}
                </span>
                <h3>{block.title}</h3>
                {block.evidence && (
                  <p className="small muted">
                    Проверенных попыток: {block.evidence.attempts}. Самостоятельно верно:{' '}
                    {block.evidence.independentCorrect}. С помощью: {block.evidence.assistedCorrect}
                    .
                  </p>
                )}
                {block.note && <blockquote className="study-saved-note">{block.note}</blockquote>}
                {errors
                  .filter((error) => error.blockId === block.id)
                  .map((error, index) => (
                    <div className="study-error-review" key={index}>
                      <strong>Вернёмся к ошибке</strong>
                      <p>{error.prompt}</p>
                      <p>{error.explanation}</p>
                      <small>Первый шаг для повторения: {error.hint}</small>
                    </div>
                  ))}
              </article>
            ))}
          <p className="small muted">
            Открытие карты, время за приложением и отметка завершения не подтверждают освоение. Для
            этого нужны самостоятельные ответы и повторение.
          </p>
        </section>
        {!!sourceIds.length && (
          <details className="study-extra">
            <summary>Материалы разобранных тем</summary>
            {subjects
              .filter((subject) =>
                run.blocks.some((block) => block.startedAt && block.subject === subject.id),
              )
              .map((subject) => (
                <SourceLinks
                  key={subject.id}
                  ids={sourceIds}
                  subject={subject.id}
                  label={subject.title}
                />
              ))}
          </details>
        )}
        <div className="study-run-controls">
          <button className="button primary" onClick={exportReport} disabled={exporting}>
            <FileText size={17} />
            {exporting ? 'Сохраняем PDF…' : 'Сохранить отчёт в PDF'}
          </button>
          {exportPath && (
            <button
              className="button secondary"
              onClick={() => window.cosmos?.openPath(exportPath)}
            >
              Открыть PDF
            </button>
          )}
          <button className="button secondary" onClick={onPlan}>
            Следующие дни
          </button>
        </div>
      </section>
    );
  }
  return (
    <section className="study-space guided-study" aria-label="Занятие по плану">
      <div className="guided-toolbar">
        <div>
          <span className="eyebrow">ЗАНЯТИЕ · {humanStudyDate(run.date)}</span>
          <strong>
            {completed} из {total} учебных блоков
          </strong>
        </div>
        <span className="study-clock">
          <Clock3 size={16} />
          {clock}
          {current ? ` / ${current.minutes} мин` : ''}
        </span>
        <button className="text-button" onClick={onPlan}>
          <CalendarDaysIcon /> План
        </button>
        <button className="button secondary" onClick={onPause}>
          {run.status === 'paused' ? <Play size={16} /> : <Pause size={16} />}{' '}
          {run.status === 'paused' ? 'Продолжить' : 'Пауза занятия'}
        </button>
        <button className="text-button" onClick={() => onFinish(true)}>
          <Square size={14} /> Закончить раньше
        </button>
      </div>
      <div className="day-progress-strip" aria-label="Прогресс сегодняшнего занятия">
        <div>
          <strong>
            Завершено {completed} из {total} · пропущено {skipped} · осталось {unfinished}
          </strong>
          <span>
            В плане осталось:{' '}
            {Math.max(
              0,
              run.blocks
                .filter((b) => !['completed', 'skipped'].includes(b.status))
                .reduce((sum, b) => sum + Math.max(0, b.minutes - b.activeMs / 60000), 0),
            ).toFixed(0)}{' '}
            мин
          </span>
        </div>
        <progress aria-label="Учебные блоки дня" max={Math.max(1, total)} value={completed} />
        <small>
          {current
            ? `Сейчас: ${current.title}`
            : next
              ? `Следующий: ${next.title}`
              : 'Последовательность закончилась — пора подвести итог'}
        </small>
      </div>
      <details className="study-run-outline">
        <summary>Последовательность сегодняшнего занятия</summary>
        <ol>
          {run.blocks.map((block) => (
            <li key={block.id} data-current={block.id === current?.id}>
              <span>
                {block.status === 'completed'
                  ? '✓'
                  : block.status === 'skipped'
                    ? '—'
                    : block.id === current?.id
                      ? '→'
                      : '·'}
              </span>
              <strong>{block.title}</strong>
              <small>
                {block.minutes} мин{block.kind === 'break' ? ' · отдых' : ''}
              </small>
            </li>
          ))}
        </ol>
      </details>
      {run.status === 'paused' && (
        <div className="study-banner">
          <Pause size={22} />
          <div>
            <strong>Занятие на паузе</strong>
            <span>Таймер остановлен. Последовательность и твои ответы сохранены.</span>
          </div>
          <button className="button primary" onClick={onPause}>
            Продолжить
          </button>
        </div>
      )}
      {current ? (
        <>
          {current.activeMs >= current.minutes * 60000 && (
            <div className="study-banner">
              <Clock3 size={21} />
              <div>
                <strong>Выделенное время этого шага подошло</strong>
                <span>
                  Можно закончить мысль или перейти дальше. Освоение от таймера не начисляется.
                </span>
              </div>
              <button
                className="button primary"
                disabled={run.status === 'paused'}
                onClick={onNext}
              >
                Следующий шаг <ArrowRight size={17} />
              </button>
            </div>
          )}
          {lesson || (
            <section className="study-active-card" data-subject={current.subject}>
              <span className="study-type-label">
                {current.kind === 'break'
                  ? 'ПЕРЕРЫВ'
                  : subjects.find((s) => s.id === current.subject)?.title}
              </span>
              <h2>{current.title}</h2>
              {current.kind === 'break' ? (
                <div className="study-break">
                  <Coffee size={72} />
                  <p>
                    Отведи взгляд от экрана, встань и немного пройдись. Отдых уже включён в
                    выбранное время.
                  </p>
                  <p className="small muted">
                    Таймер считает активность окна. Ты можешь вернуться и продолжить без ожидания.
                  </p>
                </div>
              ) : (
                <>
                  <details className="block-reason">
                    <summary>Почему этот шаг в плане</summary>
                    <p>{current.reason}</p>
                  </details>
                  {node ? (
                    <CurriculumScene
                      node={node}
                      quality={state.settings.quality}
                      reducedMotion={state.settings.reducedMotion}
                      autoplay={state.settings.sceneAutoplay}
                      initialSpeed={state.settings.sceneSpeed}
                      persistenceKey={`day:${run.id}:${current.id}`}
                      paused={run.status === 'paused'}
                    />
                  ) : (
                    <div className="study-self-guide">
                      <BookOpen size={35} />
                      <h3>Разберём твой вопрос последовательно</h3>
                      <ol>
                        <li>Запиши, что именно нужно понять.</li>
                        <li>Выпиши определение или правило из своего учебного материала.</li>
                        <li>Разбери пример и сохрани непонятный шаг в заметке.</li>
                      </ol>
                      <p className="small muted">
                        Для этой личной темы пока нет подготовленного проверяющего урока. Заметка
                        сохраняется как твоя запись.
                      </p>
                    </div>
                  )}
                  <label>
                    Что понял и что осталось непонятно
                    <textarea
                      className="study-run-note"
                      aria-label="Заметка текущего шага"
                      value={current.note || ''}
                      maxLength={2000}
                      placeholder="Мой вывод, пример или вопрос…"
                      onChange={(e) => onNote(e.target.value)}
                    />
                  </label>
                  {node && <SourceLinks ids={[node.sourceId]} subject={node.subject} />}
                </>
              )}
              <div className="study-run-controls">
                <button
                  className="button primary"
                  disabled={run.status === 'paused'}
                  onClick={onNext}
                >
                  {current.kind === 'break'
                    ? 'Продолжить подготовку'
                    : 'Завершить работу над этим шагом'}{' '}
                  <ArrowRight size={17} />
                </button>
                <button className="text-button" disabled={run.status === 'paused'} onClick={onSkip}>
                  <SkipForward size={16} /> Пропустить
                </button>
              </div>
            </section>
          )}
        </>
      ) : (
        <section className="study-active-card">
          <span className="eyebrow">COSMOS РЯДОМ</span>
          <h2>{allFinished ? 'Подведём итог занятия' : 'Следующий шаг уже выбран'}</h2>
          <p>
            {allFinished
              ? 'Я соберу пройденные блоки, реальные ответы, ошибки и оставшиеся вопросы.'
              : next?.title}
          </p>
          <button
            className="button primary"
            onClick={() => (allFinished ? onFinish(false) : next && onEnter(next.id))}
          >
            {allFinished ? 'Показать итог' : 'Начать следующий шаг'} <ArrowRight size={17} />
          </button>
        </section>
      )}
    </section>
  );
}
function CalendarDaysIcon() {
  return <BookOpen size={16} />;
}
