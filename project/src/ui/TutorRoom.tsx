import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Camera,
  Check,
  CircleHelp,
  FileText,
  Layers3,
  Maximize2,
  Minimize2,
  Mic,
  NotebookPen,
  Orbit,
  Search,
  ShieldCheck,
  Volume2,
  X,
} from 'lucide-react';
import {
  subjects,
  topics,
  appendDiscussion,
  submitAnswer,
  finishSession,
  topicStatus,
  isTaskRevealed,
  type LearningState,
  type SubjectId,
} from '../domain';
import {
  getTeachingContext,
  getTeachingChoices,
  selectTeachingStep,
  interpretTeachingInput,
  isExpressionValueRequest,
} from '../domain/teaching';
import { parseProblem } from '../domain/problem-workbench';
import { latestDiagnostic, diagnosticMemory } from '../domain/diagnostics';
import { createHomework, homeworkMemory } from '../domain/homework';
import { prepareGrounding, isExamReferenceQuery } from '../domain/grounding';
import { ScenePlayer } from '../scenes/ScenePlayer';
import { CurriculumScene } from '../scenes/CurriculumScene';
import { ProblemScene } from '../scenes/ProblemScene';
import { TeachingScene } from '../scenes/TeachingScene';
import { SourceLinks } from './SourceLinks';
import { useLessonActivity } from './useLessonActivity';
import { LessonProgress } from './LessonProgress';
import { TaskBoard } from './TaskBoard';
import { getTutorResponse, keepTutorExplanation } from './tutor-response';
import { shouldOpenOwnProblem } from './tutor-routing';
import { matchesSearchText } from './search-text';
import type { Task } from '../domain/types';
import './tutor-workspace.css';

type Props = {
  state: LearningState;
  setState: React.Dispatch<React.SetStateAction<LearningState>>;
  subject: SubjectId;
  sessionId: string | null;
  setSessionId: (id: string | null) => void;
  begin: (id: string) => void;
  notify: (s: string) => void;
  modelAvailable: boolean;
  openKnowledge: (id?: string) => void;
  openDocument: (id: string) => void;
  openCheckin: () => void;
  openHomework: (sourceSessionId?: string) => void;
  openProblem: (text?: string, image?: File) => void;
  openCatalog: () => void;
  guided?: { paused: boolean; onNext: () => void; onSkip: () => void; onPlan: () => void };
};
function draftFor(id: string | null) {
  try {
    return id ? JSON.parse(sessionStorage.getItem(`cosmos-composer:${id}`) || '{}').text || '' : '';
  } catch {
    return '';
  }
}

export function TutorRoom({
  state,
  setState,
  subject,
  sessionId,
  setSessionId,
  begin,
  notify,
  modelAvailable,
  openKnowledge,
  openDocument,
  openCheckin,
  openHomework,
  openProblem,
  openCatalog,
  guided,
}: Props) {
  const session = sessionId ? state.sessions[sessionId] : undefined;
  const topic = topics.find((t) => t.id === session?.topicId);
  const data = subjects.find((s) => s.id === subject)!;
  const task = topic?.tasks[Math.min(session?.taskIndex || 0, topic.tasks.length - 1)];
  const teaching = session && task ? getTeachingContext(session, task) : undefined;
  const activeTask: Task | undefined = teaching?.activeQuestion ?? task;
  const problem = useMemo(
    () => (activeTask && subject === 'math' ? parseProblem(activeTask.prompt) : undefined),
    [activeTask?.id, activeTask?.prompt, subject],
  );
  const [input, setInput] = useState(() => draftFor(sessionId));
  const [search, setSearch] = useState('');
  const [picker, setPicker] = useState(false);
  const [history, setHistory] = useState(false);
  const [concept, setConcept] = useState(false);
  const [phase, setPhase] = useState(0);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [listening, setListening] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const token = useRef(0);
  const alive = useRef(true);
  const memory = [diagnosticMemory(state, subject), homeworkMemory(state, subject)]
    .filter(Boolean)
    .join(' ');
  const finished = !!session?.completedAt || session?.phase === 'summary';
  useLessonActivity(sessionId, finished || !!guided?.paused, setState);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      token.current++;
      void window.cosmos?.cancelAskModel();
    };
  }, []);
  useEffect(() => {
    token.current++;
    setBusy(false);
    setInput(draftFor(sessionId));
    setConcept(false);
    setPhase(0);
    setPicker(false);
  }, [sessionId]);
  useEffect(() => {
    setPhase(0);
    setConcept(false);
  }, [activeTask?.id]);
  useEffect(() => {
    if (!sessionId) return;
    try {
      sessionStorage.setItem(`cosmos-composer:${sessionId}`, JSON.stringify({ text: input }));
    } catch {}
  }, [input, sessionId]);
  useEffect(() => {
    const dialogue = end.current?.parentElement;
    dialogue?.scrollTo({
      top: dialogue.scrollHeight,
      behavior: state.settings.reducedMotion ? 'instant' : 'smooth',
    });
  }, [session?.messages.length, busy]);
  useEffect(() => {
    if (!busy) {
      setElapsed(0);
      return;
    }
    const t = setInterval(() => setElapsed((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [busy]);
  async function send(override?: string) {
    const message = (override ?? input).trim();
    if (!message || !session || !topic || !task || !activeTask || guided?.paused) return;
    if (busy) cancel();
    setInput('');
    const { intent, assessment } = interpretTeachingInput(activeTask, message);
    // Only an explicit new-problem request changes workspaces. Equations also occur in reasoning.
    if (assessment.status !== 'correct' && shouldOpenOwnProblem(message, subject)) {
      openProblem(message);
      return;
    }
    const id = session.id;
    let nextState = finished
      ? appendDiscussion(state, id, 'student', message, 'discussion')
      : submitAnswer(state, id, message);
    let nextSession = nextState.sessions[id];
    // Apply the complete domain turn first. A slow model may improve wording, never freeze the step.
    const commitSession = (
      updated: typeof nextSession,
      progress = nextState.progress[topic.id],
      expectedRevision?: number,
    ) =>
      setState((s) => {
        const live = s.sessions[id];
        if (
          !live ||
          (expectedRevision !== undefined &&
            (live.taskIndex !== session.taskIndex ||
              getTeachingContext(live, task).revision !== expectedRevision))
        )
          return s;
        return {
          ...s,
          sessions: {
            ...s.sessions,
            [id]: {
              ...live,
              ...updated,
              note: live.note,
              activeMs: live.activeMs ?? updated.activeMs,
            },
          },
          progress: { ...s.progress, [topic.id]: progress },
        };
      });
    commitSession(nextSession);
    setPhase(intent === 'answer' ? 2 : 1);
    const needsExplanation =
      finished ||
      ['why', 'hint', 'discussion'].includes(intent) ||
      (intent === 'answer' && assessment.status === 'not-answer');
    if (
      !needsExplanation ||
      (!finished && nextSession.phase === 'summary') ||
      nextSession.taskIndex !== session.taskIndex ||
      (isExamReferenceQuery(message) && !window.cosmos)
    )
      return;
    let context = getTeachingContext(nextSession, task);
    setBusy(true);
    const request = ++token.current;
    try {
      // Obvious requests use the current step. A specific misunderstanding may need a prerequisite.
      const choices = getTeachingChoices(context).slice(0, 8);
      if (
        !finished &&
        modelAvailable &&
        window.cosmos?.planTutorTurn &&
        choices.length > 1 &&
        !(context.mode === 'detour' && context.stepId !== teaching?.stepId) &&
        !(context.mode === 'detour' && isExpressionValueRequest(message)) &&
        message.length > 24 &&
        /почему|не\s+(?:понимаю|понял|знаю)|что\s+значит|как\s+|запутал/i.test(message)
      ) {
        const stateKey = `${id}:${task.id}:${context.revision}`;
        const plan = await window.cosmos.planTutorTurn({
          subject,
          message: message.slice(0, 3000),
          currentStepId: context.stepId,
          stateKey,
          steps: choices.map((choice) => ({
            ...choice,
            explanation: choice.explanation.slice(0, 500),
            question: choice.question.slice(0, 360),
            sourceIds: ['cosmos-training'],
          })),
        });
        if (!alive.current || request !== token.current) return;
        if (
          plan.ok &&
          plan.stateKey === stateKey &&
          typeof plan.selectedStepId === 'string' &&
          plan.selectedStepId !== context.stepId
        ) {
          const beforeRevision = context.revision;
          nextSession = selectTeachingStep(nextSession, task, plan.selectedStepId);
          context = getTeachingContext(nextSession, task);
          const last = nextSession.messages.reduce(
            (found, m, index) => (m.role === 'cosmos' ? index : found),
            -1,
          );
          if (last >= 0)
            nextSession.messages[last] = {
              ...nextSession.messages[last],
              text: `Разберём этот момент отдельно. ${context.explanation}\n\n${context.activeQuestion.prompt}`,
              kind: 'hint',
            };
          commitSession(nextSession, nextState.progress[topic.id], beforeRevision);
        }
      }
      const revision = context.revision;
      const pendingId = finished
        ? undefined
        : nextSession.messages.filter((m) => m.role === 'cosmos').at(-1)?.id;
      const fallback = context.explanation || activeTask.hint;
      const reply = await getTutorResponse({
        subject,
        name: state.profile.name,
        topic,
        task: context.activeQuestion,
        protectedTask: task,
        message,
        messages: nextSession.messages,
        memory,
        allowAnswer: finished || context.revealed,
        teaching:
          finished || isExamReferenceQuery(message)
            ? undefined
            : {
                id: context.stepId,
                title: context.title,
                explanation: fallback,
                question: context.completed
                  ? 'Шаг уже принят. Можно обсудить его или продолжить.'
                  : context.activeQuestion.prompt,
              },
        fallback,
      });
      if (alive.current && request === token.current)
        setState((s) => {
          const live = s.sessions[id];
          if (
            !live ||
            live.taskIndex !== session.taskIndex ||
            getTeachingContext(live, task).revision !== revision
          )
            return s;
          const text =
            finished || isExamReferenceQuery(message)
              ? reply.text
              : `${keepTutorExplanation(reply.text)}\n\n${context.completed ? 'Этот шаг уже принят. Можем продолжить разбор.' : context.activeQuestion.prompt}`;
          const replacement = {
            ...reply,
            text,
            id: pendingId || crypto.randomUUID(),
            role: 'cosmos' as const,
          };
          const messages =
            !finished && pendingId
              ? live.messages.map((m) => (m.id === pendingId ? replacement : m))
              : [...live.messages, replacement];
          return { ...s, sessions: { ...s.sessions, [id]: { ...live, messages } } };
        });
    } catch {
      // The authored step and its animation are already visible. Technical detail stays in diagnostics.
      void window.cosmos?.recordTutorCheck('teaching-wording-unavailable').catch(() => {});
    } finally {
      if (request === token.current) setBusy(false);
    }
  }
  function cancel() {
    token.current++;
    setBusy(false);
    void window.cosmos?.cancelAskModel();
  }
  function finish() {
    if (guided) {
      guided.onNext();
      return;
    }
    setState((s) => {
      const next = finishSession(s, session!.id);
      return s.settings.autoHomework ? createHomework(next, subject, session!.id).state : next;
    });
  }
  function speak(text: string) {
    if (!('speechSynthesis' in window)) {
      notify('Озвучивание недоступно. Текст остаётся на экране.');
      return;
    }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ru-RU';
    u.rate = state.settings.voiceRate;
    u.pitch = state.settings.voicePitch;
    u.volume = state.settings.voiceVolume;
    speechSynthesis.speak(u);
  }
  function microphone() {
    const Recognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Recognition) {
      notify('Локальное распознавание речи пока недоступно на этом устройстве.');
      return;
    }
    const rec = new Recognition();
    if (!('processLocally' in rec)) {
      notify('Локальное распознавание речи пока недоступно на этом устройстве.');
      return;
    }
    rec.processLocally = true;
    rec.lang = 'ru-RU';
    rec.onresult = (e: any) => {
      setInput(e.results[0][0].transcript);
      setListening(false);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    try {
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  }
  const topicList = (
    <div className="direct-topic-picker">
      <div className="card-top">
        <h2>{history ? 'История занятий' : `Выбрать тему · ${data.title}`}</h2>
        {session && (
          <button
            className="icon-button"
            aria-label="Закрыть выбор темы"
            onClick={() => setPicker(false)}
          >
            <X size={19} />
          </button>
        )}
      </div>
      <div className="room-toolbar">
        <label className="search">
          <Search size={18} />
          <input
            aria-label="Поиск темы в комнате"
            placeholder="Название темы…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <button className="text-button" onClick={() => setHistory(!history)}>
          {history ? 'Темы' : 'История'}
        </button>
        <button className="text-button" onClick={openCatalog}>
          Все темы ЕГЭ <ArrowRight size={15} />
        </button>
      </div>
      <div className="direct-topics">
        {history
          ? Object.values(state.sessions)
              .filter((s) => s.subject === subject)
              .reverse()
              .map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setSessionId(s.id);
                    setPicker(false);
                  }}
                >
                  <BookOpen size={20} />
                  <div>
                    <strong>{topics.find((t) => t.id === s.topicId)?.title}</strong>
                    <span>
                      {new Date(s.startedAt).toLocaleDateString('ru-RU')} ·{' '}
                      {s.completedAt ? 'Итог' : 'Продолжить'}
                    </span>
                  </div>
                  <ArrowRight size={18} />
                </button>
              ))
          : topics
              .filter(
                (t) =>
                  t.subject === subject && matchesSearchText(`${t.title} ${t.description}`, search),
              )
              .map((t) => {
                const active = Object.values(state.sessions).find(
                  (s) => s.topicId === t.id && !s.completedAt,
                );
                const done = active?.taskIndex || 0;
                const hasCompleted = Object.values(state.sessions).some(
                  (s) => s.topicId === t.id && !!s.completedAt,
                );
                return (
                  <button
                    key={t.id}
                    data-current={t.id === topic?.id}
                    onClick={() => {
                      begin(t.id);
                      setPicker(false);
                    }}
                  >
                    <BookOpen size={22} />
                    <div>
                      <strong>{t.title}</strong>
                      <span>{t.description}</span>
                      {active && (
                        <progress
                          aria-label={`Пройденные задания текущего занятия: ${t.title}`}
                          max={t.tasks.length}
                          value={done}
                        />
                      )}
                      <small>
                        {active
                          ? t.id === topic?.id
                            ? 'Текущее занятие'
                            : 'Можно продолжить'
                          : topicStatus(state, t.id).mastery === 'mastered'
                            ? 'Освоение подтверждено'
                            : hasCompleted
                              ? 'Занятие завершено · Повторить'
                              : 'Начать'}
                        {active && ` · ${done}/${t.tasks.length} заданий пройдено`} ·{' '}
                        {t.durationMinutes} мин
                      </small>
                    </div>
                    <ArrowRight size={18} />
                  </button>
                );
              })}
      </div>
      {!history && (
        <p className="small muted">
          Здесь — готовые занятия с проверкой. Полный маршрут по кодификатору доступен в «Все темы
          ЕГЭ».
        </p>
      )}
    </div>
  );
  if (!session || !topic || !task || !activeTask)
    return (
      <section className={`tutor-workspace subject-${subject}`}>
        <div className="room-start">
          <div>
            <span className="eyebrow">УЧЕБНАЯ КОМНАТА</span>
            <h1>{data.title}</h1>
            <p>Выбери тему — условие, объяснение и твой ответ будут на одной доске.</p>
          </div>
          <button className="button primary" onClick={openCheckin}>
            Короткая диагностика <ArrowRight size={17} />
          </button>
        </div>
        {topicList}
      </section>
    );
  const remaining = Math.max(0, topic.tasks.length - session.taskIndex);
  return (
    <section className={`tutor-workspace subject-${subject}`}>
      <div className="room-actions">
        <button
          className="text-button"
          aria-label={state.settings.focusMode ? 'Выйти из фокуса' : 'Сосредоточиться'}
          onClick={() =>
            setState((s) => ({
              ...s,
              settings: { ...s.settings, focusMode: !s.settings.focusMode },
            }))
          }
        >
          {state.settings.focusMode ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          {state.settings.focusMode ? 'Выйти из фокуса' : 'Фокус'}
        </button>
        <button
          className="button secondary"
          onClick={() => {
            setPicker(!picker);
            setHistory(false);
          }}
        >
          <Search size={17} /> Сменить тему
        </button>
        {subject === 'math' && (
          <button className="button secondary" onClick={() => openProblem()}>
            <Camera size={17} /> Своя задача / фото
          </button>
        )}
        <details className="lesson-toolbox">
          <summary>
            <Layers3 size={16} /> Материалы
          </summary>
          <div className="lesson-toolbox-actions">
            <button onClick={openCheckin}>Диагностика</button>
            <button
              onClick={() => {
                setState((s) => createHomework(s, subject, session.id).state);
                openHomework(session.id);
              }}
            >
              Домашняя работа
            </button>
            <button onClick={() => openDocument(session.id)}>Конспект</button>
            <button
              onClick={() =>
                openKnowledge(prepareGrounding(subject, topic.title, topic).knowledgeIds[0])
              }
            >
              Правила и источники
            </button>
          </div>
        </details>
        <button
          className="text-button"
          disabled={busy || !!guided?.paused || (!!session.completedAt && !guided)}
          onClick={finish}
        >
          <Check size={17} />
          {guided ? 'Завершить блок' : 'Завершить занятие'}
        </button>
      </div>
      {picker && topicList}
      <LessonProgress
        title={topic.title}
        total={topic.tasks.length}
        completed={session.taskIndex}
        phase={
          finished ? 3 : teaching?.completed ? 2 : teaching && teaching.mode !== 'main' ? 1 : phase
        }
        request={
          finished
            ? 'Посмотри итог. Затем повторим тему позже или перейдём дальше.'
            : teaching?.completed
              ? 'Этот маленький шаг принят. Можно уточнить объяснение или продолжить.'
              : activeTask.prompt
        }
        next={
          finished
            ? 'сохранённый отчёт и повторение'
            : `до итога осталось заданий: ${remaining}${teaching?.mode !== 'main' ? ` · сейчас: ${teaching?.title}` : ''}`
        }
      />
      <div className="tutor-grid">
        <main className="current-board">
          {finished ? (
            <div className="lesson-finish-card">
              <span className="eyebrow">ИТОГ ЭТОГО ЗАНЯТИЯ</span>
              <h2>Соберём то, что получилось</h2>
              <p>
                {session.summary ||
                  session.messages.filter((m) => m.kind === 'summary').at(-1)?.text ||
                  'Разбор завершён. Сохрани итог, чтобы увидеть самостоятельные ответы и шаги с помощью.'}
              </p>
              <div className="room-actions">
                <button className="button primary" onClick={() => openDocument(session.id)}>
                  <FileText size={17} /> Конспект и отчёт
                </button>
                {guided ? (
                  <button className="button secondary" onClick={guided.onNext}>
                    Следующий блок <ArrowRight size={17} />
                  </button>
                ) : (
                  <button className="button secondary" onClick={() => setPicker(true)}>
                    Следующая тема <ArrowRight size={17} />
                  </button>
                )}
              </div>
            </div>
          ) : teaching?.visual ? (
            <TeachingScene
              key={`${session.id}:${task?.id}:${teaching.stepId}:${teaching.revision}`}
              visual={teaching.visual}
              title={teaching.title}
              narration={teaching.explanation}
              question={
                teaching.completed
                  ? 'Шаг принят. Продолжим, когда будешь готов.'
                  : activeTask.prompt
              }
              quality={state.settings.quality}
              reducedMotion={state.settings.reducedMotion}
              autoplay={state.settings.sceneAutoplay}
              initialSpeed={state.settings.sceneSpeed}
              persistenceKey={`${session.id}:${task?.id}:${teaching.stepId}:${teaching.revision}`}
              paused={guided?.paused}
              revealAnswer={teaching.revealed || teaching.completed}
              onStepChange={(s) => setPhase(s.index === 0 ? 0 : s.complete ? 2 : 1)}
            />
          ) : problem?.verified ? (
            <ProblemScene
              key={`${session.id}:${activeTask.id}`}
              problem={problem}
              quality={state.settings.quality}
              reducedMotion={state.settings.reducedMotion}
              autoplay={state.settings.sceneAutoplay}
              initialSpeed={state.settings.sceneSpeed}
              persistenceKey={`${session.id}:${activeTask.id}`}
              paused={guided?.paused}
              revealAnswer={isTaskRevealed(session)}
              onStepChange={(s) => setPhase(s.index === 0 ? 0 : s.complete ? 2 : 1)}
            />
          ) : (
            <TaskBoard
              key={`${session.id}:${activeTask.id}`}
              task={activeTask}
              subject={subject}
              explanation={teaching?.explanation}
              quality={state.settings.quality}
              reducedMotion={state.settings.reducedMotion}
              autoplay={state.settings.sceneAutoplay}
              paused={guided?.paused}
              onStepChange={(s) => setPhase(s === 0 ? 0 : s === 2 ? 2 : 1)}
            />
          )}
          {!finished && (
            <div className="teaching-actions" aria-label="Управление ходом объяснения">
              <div>
                <strong>
                  {teaching?.mode === 'detour'
                    ? 'Разбираем основу и вернёмся к задаче'
                    : teaching?.mode === 'assisted'
                      ? 'Один маленький шаг'
                      : 'Можно сначала разобраться'}
                </strong>
                <span>
                  {teaching?.completed
                    ? 'Ответ уже принят — переписывать его не нужно.'
                    : 'Можно ответить своими словами, задать вопрос или продолжить без проверки.'}
                </span>
              </div>
              <button
                className="button secondary"
                disabled={!!guided?.paused}
                onClick={() => void send('что дальше?')}
              >
                {teaching?.mode === 'main' ? 'Следующее задание' : 'Продолжить разбор'}{' '}
                <ArrowRight size={16} />
              </button>
            </div>
          )}
          {!finished && activeTask.choices && (
            <div className="answer-choices">
              {activeTask.choices.map((choice) => (
                <button
                  key={choice}
                  disabled={busy || !!guided?.paused}
                  onClick={() => void send(choice)}
                >
                  {choice}
                </button>
              ))}
            </div>
          )}
          <details
            className="concept-reference"
            open={concept}
            onToggle={(e) => setConcept(e.currentTarget.open)}
          >
            <summary>
              <BookOpen size={18} /> Объяснение темы на отдельном примере{' '}
              <span>не текущее задание</span>
            </summary>
            {concept && (
              <>
                <p>
                  Это разбор правила с другими числами или формулировкой. Текущее условие и твой
                  ответ остаются вверху и в диалоге.
                </p>
                {topic.id === 'math-radicals' && topic.tasks[0].teachingSteps?.[0].visual ? (
                  <TeachingScene
                    visual={topic.tasks[0].teachingSteps[0].visual}
                    title="Смысл корня из квадрата"
                    reducedMotion={state.settings.reducedMotion}
                    quality={state.settings.quality}
                    autoplay={false}
                  />
                ) : topic.sceneId === 'math-absolute' ? (
                  <CurriculumScene
                    node={{
                      id: 'math-absolute',
                      subject: 'math',
                      title: topic.title,
                      section: 'Числа и выражения',
                    }}
                    quality={state.settings.quality}
                    reducedMotion={state.settings.reducedMotion}
                    autoplay={false}
                    persistenceKey={`reference:${session.id}`}
                  />
                ) : (
                  <ScenePlayer
                    sceneId={topic.sceneId}
                    quality={state.settings.quality}
                    reducedMotion={state.settings.reducedMotion}
                    autoplay={false}
                    persistenceKey={`reference:${session.id}`}
                    hideQuestion
                  />
                )}
              </>
            )}
          </details>
          {memory && (
            <details className="concept-reference">
              <summary>
                <Orbit size={18} /> Что учитывает Cosmos
              </summary>
              <p>{memory}</p>
              <button className="text-button" onClick={() => openHomework(session.id)}>
                Открыть домашнюю работу
              </button>
            </details>
          )}
          <details className="lesson-notebook">
            <summary>
              <NotebookPen size={18} /> Мой черновик
            </summary>
            <textarea
              aria-label="Черновик занятия"
              placeholder="Запиши свой ход мысли…"
              value={session.note || ''}
              maxLength={20000}
              onChange={(e) => {
                const note = e.target.value;
                setState((s) => ({
                  ...s,
                  sessions: { ...s.sessions, [session.id]: { ...s.sessions[session.id], note } },
                }));
              }}
            />
          </details>
          <p className="source-note">
            <ShieldCheck size={15} /> Авторское тренировочное задание Cosmos. Подсказки учитываются
            отдельно от самостоятельных ответов.
          </p>
        </main>
        <aside className="tutor-conversation">
          <div className="tutor-header">
            <span className="cosmos-avatar">
              <Orbit size={23} />
            </span>
            <div>
              <strong>Cosmos</strong>
              <span>{modelAvailable ? 'Локальный преподаватель' : 'Учебный режим'}</span>
            </div>
            <span className="mini-tag">
              {finished
                ? 'Итог'
                : `${Math.min(session.taskIndex + 1, topic.tasks.length)}/${topic.tasks.length}`}
            </span>
          </div>
          <div className="conversation-condition">
            <small>
              {teaching?.mode !== 'main'
                ? teaching?.completed
                  ? 'ШАГ ПРИНЯТ'
                  : 'МАЛЕНЬКИЙ ШАГ'
                : 'ОТВЕЧАЕМ НА ЭТО'}
            </small>
            <p>
              {finished
                ? 'Можно обсудить итог и непонятные шаги.'
                : teaching?.completed
                  ? teaching.title
                  : activeTask.prompt}
            </p>
          </div>
          <div className="dialogue" aria-live="polite">
            {session.messages.map((m) => (
              <div key={m.id} className={`message ${m.role}`}>
                <span>
                  {m.role === 'student'
                    ? state.profile.name
                    : m.kind === 'model'
                      ? 'COSMOS · ЛОКАЛЬНАЯ НЕЙРОСЕТЬ'
                      : 'COSMOS'}
                </span>
                <p>{m.text}</p>
                {m.verification?.evidence.length ? (
                  <details className="message-evidence">
                    <summary>
                      <ShieldCheck size={13} /> На чём основано объяснение
                    </summary>
                    {m.verification.evidence.map((e, i) => (
                      <blockquote key={i}>{e.quote}</blockquote>
                    ))}
                  </details>
                ) : null}
                {m.sourceIds?.length ? (
                  <SourceLinks ids={m.sourceIds} subject={subject} compact label="Источники" />
                ) : null}
                {state.settings.voice && m.role === 'cosmos' && (
                  <button className="text-button" onClick={() => speak(m.text)}>
                    <Volume2 size={14} /> Послушать
                  </button>
                )}
              </div>
            ))}
            {busy && (
              <div className="tutor-thinking">
                <span className="thinking-orbit" />
                <p>
                  Cosmos подбирает объяснение
                  <small>{elapsed} с · можно остановить ожидание</small>
                </p>
                <button className="text-button" onClick={cancel}>
                  Остановить
                </button>
              </div>
            )}
            <div ref={end} />
          </div>
          <div className="composer unified-composer">
            {!finished && (
              <div className="tutor-suggestions">
                <button
                  disabled={busy || !!guided?.paused}
                  onClick={() => void send('дай подсказку')}
                >
                  <CircleHelp size={14} /> Подсказка
                </button>
                <button
                  disabled={busy || !!guided?.paused}
                  onClick={() => void send('Объясни первый шаг')}
                >
                  Объясни пошагово
                </button>
                <button
                  disabled={busy || !!guided?.paused}
                  onClick={() => void send('напиши ответ')}
                >
                  Показать всё решение
                </button>
              </div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
            >
              <textarea
                rows={3}
                maxLength={4000}
                aria-label="Сообщение Cosmos"
                onPaste={(e) => {
                  const file = [...e.clipboardData.items]
                    .find((item) => item.type.startsWith('image/'))
                    ?.getAsFile();
                  if (file) {
                    e.preventDefault();
                    openProblem('', file);
                  }
                }}
                onDragOver={(e) => {
                  if (e.dataTransfer.types.includes('Files')) e.preventDefault();
                }}
                onDrop={(e) => {
                  const file = e.dataTransfer.files[0];
                  if (file) {
                    e.preventDefault();
                    openProblem('', file);
                  }
                }}
                placeholder="Ответ, вопрос или «не понимаю»…"
                value={input}
                disabled={!!guided?.paused}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (
                    e.key === 'Enter' &&
                    !e.shiftKey &&
                    (state.settings.enterToSend || e.ctrlKey || e.metaKey)
                  ) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
              <div>
                <small>Можно отвечать своими словами</small>
                <button
                  className={`icon-button ${listening ? 'listening' : ''}`}
                  type="button"
                  aria-label="Ввести голосом"
                  onClick={microphone}
                >
                  <Mic size={17} />
                </button>
                <button
                  className="send-button"
                  aria-label="Отправить сообщение"
                  disabled={!input.trim() || !!guided?.paused}
                >
                  <ArrowRight size={20} />
                </button>
              </div>
            </form>
          </div>
        </aside>
      </div>
    </section>
  );
}
