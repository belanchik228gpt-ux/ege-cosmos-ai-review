import { LessonHeading } from './LessonHeading';
import { CivicsTermDeck } from './CivicsTermDeck';
import { LearningPlan } from './LearningPlan';
import { currentLearningPosition, learningSheets } from '../domain/learning-position';
import { homeworkUnit } from '../domain/homework-desk';
import { AnswerReview } from './AnswerReview';
import { cleanAnswerReview } from '../domain/answer-review';
import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import {
  ArrowLeft,
  Check,
  CircleHelp,
  BookOpen,
  FileText,
  ImagePlus,
  LoaderCircle,
  Pencil,
  Send,
  Square,
  X,
} from 'lucide-react';
import type { LearningState } from '../domain';
import {
  cleanDrawing,
  cleanLearningStep,
  cloudPhaseNames,
  prepareCloudMessages,
  type CloudMessage,
} from '../domain/cloud-learning';
import { getProgramSource, getSchoolSubject, getSchoolUnit } from '../domain/school-program';
import {
  finishSchoolLesson,
  localSchoolDrawing,
  schoolDocumentFromLesson,
  schoolLessonInstructions,
  type SchoolLesson,
  type SchoolState,
} from '../domain/school-state';
import { DialogueScene } from '../scenes/DialogueScene';
import { MathSheet } from './MathSheet';
import { SHEET_TUTOR_GUIDANCE } from '../domain/math-sheet';
import { TutorMarkdown } from './TutorMarkdown';
import type { OpenAIController } from './useOpenAI';
import { schoolLocalMaterial } from '../domain/school-local-material';

export type UpdateSchool = (fn: (s: SchoolState) => SchoolState) => void;
export function SchoolRoom({
  school,
  lesson,
  settings,
  name,
  update,
  ai,
  onConnect,
  onBack,
  onDocument,
  notify,
}: {
  school: SchoolState;
  lesson: SchoolLesson;
  settings: LearningState['settings'];
  name: string;
  update: UpdateSchool;
  ai: OpenAIController;
  onConnect: () => void;
  onBack: () => void;
  onDocument: () => void;
  notify: (s: string) => void;
}) {
  const unit = useMemo(
      () => homeworkUnit(lesson) || getSchoolUnit(lesson.unitId)!,
      [lesson.unitId, lesson.assignment],
    ),
    subject = getSchoolSubject(lesson.subject),
    source = getProgramSource(unit.sourceId);
  const localDrawing = useMemo(() => localSchoolDrawing(unit, lesson.focus), [unit, lesson.focus]);
  const material = useMemo(
    () => schoolLocalMaterial(unit, lesson.focus, localDrawing),
    [unit, lesson.focus, localDrawing],
  );
  const [text, setText] = useState(''),
    [busy, setBusy] = useState(false),
    [stream, setStream] = useState(''),
    [error, setError] = useState('');
  const [photo, setPhoto] = useState<{ dataUrl: string; name: string }>(),
    [sheet, setSheet] = useState(false),
    [answer, setAnswer] = useState(false);
  const [originalPhoto, setOriginalPhoto] = useState<{ dataUrl: string; name: string }>();
  const [sheetTask, setSheetTask] = useState('current');
  const position = currentLearningPosition(lesson.messages);
  const sheets = learningSheets(lesson.id, lesson.messages);
  const selectedSheet =
    sheetTask === 'current' ? sheets.at(-1) : sheets.find((s) => s.id === sheetTask);
  const currentQuestion = lesson.messages
    .filter((m) => m.role === 'assistant' && m.question && m.verification?.status !== 'conflict')
    .at(-1);
  const [loadingOriginal, setLoadingOriginal] = useState(!!lesson.assignment?.imageId);
  useEffect(() => {
    let live = true;
    setOriginalPhoto(undefined);
    const id = lesson.assignment?.imageId;
    if (!id) {
      setLoadingOriginal(false);
      return;
    }
    setLoadingOriginal(true);
    void window.cosmos
      ?.readHomeworkImage(id)
      .then((result) => {
        if (!live) return;
        if (result.ok && result.dataUrl)
          setOriginalPhoto({ dataUrl: result.dataUrl, name: result.name || 'Условие.jpg' });
        else setError('Не удалось открыть сохранённое фото. Прикрепи условие снова.');
      })
      .catch(() => {
        if (live) setError('Фото сейчас недоступно. Прикрепи условие снова.');
      })
      .finally(() => {
        if (live) setLoadingOriginal(false);
      });
    return () => {
      live = false;
    };
  }, [lesson.assignment?.imageId]);
  const file = useRef<HTMLInputElement>(null),
    surface = useRef<HTMLDivElement>(null),
    end = useRef<HTMLDivElement>(null),
    alive = useRef(true),
    epoch = useRef(0),
    busyRef = useRef(false),
    autoScroll = useRef(false);
  const current = useRef({ school, lesson });
  current.current = { school, lesson };
  useEffect(() => {
    const fit = () => {
      const element = surface.current;
      if (!element) return;
      const top = Math.max(80, element.getBoundingClientRect().top);
      element.style.height = `${Math.max(340, window.innerHeight - top - 16)}px`;
    };
    const frame = requestAnimationFrame(fit);
    window.addEventListener('resize', fit);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', fit);
    };
  }, [lesson.title, !!position]);
  const pending = useRef<
    | {
        requestId: string;
        messages: CloudMessage[];
        image?: { dataUrl: string; name: string };
        finish: boolean;
      }
    | undefined
  >(undefined);
  const lastPhoto = useRef<{ dataUrl: string; name: string } | undefined>(undefined);
  const sheetSourcePhoto = useRef<{ dataUrl: string; name: string } | undefined>(undefined);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      epoch.current++;
      if (busyRef.current) void window.cosmos?.cancelOpenAITutor();
    };
  }, []);
  useEffect(
    () =>
      window.cosmos?.onOpenAITutorProgress?.((p) => {
        if (
          alive.current &&
          busyRef.current &&
          pending.current?.requestId === p.requestId &&
          p.conversationId === lesson.id
        )
          setStream(p.text.slice(0, 16000));
      }),
    [lesson.id],
  );
  useEffect(() => {
    const conversation = end.current?.parentElement;
    if (autoScroll.current && conversation) {
      const last = lesson.messages.at(-1);
      const reply = last?.role === 'assistant' && !stream
        ? conversation.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(last.id)}"]`)
        : null;
      conversation.scrollTo({
        top: reply ? conversation.scrollTop + reply.getBoundingClientRect().top - conversation.getBoundingClientRect().top - 12 : conversation.scrollHeight,
        behavior: settings.reducedMotion ? 'instant' : 'smooth',
      });
    }
  }, [lesson.messages.length, stream]);
  const patch = (fn: (l: SchoolLesson) => SchoolLesson) =>
    update((s) => ({ ...s, lessons: { ...s.lessons, [lesson.id]: fn(s.lessons[lesson.id]) } }));
  async function send(
    value = text,
    finish = false,
    retry = false,
    image?: { dataUrl: string; name: string },
  ) {
    if (busyRef.current || (!value.trim() && !photo && !image && !retry)) return;
    if (!window.cosmos?.generateOpenAITutor || ai.status.authenticated !== true) {
      onConnect();
      return;
    }
    const old = retry ? pending.current : undefined,
      attachment =
        image ||
        photo ||
        old?.image ||
        lastPhoto.current ||
        (!lesson.messages.some(
          (m) => m.role === 'assistant' && m.verification?.status !== 'conflict',
        )
          ? originalPhoto
          : undefined);
    if (loadingOriginal) return;
    if (lesson.assignment?.imageId && !attachment && !lesson.messages.length) {
      setError('Для начала разбора нужно восстановить фото: прикрепи его ещё раз.');
      return;
    }
    const lastImage = current.current.lesson.messages.reduce(
      (last, m, i) => (m.imageName ? i : last),
      -1,
    );
    const lastReply = current.current.lesson.messages.reduce(
      (last, m, i) => (m.role === 'assistant' ? i : last),
      -1,
    );
    if (
      lastImage > lastReply &&
      current.current.lesson.messages[lastImage]?.imageName === 'Моё рукописное решение.png' &&
      !image &&
      !photo &&
      !old?.image &&
      !lastPhoto.current
    ) {
      setError(
        'Проверка листа не успела завершиться. Черновик сохранён: нажми «Проверить решение» на листе ещё раз.',
      );
      return;
    }
    if (!attachment && lastImage > lastReply) {
      setError(
        'После возвращения к занятию нужно прикрепить исходное фото ещё раз. Условие пока не было прочитано Cosmos.',
      );
      file.current?.click();
      return;
    }
    const now = new Date().toISOString(),
      user: CloudMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        kind: 'student',
        text:
          value.trim() ||
          'Разберём задание на фото. Сначала перепиши условие и уточни неразборчивое.',
        at: now,
        ...(attachment ? { imageName: attachment.name } : {}),
      };
    const messages = old?.messages || [...current.current.lesson.messages, user],
      finishRequest = old?.finish ?? finish;
    const requestId = crypto.randomUUID(),
      token = ++epoch.current;
    pending.current = { requestId, messages, image: attachment, finish: finishRequest };
    if (attachment) lastPhoto.current = attachment;
    if (!old) patch((l) => ({ ...l, messages: [...l.messages, user], updatedAt: now }));
    busyRef.current = true;
    setBusy(true);
    setError('');
    setText('');
    setPhoto(undefined);
    setStream('');
    autoScroll.current = true;
    let timer: ReturnType<typeof setTimeout> | undefined,
      sourceTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      const sources = unit.sourceId
        ? await Promise.race([
            window.cosmos
              .readSchoolSource({
                id: unit.sourceId,
                page: unit.pages[0],
                query: [lesson.focus, text.trim(), unit.title]
                  .filter(Boolean)
                  .join(' ')
                  .slice(0, 300),
                maxChars: 4500,
              })
              .catch(() => undefined),
            new Promise<undefined>((resolve) => {
              sourceTimer = setTimeout(() => resolve(undefined), 5000);
            }),
          ])
        : undefined;
      clearTimeout(sourceTimer);
      if (token !== epoch.current || !alive.current) return;
      const fragments = sources?.ok
        ? sources.fragments?.map((f) => `Страница PDF ${f.page}:\n${f.text}`).join('\n') || ''
        : '';
      const response = await Promise.race([
        window.cosmos.generateOpenAITutor({
          mode: 'school',
          grade: lesson.grade,
          subject: lesson.subject,
          conversationId: lesson.id,
          requestId,
          model: ai.status.selectedModel,
          instructions:
            schoolLessonInstructions(
              name,
              current.current.school,
              current.current.lesson,
              fragments,
            ) + (attachment ? '\n' + SHEET_TUTOR_GUIDANCE : ''),
          messages: prepareCloudMessages(messages),
          image: attachment,
        }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            void window.cosmos?.cancelOpenAITutor();
            reject(new Error('timeout'));
          }, 150000);
        }),
      ]);
      if (token !== epoch.current || !alive.current) return;
      if (!response.ok || !response.text?.trim()) throw new Error('unavailable');
      const reply: CloudMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        kind: 'openai',
        verification: cleanAnswerReview(response.verification),
        learningStep:
          response.verification?.status === 'conflict'
            ? undefined
            : cleanLearningStep(response.learningStep),
        text: response.text,
        question: response.question,
        drawing: cleanDrawing(response.scene),
        phase: response.phase,
        at: new Date().toISOString(),
      };
      update((s) => {
        const l = s.lessons[lesson.id];
        let next = {
          ...s,
          lessons: {
            ...s.lessons,
            [lesson.id]: {
              ...l,
              messages: [...l.messages, reply],
              updatedAt: reply.at,
              phase: response.phase || l.phase,
            },
          },
        };
        return finishRequest && reply.verification?.status !== 'conflict'
          ? finishSchoolLesson(next, lesson.id, response.summary || response.text!, reply.at)
          : next;
      });
      pending.current = undefined;
      lastPhoto.current = undefined;
      setStream('');
    } catch {
      if (token === epoch.current && alive.current) {
        setStream('');
        setError(
          lesson.assignment
            ? 'Ответ не пришёл. Реплика и черновик сохранены. Можно повторить запрос или вернуться позже.'
            : 'Ответ не пришёл. Реплика сохранена: повтори запрос или продолжи с учебной карточкой ниже.',
        );
      }
    } finally {
      clearTimeout(timer);
      clearTimeout(sourceTimer);
      if (token === epoch.current) {
        busyRef.current = false;
        if (alive.current) setBusy(false);
      }
      void ai.refresh();
    }
  }
  async function cancel() {
    epoch.current++;
    setStream('');
    setError('Ответ остановлен. Можно повторить ту же реплику.');
    try {
      await window.cosmos?.cancelOpenAITutor();
    } finally {
      busyRef.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function attach(selected?: File) {
    if (!selected) return;
    if (!/^image\/(png|jpeg)$/.test(selected.type) || selected.size > 10 * 1024 * 1024) {
      notify('Выбери PNG или JPEG размером до 10 МБ.');
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      if (alive.current) {
        const image = { dataUrl: String(reader.result), name: selected.name };
        if (lesson.assignment?.imageId && !originalPhoto) {
          const result = await window.cosmos?.saveHomeworkImage(image).catch(() => undefined);
          if (!alive.current) return;
          if (!result?.ok || !result.id) {
            notify('Не удалось восстановить фото на компьютере. Попробуй снова.');
            return;
          }
          patch((l) => ({
            ...l,
            assignment: { ...l.assignment!, imageId: result.id, imageName: image.name },
          }));
          setOriginalPhoto(image);
          setError('');
        }
        setPhoto(image);
        if (!lesson.assignment) sheetSourcePhoto.current = image;
      }
    };
    reader.onerror = () => notify('Не удалось прочитать изображение.');
    reader.readAsDataURL(selected);
  }
  function draftDocument() {
    const doc = schoolDocumentFromLesson(current.current.lesson);
    update((s) => ({ ...s, documents: [...s.documents, doc], view: 'documents' }));
    onDocument();
    notify('Открыт черновик конспекта. Проверь текст и сохрани файл в нужном формате.');
  }
  const latestDrawing = lesson.messages.filter((m) => m.drawing).at(-1)?.id;
  return (
    <section
      className="school-room"
      style={{ '--school-color': subject.color } as React.CSSProperties}
    >
      <div className="school-room-top">
        <button className="button" onClick={onBack}>
          <ArrowLeft size={17} />
          {lesson.assignment ? 'К домашним заданиям' : 'К темам'}
        </button>
        <span>
          {subject.title} · {lesson.grade} класс ·{' '}
          {lesson.mode === 'homework'
            ? 'Домашняя работа'
            : lesson.mode === 'diagnostic'
              ? 'Диагностика'
              : 'Школьное занятие'}
        </span>
        <button className="button" disabled={busy} onClick={draftDocument}>
          <FileText size={17} />
          Конспект
        </button>
      </div>
      <LessonHeading title={lesson.title} />
      {lesson.assignment && (
        <details className="homework-original school-panel">
          <summary>Исходное условие · всегда под рукой</summary>
          {lesson.assignment.text && <TutorMarkdown text={lesson.assignment.text} />}
          {loadingOriginal && <p role="status">Открываю фото условия…</p>}
          {originalPhoto && (
            <img src={originalPhoto.dataUrl} alt="Исходное фото домашнего задания" />
          )}
        </details>
      )}
      {!position && (
        <div className="school-stages" aria-label="Этап занятия">
          {Object.entries(cloudPhaseNames).map(([key, label], index) => (
            <span key={key} className={lesson.phase === key ? 'current' : index < Object.keys(cloudPhaseNames).indexOf(lesson.phase) ? 'past' : ''}>
              <i>{index < Object.keys(cloudPhaseNames).indexOf(lesson.phase) ? <Check size={14} /> : index + 1}</i>
              {label}
            </span>
          ))}
        </div>
      )}
      <div className="school-dialogue-surface" ref={surface}>
        {position && <LearningPlan step={position.step} />}
        <div
          className="school-conversation"
          onWheel={(e) => {
            if (e.deltaY < 0) autoScroll.current = false;
          }}
        >
          {!lesson.messages.length && !lesson.completedAt && (
            <div className="school-lesson-welcome">
              <span className="school-eyebrow">ПОНЯТЬ, ПОПРОБОВАТЬ, ОБСУДИТЬ</span>
              <h2>
                {lesson.assignment
                  ? 'Разберём твоё задание шаг за шагом'
                  : 'Начнём с того, что тебе уже знакомо'}
              </h2>
              <TutorMarkdown text={material.intro} />
              <div className="school-actions">
                <button
                  className="button primary"
                  disabled={loadingOriginal}
                  onClick={() =>
                    void send(
                      lesson.assignment
                        ? 'Объясни тему с нуля без готового решения моей задачи. Сначала составь понятный план, объясни первый пункт на другом простом примере, затем дай мне небольшой шаг для самостоятельной попытки. Если условие неразборчиво — сначала уточни его.'
                        : lesson.mode === 'homework'
                          ? 'Помоги с домашней работой по этой теме. Сначала уточни условие, я пришлю текст или фото.'
                          : lesson.mode === 'diagnostic'
                            ? 'Проведи короткую диагностику по теме: три вопроса по одному, без готовых ответов. В конце объясни, что повторить.'
                            : 'Начнём занятие. Объясняй просто и небольшими шагами. Сначала спроси, что мне уже знакомо, затем предложи один пример без готового ответа.',
                    )
                  }
                >
                  <Send size={17} />
                  {lesson.assignment ? 'Начать разбор' : 'Начать диалог'}
                </button>
                {!lesson.assignment && (
                  <a
                    className="button"
                    href="#school-local-material"
                    onClick={() => {
                      const panel = document.getElementById('school-local-material');
                      if (panel instanceof HTMLDetailsElement) {
                        const parent = panel.closest('.school-materials-menu');
                        if (parent instanceof HTMLDetailsElement) parent.open = true;
                        panel.open = true;
                      }
                    }}
                  >
                    <BookOpen size={17} />
                    Учебная карточка
                  </a>
                )}
              </div>
            </div>
          )}
          {lesson.messages.map((m) => (
            <article key={m.id} data-message-id={m.id} className={`school-message ${m.role}`}>
              <small>
                {m.role === 'user'
                  ? name
                  : m.kind === 'openai'
                    ? 'Cosmos · OpenAI'
                    : 'Учебная карточка'}
              </small>
              <TutorMarkdown text={m.text} />
              <AnswerReview review={m.verification} />
              {m.imageName && (
                <span className="school-attachment">
                  <ImagePlus size={14} />
                  {m.imageName}
                </span>
              )}
              {m.drawing && (
                <DialogueScene
                  drawing={m.drawing}
                  id={m.id}
                  subject={lesson.subject}
                  settings={settings}
                  active={!busy}
                  autoplay={m.id === latestDrawing}
                />
              )}{' '}
              {m.question && !m.text.includes(m.question) && (
                <div className="school-question">
                  <TutorMarkdown text={m.question} />
                </div>
              )}
            </article>
          ))}
          {busy && (
            <div className="school-message assistant" role="status">
              <small>Cosmos · OpenAI</small>
              {stream ? (
                <TutorMarkdown text={stream} />
              ) : (
                <p>
                  <LoaderCircle className="spin" size={16} /> Готовлю следующий шаг…
                </p>
              )}
            </div>
          )}
          <div ref={end} />
        </div>
        <div className="school-composer">
          {error && (
            <p className="school-feedback" role="status">
              {error}
              <button
                className="text-button"
                disabled={busy}
                onClick={() => void send('', false, true)}
              >
                Повторить
              </button>
            </p>
          )}
          {photo && (
            <div className="school-photo">
              <img src={photo.dataUrl} alt="Прикреплённое условие" />
              <span>{photo.name}</span>
              <button aria-label="Убрать фото" onClick={() => setPhoto(undefined)}>
                <X size={17} />
              </button>
            </div>
          )}
          <details className="school-help-menu">
            <summary aria-label="Подсказки" title="Подсказки"><CircleHelp size={20} /></summary>
            <div className="school-actions school-help">
              {[
                'Объясни этот шаг на простом примере',
                'Почему делаем именно так?',
                'Где мы в плане?',
              ].map((label) => (
                <button key={label} disabled={busy} onClick={() => void send(label)}>
                  {label}
                </button>
              ))}
            </div>
          </details>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <textarea
              aria-label="Сообщение школьному преподавателю"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Ответ, вопрос, условие задачи или «не понимаю»…"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            <div className="school-composer-tools">
              <div className="school-actions">
                <input
                  ref={file}
                  type="file"
                  hidden
                  accept="image/png,image/jpeg"
                  onChange={(e) => {
                    void attach(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  className="button"
                  disabled={busy}
                  onClick={() => file.current?.click()}
                >
                  <ImagePlus size={17} />
                  Фото
                </button>
                {lesson.subject === 'math' && (
                  <button
                    type="button"
                    className="button"
                    disabled={busy}
                    onClick={() => {
                      setSheetTask('current');
                      setSheet(true);
                    }}
                  >
                    <Pencil size={17} />
                    Лист для решения
                  </button>
                )}
                {lesson.assignment && lesson.subject === 'math' && (
                  <button
                    type="button"
                    className="button"
                    disabled={busy}
                    onClick={() => {
                      setSheetTask('original');
                      setSheet(true);
                    }}
                  >
                    Лист исходного задания
                  </button>
                )}
                {lesson.subject === 'math' && sheets.length > 1 && (
                  <select
                    aria-label="Листы прошлых шагов"
                    value=""
                    disabled={busy}
                    onChange={(e) => {
                      if (e.target.value) {
                        setSheetTask(e.target.value);
                        setSheet(true);
                      }
                    }}
                  >
                    <option value="">Листы прошлых шагов</option>
                    {sheets.map((s, i) => (
                      <option key={s.id} value={s.id}>
                        {i + 1}. {s.title}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              {busy ? (
                <button type="button" className="button" onClick={() => void cancel()}>
                  <Square size={16} />
                  Остановить
                </button>
              ) : (
                <button type="submit" className="button primary" disabled={!text.trim() && !photo}>
                  <Send size={17} />
                  Отправить
                </button>
              )}
            </div>
          </form>
          <small className="school-muted">
            Enter — отправить, Shift+Enter — новая строка
          </small>
        </div>
      </div>
      <details className="school-materials-menu">
        <summary>Материалы и итог занятия</summary>
        {lesson.completedAt ? (
          <div className="school-panel">
            <span className="school-eyebrow">ИТОГ СОХРАНЁН</span>
            <h2>Занятие разобрано</h2>
            <TutorMarkdown text={lesson.summary || 'Занятие завершено.'} />
            <p className="school-muted">
              Повтори тему через три дня. Успешное самостоятельное решение проверим отдельно.
            </p>
            <button className="button primary" onClick={draftDocument}>
              Подготовить конспект
            </button>
          </div>
        ) : (
          <div className="school-actions school-finish">
            <button
              className="button"
              disabled={busy}
              onClick={() =>
                void send(
                  'Завершим на сегодня. Коротко перечисли, что действительно разобрали, мои ошибки и разборы, вопросы без ответа, что повторить и с чего продолжим. Не засчитывай ответы с подсказками как самостоятельные.',
                  true,
                )
              }
            >
              Завершить с отчётом Cosmos
            </button>
            <button
              className="text-button"
              disabled={busy}
              onClick={() => {
                update((s) =>
                  finishSchoolLesson(
                    s,
                    lesson.id,
                    `Ученик завершил занятие. Обсуждалась тема «${lesson.title}». Сохранено реплик: ${lesson.messages.length}. Проверка освоения не проводилась.`,
                    new Date().toISOString(),
                    'student',
                  ),
                );
              }}
            >
              Завершить без подключения
            </button>
          </div>
        )}
        {!lesson.assignment && lesson.subject === 'social' && (
          <CivicsTermDeck key={lesson.id} focus={lesson.focus || unit.title} />
        )}
        {!lesson.assignment && (
          <details className="school-panel" id="school-local-material">
            <summary>
              <BookOpen size={18} />
              Учебная карточка и проверка себя <small>доступно без интернета</small>
            </summary>
            <DialogueScene
              id={`school-local-${lesson.id}`}
              drawing={localDrawing}
              subject={lesson.subject}
              settings={settings}
              autoplay
            />
            <div className="school-local-columns">
              <div>
                <h3>Ключевая идея</h3>
                <TutorMarkdown text={material.keyIdea} />
                <h3>Пример с объяснением</h3>
                <TutorMarkdown text={material.example} />
              </div>
              <div>
                <h3>Попробуй самостоятельно</h3>
                <TutorMarkdown text={material.question} />
                {material.answer && (
                  <button className="button" onClick={() => setAnswer(!answer)}>
                    {answer ? 'Скрыть разбор' : 'Показать разбор для самопроверки'}
                  </button>
                )}
                {answer && material.answer && <TutorMarkdown text={material.answer} />}
                <p className="school-muted">
                  Эта карточка помогает начать тему. Для свободного ответа и подробной проверки
                  используй диалог.
                </p>
              </div>
            </div>
          </details>
        )}
        <details className="school-panel">
          <summary>
            {lesson.assignment
              ? 'Мои заметки к домашней работе'
              : 'Мой черновик и источник программы'}
          </summary>
          <label>
            Заметка к этому занятию
            <textarea
              value={lesson.note}
              maxLength={5000}
              onChange={(e) => {
                const note = e.target.value;
                patch((l) => ({ ...l, note }));
              }}
              placeholder="Что проходили в школе, что пока непонятно…"
            />
          </label>
          {source && (
            <p>
              <a href={source.url} target="_blank" rel="noreferrer">
                {source.title}
              </a>{' '}
              · {source.edition} · PDF: {unit.pages.join(', ')}
              <br />
              Проверено {source.checkedAt}. Объяснение и примеры — авторский материал Cosmos.
            </p>
          )}
        </details>
      </details>
      {sheet && (
        <MathSheet
          key={sheetTask === 'original' ? 'original' : selectedSheet?.id || currentQuestion?.id}
          lessonId={
            sheetTask === 'original'
              ? lesson.id
              : selectedSheet?.id ||
                (currentQuestion ? `${lesson.id}:question:${currentQuestion.id}` : lesson.id)
          }
          title={
            sheetTask === 'original'
              ? lesson.title
              : selectedSheet?.title || currentQuestion?.question || lesson.title
          }
          assignment={{
            text:
              (sheetTask === 'original'
                ? lesson.assignment?.text
                : selectedSheet?.text || currentQuestion?.question) ||
              lesson.assignment?.text ||
              lesson.title,
            image:
              sheetTask === 'original' || (!selectedSheet && !currentQuestion)
                ? originalPhoto || sheetSourcePhoto.current
                : undefined,
          }}
          onClose={() => setSheet(false)}
          onCheck={(image, context) => {
            setSheet(false);
            void send(context, false, false, image);
          }}
        />
      )}
    </section>
  );
}
