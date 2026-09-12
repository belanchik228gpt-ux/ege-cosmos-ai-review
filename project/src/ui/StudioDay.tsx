import { useEffect, type Dispatch, type SetStateAction } from 'react';
import {
  ArrowRight,
  CalendarDays,
  Check,
  Clock3,
  Coffee,
  FileText,
  Pause,
  Play,
  SkipForward,
  Square,
} from 'lucide-react';
import type { LearningState } from '../domain/types';
import type { StudyDayRun } from '../domain/study-plan';
import {
  schoolTopics,
  getSchoolTopic,
  getSchoolTopicByLessonId,
  getGradeRoute,
  type SchoolTopic,
} from '../domain/school-catalog';
import { createCloudLesson, type CloudMode } from '../domain/cloud-learning';
import { CloudRoom } from './CloudRoom';
import { TutorMarkdown } from './TutorMarkdown';
import type { OpenAIController } from './useOpenAI';
export function StudioDay({
  state,
  setState,
  run,
  ai,
  onConnect,
  onStart,
  onPractice,
  onCatalog,
  onPlan,
  onNext,
  onSkip,
  onFinish,
  onPause,
  onEnter,
  onContinue,
  notify,
}: {
  state: LearningState;
  setState: Dispatch<SetStateAction<LearningState>>;
  run: StudyDayRun;
  ai: OpenAIController;
  onConnect: () => void;
  onStart: (t: SchoolTopic, mode?: CloudMode) => void;
  onPractice: (id: string) => void;
  onCatalog: () => void;
  onPlan: () => void;
  onNext: () => void;
  onSkip: () => void;
  onFinish: (early: boolean) => void;
  onPause: () => void;
  onEnter: (id: string) => void;
  onContinue: (id: string) => void;
  notify: (s: string) => void;
}) {
  const block = run.blocks.find((b) => b.id === run.activeBlockId),
    id = block ? `day:${run.id}:${block.id}` : undefined;
  const topic = block?.subject
    ? ((block.curriculumNodeId
        ? schoolTopics.find((t) => t.curriculumNodeIds.includes(block.curriculumNodeId!))
        : undefined) ??
      (block.topicId
        ? getSchoolTopic(block.topicId) || getSchoolTopicByLessonId(block.topicId)
        : undefined))
    : undefined;
  useEffect(() => {
    if (!id || !block?.subject || block.kind === 'break' || state.cloudSessions?.[id] || run.report)
      return;
    setState((s) => {
      if (s.cloudSessions?.[id]) return s;
      const lesson = createCloudLesson(
        block.subject!,
        topic?.id ?? `personal:${block.id}`,
        block.title,
        topic ? 'lesson' : 'own',
        block.minutes,
      );
      lesson.id = id;
      lesson.note = `Этот разговор — часть плана дня. Цель блока: ${block.title}. ${block.reason}. ${block.note ?? ''}`;
      return { ...s, cloudSessions: { ...s.cloudSessions, [id]: lesson } };
    });
  }, [id, topic?.id, !!state.cloudSessions?.[id ?? ''], !!run.report]);
  const finished = run.blocks.filter((b) => b.status === 'completed').length,
    lessons = Object.values(state.cloudSessions ?? {}).filter((l) =>
      l.id.startsWith(`day:${run.id}:`),
    );
  async function exportReport() {
    const text = `# Итог занятия ${run.date}\n\nЗавершено блоков: ${finished} из ${run.blocks.length}.\n\n${run.blocks.map((b) => `- ${b.title}: ${b.status === 'completed' ? 'завершён' : b.status === 'skipped' ? 'пропущен' : 'не завершён'}`).join('\n')}\n\n${lessons.map((l) => `## ${l.title}\n\n${l.summary || 'Итог модели не запрашивался. Разговор сохранён в истории предмета.'}`).join('\n\n')}\n\nОтчёт составлен из сохранённых действий в плане. Если в нём приведён итог OpenAI, это мнение модели, а не независимая экзаменационная оценка.`;
    const r = await window.cosmos?.exportDocument({
      title: `Итог занятия ${run.date}`,
      subject: 'all',
      content: text,
      format: 'html',
      documentType: 'Отчёт о прогрессе',
      style: 'cosmos',
    });
    if (r?.ok && r.path) {
      setState((s) => ({
        ...s,
        documents: [
          ...s.documents,
          {
            id: crypto.randomUUID(),
            title: `Итог занятия ${run.date}`,
            subject: 'all',
            createdAt: new Date().toISOString(),
            content: text,
            type: 'Отчёт о прогрессе',
            sources: [],
            status: 'model',
            path: r.path,
            style: 'cosmos',
          },
        ],
      }));
      notify('Отчёт сохранён в файл и добавлен в документы.');
    } else notify('Файл не сохранён. Итог остаётся в истории плана.');
  }
  if (run.report)
    return (
      <section className="studio-day-report">
        <span className="studio-eyebrow">ИТОГ ТВОЕГО ДНЯ</span>
        <h1>{run.report.endedEarly ? 'Сегодня остановились здесь' : 'Занятие завершено'}</h1>
        <p>Сохранены пройденные блоки, переписки и следующие шаги.</p>
        <div className="studio-day-report-metrics">
          <div className="studio-card">
            <strong>
              {finished} / {run.blocks.length}
            </strong>
            <p>блоков завершено</p>
          </div>
          <div className="studio-card">
            <strong>{Math.round(run.report.activeMs / 60000)}</strong>
            <p>минут активной работы</p>
          </div>
          <div className="studio-card">
            <strong>{run.report.independentCorrect}</strong>
            <p>проверенных самостоятельных ответов в локальной практике</p>
          </div>
        </div>
        {lessons.map((l) => (
          <article className="studio-card" key={l.id}>
            <h2>{l.title}</h2>
            {l.summary ? (
              <TutorMarkdown text={l.summary} />
            ) : (
              <p>
                {l.messages.length
                  ? `В переписке ${l.messages.length} сообщений. Индивидуальный итог не запрашивался; можно вернуться к разговору в истории предмета.`
                  : 'Разговор не был начат.'}
              </p>
            )}
          </article>
        ))}
        <div className="studio-actions">
          <button className="button primary" onClick={() => void exportReport()}>
            <FileText size={17} />
            Сохранить отчёт
          </button>
          <button className="button secondary" onClick={onPlan}>
            Открыть план
          </button>
        </div>
      </section>
    );
  return (
    <section className="studio-day">
      <div className="studio-day-header">
        <div>
          <span className="studio-eyebrow">
            ЗАНЯТИЕ ПО ПЛАНУ · {run.blocks.reduce((s, b) => s + b.minutes, 0)} МИНУТ
          </span>
          <h1>Один понятный шаг за другим</h1>
          <p>
            {finished} из {run.blocks.length} блоков завершено ·{' '}
            {run.status === 'paused'
              ? 'пауза'
              : 'сейчас ' + (block?.title ?? 'выбираем следующий блок')}
          </p>
        </div>
        <div className="studio-actions">
          <button className="button secondary" onClick={onPause}>
            {run.status === 'paused' ? <Play size={16} /> : <Pause size={16} />}{' '}
            {run.status === 'paused' ? 'Продолжить' : 'Пауза'}
          </button>
          <button className="text-button" onClick={() => onFinish(true)}>
            Завершить сегодня
          </button>
        </div>
      </div>
      <div className="studio-day-strip" aria-label="План занятия">
        {run.blocks.map((b, i) => (
          <button
            key={b.id}
            className={b.id === block?.id ? 'active' : ''}
            onClick={() => onEnter(b.id)}
            disabled={['completed', 'skipped'].includes(b.status)}
          >
            <span>
              {b.status === 'completed' ? (
                <Check size={14} />
              ) : b.kind === 'break' ? (
                <Coffee size={14} />
              ) : (
                i + 1
              )}
            </span>
            <div>
              <strong>{b.title}</strong>
              <small>
                {b.minutes} мин ·{' '}
                {b.status === 'completed'
                  ? 'завершено'
                  : b.status === 'skipped'
                    ? 'пропущено'
                    : b.id === block?.id
                      ? 'сейчас'
                      : 'впереди'}
              </small>
            </div>
          </button>
        ))}
      </div>
      {run.status === 'paused' ? (
        <div className="studio-card studio-welcome">
          <Pause size={28} />
          <h2>Можно выдохнуть</h2>
          <p>Тема и разговор сохранены. Продолжим, когда будешь готов.</p>
          <button className="button primary" onClick={onPause}>
            Продолжить занятие
          </button>
        </div>
      ) : null}
      <div style={{ display: run.status === 'paused' ? 'none' : undefined }}>
        {block?.kind === 'break' ? (
          <div className="studio-card studio-welcome">
            <Coffee size={32} />
            <h2>Небольшой перерыв</h2>
            <p>{block.minutes} минут, чтобы отдохнуть от экрана.</p>
            <button className="button primary" onClick={onNext}>
              Я отдохнул, продолжаем <ArrowRight size={16} />
            </button>
          </div>
        ) : block?.subject && id && state.cloudSessions?.[id] ? (
          <CloudRoom
            key={id}
            state={state}
            setState={setState}
            subject={block.subject}
            lessonId={id}
            ai={ai}
            paused={run.status === 'paused'}
            onConnect={onConnect}
            onStart={onStart}
            onSelect={onContinue}
            onCatalog={onCatalog}
            onPractice={onPractice}
            notify={notify}
          />
        ) : (
          <div className="studio-card">
            <p>Для этого блока можно выбрать тему в каталоге.</p>
            <button className="button secondary" onClick={onCatalog}>
              Выбрать тему
            </button>
          </div>
        )}
      </div>
      {block && block.kind !== 'break' && run.status !== 'paused' && (
        <div className="studio-day-next">
          <button className="text-button" onClick={onSkip}>
            <SkipForward size={16} />
            Отложить этот блок
          </button>
          <span>Переход не означает, что тема уже освоена.</span>
          <button className="button primary" onClick={onNext}>
            Следующий блок <ArrowRight size={16} />
          </button>
        </div>
      )}
    </section>
  );
}
