import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Pause,
  Play,
  RotateCcw,
  BookOpen,
  Users,
  ScrollText,
  CalendarDays,
  MapPin,
  ShoppingBag,
  Store,
  TrendingUp,
  Shapes,
  Braces,
  MessageCircle,
} from 'lucide-react';
import type { Task, SubjectId, Quality } from '../domain/types';
import { taskBoardContent, type BoardFact } from '../scenes/task-board-content';
import { useSceneClock } from '../scenes/useSceneClock';
import type { LessonScene } from '../scenes/types';
import './task-board-scene.css';
type Props = {
  task: Task;
  subject: SubjectId;
  autoplay: boolean;
  reducedMotion: boolean;
  quality: Quality;
  paused?: boolean;
  explanation?: string;
  onStepChange?: (step: number) => void;
};
const icons = {
  text: BookOpen,
  person: Users,
  event: ScrollText,
  date: CalendarDays,
  place: MapPin,
  buyer: ShoppingBag,
  seller: Store,
  change: TrendingUp,
  quantity: Shapes,
  expression: Braces,
};
function Fact({ fact, stage, index }: { fact: BoardFact; stage: number; index: number }) {
  const Icon = icons[fact.icon],
    chunks = fact.text.split(/([-−]?\d+(?:[.,]\d+)?(?:\s*%)?)/g);
  return (
    <article
      className={`sb-fact sb-fact-${fact.icon}`}
      data-highlight={stage >= 1}
      style={{ '--sb-order': index } as React.CSSProperties}
    >
      <div className="sb-fact-icon">
        <Icon size={36} strokeWidth={1.4} />
      </div>
      <span className="sb-label">{fact.label}</span>
      <p>
        {chunks.map((chunk, i) =>
          i % 2 ? <mark key={i}>{chunk}</mark> : <span key={i}>{chunk}</span>,
        )}
      </p>
    </article>
  );
}
function BoardPlayer({
  task,
  subject,
  autoplay,
  reducedMotion,
  quality,
  paused,
  explanation,
  onStepChange,
}: Props) {
  const model = useMemo(() => taskBoardContent(subject, task.prompt), [subject, task.prompt]);
  const scene = useMemo<LessonScene>(
    () => ({
      id: `task-parts:${task.id}:${task.prompt}`,
      subject,
      topic: task.id,
      title: 'Доска текущего задания',
      eyebrow: 'Твоё условие',
      autoplay,
      replayable: true,
      durationMs: 12600,
      reducedMotionFrame: { step: 0, description: 'Исходные данные' },
      question: model.question,
      steps: ['Прочитай условие', 'Сопоставь части', 'Сформулируй ответ'].map((title, i) => ({
        id: String(i),
        title,
        narration: model.guidance[i],
        durationMs: 4200,
        visualAction: String(i),
        highlights: [],
      })),
    }),
    [task.id, task.prompt, subject, autoplay, model],
  );
  const [systemReduced, setSystemReduced] = useState(
      () =>
        typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches,
    ),
    motionOff = reducedMotion || systemReduced || quality === 'static';
  const clock = useSceneClock(scene, quality, motionOff, autoplay, 1, undefined, paused),
    step = clock.cursor.step,
    current = scene.steps[step],
    callback = useRef(onStepChange);
  callback.current = onStepChange;
  useEffect(() => {
    callback.current?.(step);
  }, [step]);
  useEffect(() => {
    if (typeof matchMedia === 'undefined') return;
    const media = matchMedia('(prefers-reduced-motion: reduce)'),
      change = () => setSystemReduced(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  const keyboard = (e: KeyboardEvent<HTMLElement>) => {
    if (
      paused ||
      (e.target as Element).closest(
        'input,textarea,button,select,a,summary,[contenteditable=true]',
      ) ||
      e.ctrlKey ||
      e.metaKey ||
      e.altKey
    )
      return;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      clock.goTo(step - 1);
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      step === 2 ? clock.finish() : clock.goTo(step + 1);
    }
    if (e.code === 'Space' && !e.repeat && !motionOff) {
      e.preventDefault();
      clock.togglePlay();
    }
  };
  return (
    <section
      className={`active-task-board semantic-task-board board-${subject} sb-quality-${quality} ${motionOff || clock.manualFrame ? 'sb-still' : ''}`}
      aria-label="Доска текущего задания"
      tabIndex={0}
      onKeyDown={keyboard}
      data-stage={step}
      data-playing={clock.playing}
    >
      <div className="card-top">
        <span className="eyebrow">{current.title}</span>
        <span className="mini-tag">{step + 1} / 3 · кадр условия</span>
      </div>
      <div className="sb-body" ref={clock.bodyRef} key={clock.revision}>
        {model.kind === 'sentence' ? (
          <div className="sb-sentence-art">
            <span className="sb-source-label">Слова из твоего предложения</span>
            <div className="sb-sentence">
              {model.tokens.map((token, i) => (
                <span
                  key={i}
                  className="sb-word"
                  data-part={token.part % 2}
                  data-focus={step >= 1 && token.focus}
                  data-highlight={step >= 1}
                  style={{ '--sb-order': i } as React.CSSProperties}
                >
                  {token.text}
                </span>
              ))}
            </div>
            {model.facts.map((fact, i) => (
              <div className="sb-seeking" key={i}>
                <BookOpen size={18} />
                <span>
                  {fact.label}: <b>{fact.text}</b>
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className={`sb-facts sb-facts-${model.facts.length}`}>
            {model.facts.map((fact, i) => (
              <Fact key={`${fact.label}:${fact.text}`} fact={fact} stage={step} index={i} />
            ))}
          </div>
        )}
        <div className="sb-question" data-focus={step === 2}>
          <MessageCircle size={24} />
          <div>
            <span className="sb-label">Твой вопрос</span>
            <h2>{model.question}</h2>
          </div>
        </div>
        <p className="board-guidance sb-guidance">
          {step === 1 && explanation ? explanation : current.narration}
        </p>
      </div>
      <div className="task-board-controls">
        <button
          className="button secondary"
          disabled={!!paused || motionOff}
          onClick={clock.togglePlay}
        >
          {clock.playing ? <Pause size={16} /> : <Play size={16} />}{' '}
          {clock.playing ? 'Пауза' : 'Смотреть'}
        </button>
        <button
          className="icon-button"
          aria-label="Повторить доску"
          disabled={paused}
          onClick={clock.replay}
        >
          <RotateCcw size={17} />
        </button>
        <select
          aria-label="Скорость доски"
          value={clock.speed}
          disabled={paused || motionOff}
          onChange={(e) => clock.setSpeed(Number(e.target.value))}
        >
          {[0.5, 1, 1.5, 2].map((speed) => (
            <option key={speed} value={speed}>
              {String(speed).replace('.', ',')}×
            </option>
          ))}
        </select>
        <span />
        {motionOff && <small>Без движения</small>}
        <button
          className="icon-button"
          aria-label="Предыдущий шаг доски"
          disabled={step === 0 || paused}
          onClick={() => clock.goTo(step - 1)}
        >
          <ArrowLeft size={17} />
        </button>
        <button
          className="button secondary"
          aria-label={step === 2 ? 'Завершить показ условия' : 'Следующий шаг доски'}
          disabled={paused}
          onClick={() => (step === 2 ? clock.finish() : clock.goTo(step + 1))}
        >
          Далее <ArrowRight size={17} />
        </button>
      </div>
    </section>
  );
}
export function TaskBoard(props: Props) {
  return <BoardPlayer key={`${props.subject}:${props.task.id}:${props.task.prompt}`} {...props} />;
}
