import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  ImagePlus,
  Orbit,
  Pencil,
  Plus,
  ShieldCheck,
  X,
} from 'lucide-react';
import type { LearningState, Message } from '../domain/types';
import {
  createProblemSession,
  restoreProblem,
  type ProblemSession,
} from '../domain/problem-sessions';
import { parseProblem } from '../domain/problem-workbench';
import {
  applyProblemTeachingTurn,
  createProblemTask,
  getProblemTeachingContext,
  selectProblemTeachingStep,
} from '../domain/problem-teaching';
import { getTeachingChoices } from '../domain/teaching';
import { TeachingScene } from '../scenes/TeachingScene';
import { ProblemScene } from '../scenes/ProblemScene';
import { LessonProgress } from './LessonProgress';
import { getTutorResponse, keepTutorExplanation } from './tutor-response';
import './tutor-workspace.css';

type Props = {
  state: LearningState;
  setState: React.Dispatch<React.SetStateAction<LearningState>>;
  initialText?: string;
  initialImage?: File;
  onClose: () => void;
  notify: (text: string) => void;
};
function lastProblem() {
  try {
    return sessionStorage.getItem('cosmos-last-problem') || '';
  } catch {
    return '';
  }
}
const newMessage = (role: Message['role'], text: string, kind = 'material'): Message => ({
  id: crypto.randomUUID(),
  role,
  text,
  kind,
});

export function ProblemWorkspace({
  state,
  setState,
  initialText = '',
  initialImage,
  onClose,
  notify,
}: Props) {
  const [id, setId] = useState(initialText || initialImage ? '' : lastProblem);
  const current = state.problemSessions?.[id];
  const [draft, setDraft] = useState(initialText);
  const [editing, setEditing] = useState(!!initialText || !!initialImage || !current);
  const [image, setImage] = useState('');
  const [photoName, setPhotoName] = useState('');
  const [reading, setReading] = useState(false);
  const [readNote, setReadNote] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState(0);
  const [fromPhoto, setFromPhoto] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const token = useRef(0);
  const imageToken = useRef(0);
  const alive = useRef(true);
  const problem = useMemo(
    () => (current ? restoreProblem(current) : undefined),
    [current?.confirmedText],
  );
  const teaching = current && problem?.verified ? getProblemTeachingContext(current) : undefined;
  const preview = useMemo(() => (draft.trim() ? parseProblem(draft) : undefined), [draft]);
  useEffect(() => {
    if (!initialImage) return;
    const timer = setTimeout(() => void loadImage(initialImage), 0);
    return () => clearTimeout(timer);
  }, [initialImage]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      token.current++;
      imageToken.current++;
      void window.cosmos?.cancelImageReading();
      void window.cosmos?.cancelAskModel();
    };
  }, []);
  useEffect(() => {
    if (!reading && !busy) {
      setElapsed(0);
      return;
    }
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [reading, busy]);
  useEffect(() => {
    if (id)
      try {
        sessionStorage.setItem('cosmos-last-problem', id);
      } catch {}
  }, [id]);
  useEffect(() => {
    const dialogue = end.current?.parentElement;
    dialogue?.scrollTo({ top: dialogue.scrollHeight });
  }, [current?.messages.length, busy]);
  function update(fn: (s: ProblemSession) => ProblemSession) {
    if (!id) return;
    setState((s) => {
      const old = s.problemSessions?.[id];
      return old
        ? {
            ...s,
            problemSessions: {
              ...s.problemSessions,
              [id]: { ...fn(old), updatedAt: new Date().toISOString() },
            },
          }
        : s;
    });
  }
  function start() {
    if (!draft.trim() || reading) return;
    const own = createProblemSession(draft, fromPhoto);
    const parsed = parseProblem(own.confirmedText);
    own.messages = [
      newMessage(
        'cosmos',
        parsed.verified
          ? `${state.profile.name}, разобрал именно твоё условие. Доска построена по нему. Сначала посмотрим на данные, затем ты попробуешь. Можно в любой момент спросить, почему делаем этот шаг.`
          : parsed.question,
      ),
    ];
    setState((s) => ({ ...s, problemSessions: { ...s.problemSessions, [own.id]: own } }));
    setId(own.id);
    setEditing(false);
    setPhase(0);
    setMessage('');
  }
  async function loadImage(file: File) {
    if (reading || busy) return;
    if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 10 * 1024 * 1024) {
      setReadNote('Выбери PNG или JPEG до 10 МБ. Можно обрезать снимок до одного примера.');
      return;
    }
    const version = ++imageToken.current;
    setReading(true);
    setReadNote('Переписываю условие с фотографии. После этого проверь символы и числа.');
    setPhotoName(file.name);
    setFromPhoto(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      if (version !== imageToken.current || !alive.current) return;
      setImage(dataUrl);
      if (!window.cosmos?.readProblemImage) {
        setReadNote(
          'Распознавание фото доступно в установленном приложении. Здесь можно переписать условие в поле ниже.',
        );
        return;
      }
      const result = await window.cosmos.readProblemImage({ dataUrl, subject: 'math' });
      if (version !== imageToken.current || !alive.current) return;
      if (result.ok && result.text) {
        setDraft(result.text);
        setReadNote(
          'Условие переписано локальной моделью. Сверь его с фото, особенно дроби, степени, минусы и скобки. Исправь неточности перед разбором.',
        );
      } else
        setReadNote(
          'Не удалось уверенно прочитать фото. Обрежь снимок до одного примера или перепиши условие ниже.',
        );
    } catch {
      if (version === imageToken.current && alive.current)
        setReadNote(
          'Фотография не прочитана. Можно попробовать другой снимок или ввести условие текстом.',
        );
    } finally {
      if (version === imageToken.current && alive.current) setReading(false);
    }
  }
  function stop() {
    token.current++;
    imageToken.current++;
    setBusy(false);
    setReading(false);
    setReadNote('Ожидание остановлено. Можно продолжить с текстом условия.');
    void window.cosmos?.cancelAskModel();
    void window.cosmos?.cancelImageReading();
  }
  async function send(text = message) {
    if (!current || !problem || !text.trim() || busy) return;
    const content = text.trim();
    setMessage('');
    if (!problem.verified) {
      update((s) => ({
        ...s,
        messages: [
          ...s.messages,
          newMessage('student', content, 'discussion'),
          newMessage('cosmos', `${problem.question} Уточни запись условия перед разбором.`),
        ],
      }));
      return;
    }
    const turn = applyProblemTeachingTurn(current, content);
    let next = turn.session;
    const initialTurn = next;
    update(() => initialTurn);
    if (turn.action === 'next' && (current.solved || current.revealed)) {
      setDraft('');
      setEditing(true);
      setFromPhoto(false);
      setImage('');
      setReadNote('');
      return;
    }
    setPhase(turn.action === 'answer' ? 2 : 1);
    if (!turn.needsExplanation) return;
    let context = getProblemTeachingContext(next);
    const task = createProblemTask(problem);
    setBusy(true);
    const request = ++token.current;
    try {
      const all = getTeachingChoices(context);
      const choices = [
        all.find((choice) => choice.id === context.stepId)!,
        ...all.filter((choice) => choice.id !== context.stepId),
      ]
        .filter(Boolean)
        .slice(0, 8);
      if (
        !next.solved &&
        !next.revealed &&
        window.cosmos?.planTutorTurn &&
        choices.length > 1 &&
        content.length > 24 &&
        /почему|не\s+(?:понимаю|понял|знаю)|что\s+значит|как\s+|запутал/i.test(content)
      ) {
        const stateKey = `${id}:${task.id}:${context.revision}`;
        const selected = await window.cosmos.planTutorTurn({
          subject: 'math',
          message: content.slice(0, 3000),
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
          selected.ok &&
          selected.stateKey === stateKey &&
          selected.selectedStepId &&
          selected.selectedStepId !== context.stepId
        ) {
          const before = context.revision;
          next = selectProblemTeachingStep(next, selected.selectedStepId);
          context = getProblemTeachingContext(next);
          const last = next.messages.reduce(
            (found, item, index) => (item.role === 'cosmos' ? index : found),
            -1,
          );
          if (last >= 0)
            next.messages[last] = newMessage(
              'cosmos',
              `${context.explanation}\n\n${context.activeQuestion.prompt}`,
              'hint',
            );
          const selectedSession = next;
          update((old) =>
            getProblemTeachingContext(old).revision === before ? selectedSession : old,
          );
        }
      }
      const revision = context.revision;
      const pendingId = next.messages.filter((item) => item.role === 'cosmos').at(-1)?.id;
      const reply = await getTutorResponse({
        subject: 'math',
        name: state.profile.name,
        problem,
        task: context.activeQuestion,
        protectedTask: task,
        message: content,
        messages: next.messages,
        allowAnswer: next.solved || next.revealed,
        teaching: {
          id: context.stepId,
          title: context.title,
          explanation: context.explanation,
          question: context.completed
            ? 'Шаг уже принят. Можно обсудить его или продолжить.'
            : context.activeQuestion.prompt,
        },
        fallback: context.explanation,
      });
      if (alive.current && request === token.current)
        update((old) => {
          if (getProblemTeachingContext(old).revision !== revision) return old;
          const text = `${keepTutorExplanation(reply.text)}\n\n${context.completed ? 'Ответ на этот шаг уже принят. Нажми «Далее», когда будешь готов.' : context.activeQuestion.prompt}`;
          const replacement = {
            ...reply,
            text,
            id: pendingId || crypto.randomUUID(),
            role: 'cosmos' as const,
          };
          return {
            ...old,
            messages: pendingId
              ? old.messages.map((item) => (item.id === pendingId ? replacement : item))
              : [...old.messages, replacement],
          };
        });
    } catch {
      // The local checked step was committed before inference and remains usable.
      void window.cosmos
        ?.recordTutorCheck('own-problem-teaching-wording-unavailable')
        .catch(() => {});
    } finally {
      if (request === token.current) setBusy(false);
    }
  }

  return (
    <section className="problem-workspace tutor-workspace">
      <div className="room-actions">
        <button className="text-button" onClick={onClose}>
          <ArrowLeft size={17} /> Назад к подготовке
        </button>
        <button
          className="button secondary"
          disabled={reading || busy}
          onClick={() => {
            setEditing(true);
            setDraft('');
            setImage('');
            setReadNote('');
            setFromPhoto(false);
          }}
        >
          <Plus size={17} /> Новый пример
        </button>
        <details className="lesson-toolbox">
          <summary>
            <Orbit size={17} /> Мои примеры
          </summary>
          <div className="own-problem-list">
            {Object.values(state.problemSessions || {})
              .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
              .map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    if (reading || busy) return;
                    setId(s.id);
                    setEditing(false);
                    setMessage('');
                  }}
                >
                  <span>{s.solved ? '✓' : '○'}</span>
                  <div>
                    <strong>{s.title}</strong>
                    <small>{new Date(s.createdAt).toLocaleDateString('ru-RU')}</small>
                  </div>
                </button>
              ))}
          </div>
        </details>
      </div>
      {editing || !current ? (
        <>
          <div className="room-start">
            <div>
              <span className="eyebrow">ТВОЙ ПРИМЕР → ТВОЯ ДОСКА</span>
              <h1>Разберём то, что нужно тебе</h1>
              <p>
                Напиши условие или добавь фото одного задания. Cosmos построит шаги по
                подтверждённой записи.
              </p>
            </div>
            <span className="problem-hero-icon">
              <Camera size={45} />
            </span>
          </div>
          <div className="problem-entry-grid">
            <div
              className="photo-entry"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files[0];
                if (file) void loadImage(file);
              }}
            >
              {image ? (
                <img src={image} alt="Фотография условия для проверки распознавания" />
              ) : (
                <div className="photo-placeholder">
                  <ImagePlus size={60} />
                  <h2>Задача из тетради или учебника</h2>
                  <p>Перетащи фото сюда или вставь его из буфера в поле условия.</p>
                </div>
              )}
              <input
                ref={inputRef}
                type="file"
                accept="image/png,image/jpeg"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void loadImage(file);
                  e.target.value = '';
                }}
              />
              <button
                className="button secondary"
                disabled={reading || busy}
                onClick={() => inputRef.current?.click()}
              >
                <Camera size={18} /> {image ? 'Выбрать другое фото' : 'Добавить фотографию'}
              </button>
              {photoName && <small>{photoName}</small>}
            </div>
            <div className="problem-transcript">
              <div className="card-top">
                <span className="eyebrow">
                  {fromPhoto ? 'ПРОВЕРЬ РАСПОЗНАННОЕ УСЛОВИЕ' : 'УСЛОВИЕ ТВОЕЙ ЗАДАЧИ'}
                </span>
                <Pencil size={19} />
              </div>
              <textarea
                aria-label="Условие своей задачи"
                placeholder={
                  'Например: |x − 2| = 3\nили: найти площадь прямоугольника со сторонами 7 и 4 см'
                }
                value={draft}
                maxLength={4000}
                disabled={reading}
                onChange={(e) => setDraft(e.target.value)}
                onPaste={(e) => {
                  const file = [...e.clipboardData.items]
                    .find((i) => i.type.startsWith('image/'))
                    ?.getAsFile();
                  if (file) {
                    e.preventDefault();
                    void loadImage(file);
                  }
                }}
              />
              {readNote && <p className="transcription-note">{readNote}</p>}
              {reading && (
                <div className="tutor-thinking">
                  <span className="thinking-orbit" />
                  <p>
                    Читаю фото · {elapsed} с
                    <small>Первый запуск модели может занять больше времени</small>
                  </p>
                  <button className="text-button" onClick={stop}>
                    Остановить
                  </button>
                </div>
              )}
              {preview && !reading && (
                <p className="problem-parse-status">
                  <ShieldCheck size={17} />
                  {preview.verified
                    ? 'Для этого условия есть вычислительная проверка и пошаговая сцена.'
                    : preview.question}
                </p>
              )}
              <button
                className="button primary"
                disabled={!draft.trim() || reading}
                onClick={start}
              >
                {fromPhoto ? 'Условие верное — разобрать' : 'Разобрать мой пример'}
                <ArrowRight size={18} />
              </button>
              <p className="small muted">
                Сейчас точная локальная проверка доступна для выражений, дробей, процентов,
                площадей, линейных и квадратных уравнений, модуля вида |x − c| = r. Для другой
                задачи Cosmos попросит уточнение. Фото может распознаться с ошибкой — запись
                остаётся редактируемой.
              </p>
            </div>
          </div>
          <div className="own-example-chips">
            {[
              '2/3 × 3/4',
              '|x − 2| = 3',
              '2x + 5 = 17',
              'x² − 5x + 6 = 0',
              'Площадь прямоугольника со сторонами 7 и 4 см',
            ].map((example) => (
              <button
                className="button secondary"
                key={example}
                onClick={() => {
                  setDraft(example);
                  setFromPhoto(false);
                }}
              >
                {example}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <LessonProgress
            title="Твоя задача · математика"
            total={1}
            completed={current.solved ? 1 : 0}
            phase={current.solved ? 3 : problem?.verified ? phase : 0}
            request={
              current.solved
                ? 'Проверь решение на доске или возьми следующий пример.'
                : problem?.verified
                  ? teaching?.activeQuestion.prompt || problem.confirmedText
                  : problem?.question || 'Уточни запись условия перед разбором.'
            }
            next={
              current.solved
                ? 'проверь решение и попробуй похожий пример'
                : !problem?.verified
                  ? 'уточнение условия → проверка записи → разбор'
                  : current.revealed
                    ? 'разбор открыт · самостоятельность не начисляется'
                    : 'твой ответ → проверка → итог'
            }
          >
            <button
              className="text-button"
              disabled={busy}
              onClick={() => {
                setDraft(current.confirmedText);
                setEditing(true);
                setFromPhoto(current.fromPhoto);
              }}
            >
              <Pencil size={17} /> Уточнить условие
            </button>
          </LessonProgress>
          <div className="tutor-grid">
            <main className="current-board">
              {problem?.verified && teaching?.mode !== 'main' && teaching?.visual ? (
                <TeachingScene
                  key={`${current.id}:${teaching.stepId}`}
                  visual={teaching.visual}
                  title={teaching.title}
                  narration={teaching.explanation}
                  question={
                    teaching.completed
                      ? 'Шаг принят. Можно перейти дальше.'
                      : teaching.activeQuestion.prompt
                  }
                  quality={state.settings.quality}
                  reducedMotion={state.settings.reducedMotion}
                  autoplay={state.settings.sceneAutoplay}
                  initialSpeed={state.settings.sceneSpeed}
                  revealAnswer={teaching.completed || teaching.revealed}
                  persistenceKey={`${current.id}:${teaching.stepId}`}
                  onStepChange={(step) => setPhase(step.complete ? 2 : 1)}
                />
              ) : problem?.verified ? (
                <ProblemScene
                  key={current.id}
                  problem={problem}
                  quality={state.settings.quality}
                  reducedMotion={state.settings.reducedMotion}
                  autoplay={state.settings.sceneAutoplay}
                  initialSpeed={state.settings.sceneSpeed}
                  revealAnswer={current.revealed || current.solved}
                  persistenceKey={current.id}
                  onStepChange={(s) => setPhase(s.index === 0 ? 0 : s.complete ? 2 : 1)}
                />
              ) : (
                <div className="lesson-finish-card">
                  <h2>Уточним, прежде чем решать</h2>
                  <p>{problem?.question}</p>
                  <button
                    className="button primary"
                    onClick={() => {
                      setDraft(current.confirmedText);
                      setEditing(true);
                    }}
                  >
                    Уточнить условие
                  </button>
                </div>
              )}
              <p className="source-note">
                <ShieldCheck size={16} /> Пример ученика · решение проверяет локальный вычислитель в
                поддерживаемых типах задач. ФИПИ не является источником этого решения.
              </p>
              {current.solved && (
                <div className="lesson-finish-card">
                  <h2>Этот пример решён</h2>
                  <p>
                    {current.hints || current.revealed
                      ? 'Решение было с помощью. Полезно вернуться к похожему примеру позже.'
                      : 'Ты справился самостоятельно. Одна задача ещё не означает освоение всей темы.'}
                  </p>
                  <button
                    className="button primary"
                    onClick={() => {
                      setDraft('');
                      setEditing(true);
                      setFromPhoto(false);
                      setImage('');
                    }}
                  >
                    Взять следующий пример <ArrowRight size={17} />
                  </button>
                </div>
              )}
            </main>
            <aside className="tutor-conversation">
              <div className="tutor-header">
                <span className="cosmos-avatar">
                  <Orbit size={23} />
                </span>
                <div>
                  <strong>Cosmos</strong>
                  <span>Обсуждаем твой пример</span>
                </div>
              </div>
              <div className="conversation-condition">
                <small>
                  {teaching?.mode !== 'main' ? 'СЕЙЧАС ПРОВЕРЯЕМ ЭТОТ ШАГ' : 'УСЛОВИЕ ТВОЕЙ ЗАДАЧИ'}
                </small>
                <p>{teaching?.activeQuestion.prompt || current.confirmedText}</p>
                {teaching?.mode !== 'main' && (
                  <details>
                    <summary>Исходное условие</summary>
                    <p>{current.confirmedText}</p>
                  </details>
                )}
              </div>
              <div className="dialogue" aria-live="polite">
                {current.messages.map((m) => (
                  <div className={`message ${m.role}`} key={m.id}>
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
                        <summary>Основание объяснения</summary>
                        {m.verification.evidence.map((e, i) => (
                          <blockquote key={i}>{e.quote}</blockquote>
                        ))}
                      </details>
                    ) : null}
                  </div>
                ))}
                {busy && (
                  <div className="tutor-thinking">
                    <span className="thinking-orbit" />
                    <p>Рассуждаю по твоему условию · {elapsed} с</p>
                    <button className="text-button" onClick={stop}>
                      Остановить
                    </button>
                  </div>
                )}
                <div ref={end} />
              </div>
              <div className="composer unified-composer">
                <div className="tutor-suggestions">
                  <button disabled={busy} onClick={() => void send('дай подсказку')}>
                    Подсказка
                  </button>
                  <button disabled={busy} onClick={() => void send('Объясни этот шаг')}>
                    Почему так?
                  </button>
                  <button disabled={busy} onClick={() => void send('напиши ответ')}>
                    Показать разбор
                  </button>
                  {(teaching?.mode !== 'main' || current.solved || current.revealed) && (
                    <button disabled={busy} onClick={() => void send('дальше')}>
                      Далее <ArrowRight size={15} />
                    </button>
                  )}
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void send();
                  }}
                >
                  <textarea
                    aria-label="Сообщение о своей задаче"
                    disabled={busy}
                    rows={3}
                    placeholder={
                      teaching?.mode !== 'main'
                        ? 'Ответ на текущий шаг или вопрос…'
                        : 'Твой ответ или вопрос по этому примеру…'
                    }
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
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
                    <small>Ответы и вопросы — в одном поле</small>
                    <button
                      className="send-button"
                      aria-label="Отправить ответ по своей задаче"
                      disabled={busy || !message.trim()}
                    >
                      <ArrowRight size={20} />
                    </button>
                  </div>
                </form>
              </div>
            </aside>
          </div>
        </>
      )}
    </section>
  );
}
