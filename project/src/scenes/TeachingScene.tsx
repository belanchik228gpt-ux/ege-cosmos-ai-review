import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import { ArrowLeft, ArrowRight, Pause, Play, RotateCcw } from 'lucide-react';
import {
  isTeachingVisual,
  teachingStages,
  type TeachingVisual,
  type TeachingStage,
} from '../domain/teaching-visual';
import { buildTeachingScene, teachingFrame, teachingNumber as n } from './teaching-frames';
import { useSceneClock } from './useSceneClock';
import type { SceneQuality } from './types';
import './teaching-scene.css';

export type { TeachingVisual, TeachingStage } from '../domain/teaching-visual';
export type TeachingSceneProgress = {
  index: number;
  total: number;
  stage: TeachingStage;
  title: string;
  question: string;
  complete: boolean;
};
export type TeachingSceneProps = {
  visual: TeachingVisual;
  title?: string;
  narration?: string;
  question?: string;
  initialStage?: TeachingStage;
  quality?: SceneQuality;
  reducedMotion?: boolean;
  autoplay?: boolean;
  initialSpeed?: number;
  paused?: boolean;
  persistenceKey?: string;
  revealAnswer?: boolean;
  onStepChange?: (step: TeachingSceneProgress) => void;
};
type ArtProps = { visual: TeachingVisual; stage: TeachingStage; revealed: boolean };
const style = (values: Record<string, string | number>) => values as CSSProperties;

function ExpressionArt({ visual, stage, revealed }: ArtProps) {
  if (visual.kind !== 'expression') return null;
  const phase = teachingStages.indexOf(stage);
  const visible = revealed ? Math.min(visual.lines.length, phase === 3 ? 6 : phase + 1) : 1;
  return (
    <g className="ts-chain">
      {(revealed ? visual.lines : visual.lines.slice(0, 1)).map((line, i) => {
        const active = i === visible - 1,
          visibleLine = i < visible;
        const pieces = line.focus ? line.text.split(line.focus) : [line.text];
        const font = Math.min(42, Math.max(17, 570 / Math.max(line.text.length * 0.58, 1)));
        return (
          <g
            key={i}
            className="ts-chain-line"
            data-visible={visibleLine}
            data-active={active}
            style={style({ '--ts-delay': `${Math.max(0, i - phase) * 240}ms` })}
          >
            <rect x="48" y={24 + i * 54} width="604" height="46" rx="12" />
            <text x="350" y={55 + i * 54} textAnchor="middle" fontSize={font}>
              {pieces.map((part, j) => (
                <tspan key={j}>
                  {j > 0 && <tspan className={active ? 'ts-focus' : ''}>{line.focus}</tspan>}
                  {part}
                </tspan>
              ))}
            </text>
            {i > 0 && visibleLine && (
              <path className="ts-chain-arrow" d={`M31 ${i * 54 + 4}v40m-6-6 6 6 6-6`} />
            )}
          </g>
        );
      })}
      {!revealed && (
        <text className="ts-note" x="350" y="324" textAnchor="middle">
          Сначала объясни переход своими словами
        </text>
      )}
    </g>
  );
}

function NegativeArt({ visual, stage }: ArtProps) {
  if (visual.kind !== 'negative-radius' && visual.kind !== 'root-count') return null;
  const radius = visual.radius;
  const phase = teachingStages.indexOf(stage);
  return (
    <g>
      <text className="ts-label" x="350" y="66" textAnchor="middle">
        Шкала длины d — не координата x
      </text>
      <rect x="350" y="120" width="285" height="110" rx="14" className="ts-valid-region" />
      <g className="ts-reveal" data-visible={phase >= 1}>
        <rect x="65" y="120" width="280" height="110" rx="14" className="ts-invalid-region" />
        {[95, 135, 175, 215, 255, 295].map((x) => (
          <path key={x} className="ts-hatch" d={`M${x} 223l44-94`} />
        ))}
      </g>
      <path className="ts-axis" d="M65 230H645m-9-6 9 6-9 6" />
      <path className="ts-zero-wall" d="M350 108V242" />
      <text className="ts-tick" x="350" y="264" textAnchor="middle">
        0
      </text>
      <text className="ts-tick" x="495" y="264" textAnchor="middle">
        d ≥ 0
      </text>
      <g
        className="ts-traveller"
        data-move={phase === 1}
        style={style({
          '--ts-from': '620px',
          '--ts-to': '350px',
          transform: `translateX(${phase === 0 ? 620 : 350}px)`,
        })}
      >
        <circle cy="175" r="13" className="ts-point ts-cyan" />
        <path className="ts-distance-stem" d="M0 189v32" />
      </g>
      <g className="ts-reveal" data-visible={phase >= 2}>
        <circle cx="176" cy="175" r="22" className="ts-request-ring" />
        <text className="ts-label" x="176" y="182" textAnchor="middle">
          {n(radius)}
        </text>
        <text className="ts-note" x="175" y="296" textAnchor="middle">
          запрошенная длина
        </text>
        <text className="ts-note" x="495" y="296" textAnchor="middle">
          возможные расстояния
        </text>
      </g>
    </g>
  );
}

function AxisArt({ visual, stage, revealed }: ArtProps) {
  const frame = teachingFrame(visual, stage, 1, revealed),
    phase = teachingStages.indexOf(stage);
  const { pointAt: x, origin } = frame;
  const isRoots = frame.roots !== undefined,
    zero = isRoots && frame.roots!.length === 1;
  const distance = visual.kind === 'distance',
    subtraction = visual.kind === 'subtraction',
    sign = visual.kind === 'sign';
  const startOrigin = distance ? visual.value : origin;
  const range = frame.max - frame.min;
  const rough = range / 9;
  const power = 10 ** Math.floor(Math.log10(rough));
  const stride = [1, 2, 5, 10].map((a) => a * power).find((a) => a >= rough)!;
  const ticks = Array.from(
    { length: Math.min(18, Math.floor(range / stride) + 2) },
    (_, i) => (Math.ceil(frame.min / stride) + i) * stride,
  ).filter((t) => t <= frame.max);
  const distinctValues = [
    ...new Set([origin, ...(visual.kind === 'compare' ? [] : [...frame.starts, ...frame.targets])]),
  ];
  return (
    <g>
      <path className="ts-axis" d="M52 232H650m-9-6 9 6-9 6" />
      {ticks.map((tick, i) => (
        <g key={i}>
          <path className="ts-tick-line" d={`M${x(tick)} 226v12`} />
          <text className="ts-tick" x={x(tick)} y="266" textAnchor="middle">
            {n(tick)}
          </text>
        </g>
      ))}
      <path className="ts-origin-line" d={`M${x(origin)} 90V238`} />
      <text className="ts-note" x={x(origin)} y="80" textAnchor="middle">
        {isRoots ? 'центр' : distance ? 'точка отсчёта' : sign ? 'вычитаемое' : 'начало'}
      </text>
      <circle className="ts-origin" cx={x(origin)} cy="232" r="7" />
      {distance && visual.value !== origin && phase >= 1 && (
        <g>
          <circle className="ts-origin" cx={x(visual.value)} cy="232" r="6" />
          <text className="ts-note" x={x(visual.value)} y="290" textAnchor="middle">
            {n(visual.value)}
          </text>
        </g>
      )}
      {sign && (
        <>
          <rect
            className="ts-region"
            x={['lt', 'le'].includes(visual.relation) ? 55 : x(visual.boundary)}
            y="186"
            width={
              ['lt', 'le'].includes(visual.relation)
                ? x(visual.boundary) - 55
                : 645 - x(visual.boundary)
            }
            height="38"
            rx="8"
          />
          <circle
            className="ts-boundary"
            data-open={visual.relation === 'lt' || visual.relation === 'gt'}
            cx={x(visual.boundary)}
            cy="205"
            r="7"
          />
        </>
      )}
      {frame.targets.map((target, i) => {
        const start = frame.starts[i],
          on = phase >= 1 || distance || subtraction;
        const from = x(start),
          to = x(target),
          y = zero ? 232 : i === 0 ? 174 : 130;
        return (
          <g key={i} className="ts-reveal" data-visible={on}>
            {!zero && (
              <path
                className="ts-path"
                d={`M${x(startOrigin)} ${y}H${to}`}
                data-visible={phase >= 1}
                style={style({
                  strokeDasharray: Math.abs(to - x(startOrigin)),
                  strokeDashoffset: phase === 0 ? Math.abs(to - x(startOrigin)) : 0,
                })}
              />
            )}
            <g
              className="ts-traveller"
              data-move={phase === 1}
              style={style({
                '--ts-from': `${from}px`,
                '--ts-to': `${to}px`,
                transform: `translateX(${phase === 0 ? from : to}px)`,
              })}
            >
              <circle
                className={`ts-point ${i === 0 ? 'ts-cyan' : 'ts-gold'}`}
                cy={y}
                r={zero ? (i === 0 ? 17 : 10) : 12}
              />
              {!zero && <path className="ts-distance-stem" d={`M0 ${y + 15}V224`} />}
              <text className="ts-point-label" y={y - 23} textAnchor="middle">
                {sign
                  ? 'x'
                  : visual.kind === 'compare'
                    ? i === 0
                      ? typeof visual.left === 'number'
                        ? n(visual.left)
                        : `√${n(visual.left.radicand)}`
                      : n(visual.right)
                    : phase === 0 && distance
                      ? n(visual.value)
                      : revealed && phase >= 2 && !zero
                        ? n(target)
                        : ''}
              </text>
            </g>
          </g>
        );
      })}
      {zero && (
        <g className="ts-reveal" data-visible={phase >= 2}>
          <circle className="ts-merged-ring" cx={x(origin)} cy="232" r="28" />
          <text className="ts-note" x="350" y="306" textAnchor="middle">
            Сравни положения двух маркеров
          </text>
        </g>
      )}
      {!zero && (
        <text className="ts-note" x="350" y="314" textAnchor="middle">
          {sign
            ? 'Маркер x показывает сторону, а не заданную координату'
            : isRoots
              ? 'Слева и справа — одинаковая длина пути'
              : distance
                ? 'Расстояние — длина пути, а не направление'
                : subtraction
                  ? 'Следи за направлением движения и конечной точкой'
                  : 'Левее — меньше, правее — больше'}
        </text>
      )}
      {frame.distinctCount !== undefined && (
        <g className="ts-count">
          <rect x="214" y="338" width="272" height="45" rx="13" />
          <text className="ts-label" x="350" y="367" textAnchor="middle">
            Разных точек: {frame.distinctCount}
          </text>
        </g>
      )}
      {/* Coordinates remain numerical, even when an answer label is intentionally hidden. */}
      <desc>{`Точка отсчёта: ${n(origin)}. ${revealed ? `Показанные координаты: ${distinctValues.map(n).join('; ')}.` : ''}`}</desc>
    </g>
  );
}

function TeachingPlayer({
  visual,
  title,
  narration,
  question,
  initialStage = 'orient',
  quality = 'high',
  reducedMotion = false,
  autoplay = true,
  initialSpeed = 1,
  paused = false,
  persistenceKey,
  revealAnswer = false,
  onStepChange,
}: TeachingSceneProps) {
  const revealed = revealAnswer || visual.workedExample === true;
  const scene = useMemo(
    () => buildTeachingScene(visual, revealed, initialStage),
    [visual, revealed, initialStage],
  );
  const [systemReduced, setSystemReduced] = useState(
    () =>
      typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const motionOff = reducedMotion || systemReduced || quality === 'static';
  const clock = useSceneClock(
    scene,
    quality,
    motionOff,
    autoplay,
    [0.5, 1, 1.5, 2].includes(initialSpeed) ? initialSpeed : 1,
    persistenceKey,
    paused,
  );
  const current = scene.steps[clock.cursor.step],
    stage = current.visualAction as TeachingStage;
  const atEnd = clock.cursor.step === scene.steps.length - 1;
  const callback = useRef(onStepChange);
  callback.current = onStepChange;
  useEffect(() => {
    if (typeof matchMedia === 'undefined') return;
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setSystemReduced(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    callback.current?.({
      index: clock.cursor.step,
      total: scene.steps.length,
      stage,
      title: current.title,
      question: question || scene.question,
      complete: clock.cursor.complete,
    });
  }, [
    clock.cursor.step,
    clock.cursor.complete,
    stage,
    current.title,
    question,
    scene.question,
    scene.steps.length,
  ]);
  const next = () => (atEnd ? clock.finish() : clock.goTo(clock.cursor.step + 1));
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
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      next();
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      clock.goTo(clock.cursor.step - 1);
    }
    if (e.code === 'Space' && !e.repeat && !motionOff) {
      e.preventDefault();
      clock.togglePlay();
    }
  };
  const formulaVisible = clock.manualFrame || motionOff || clock.cursor.elapsedMs >= 2600;
  const negative =
    (visual.kind === 'negative-radius' || visual.kind === 'root-count') && visual.radius < 0;
  return (
    <section
      className={`teaching-scene ts-quality-${quality} ${motionOff || clock.manualFrame ? 'ts-static' : ''}`}
      data-visual={visual.kind}
      data-stage={stage}
      data-playing={clock.playing}
      aria-label="Сцена учебного шага"
      tabIndex={0}
      onKeyDown={keyboard}
    >
      <header>
        <div>
          <span className="ts-eyebrow">
            {visual.workedExample ? 'Пример для объяснения' : 'Разбираем этот шаг'}
          </span>
          <h3>{title || scene.title}</h3>
        </div>
        <span className="ts-counter">
          {clock.cursor.step + 1} / {scene.steps.length}
          <small>кадр объяснения</small>
        </span>
      </header>
      {visual.kind === 'expression' && visual.condition && (
        <p className="ts-condition">Условие: {visual.condition}</p>
      )}
      <div ref={clock.bodyRef} className="ts-body" key={clock.revision}>
        <svg viewBox="0 0 700 400" role="img" aria-label={`${current.title}. ${current.narration}`}>
          {visual.kind === 'expression' ? (
            <ExpressionArt visual={visual} stage={stage} revealed={revealed} />
          ) : negative ? (
            <NegativeArt visual={visual} stage={stage} revealed={revealed} />
          ) : (
            <AxisArt visual={visual} stage={stage} revealed={revealed} />
          )}
        </svg>
        <div className="ts-caption" aria-live="polite">
          <h4>{current.title}</h4>
          <p>{narration || current.narration}</p>
          {current.formula && (
            <div
              className="ts-formula"
              style={{ opacity: formulaVisible ? 1 : 0 }}
              aria-hidden={!formulaVisible}
            >
              {current.formula}
            </div>
          )}
          {stage === 'conclude' && <p className="ts-question">{question || scene.question}</p>}
        </div>
      </div>
      <footer>
        <button className="ts-play" onClick={clock.togglePlay} disabled={motionOff || paused}>
          {clock.playing ? <Pause size={17} /> : <Play size={17} />}{' '}
          {clock.playing ? 'Пауза' : 'Смотреть'}
        </button>
        <button aria-label="Повторить учебный шаг" onClick={clock.replay} disabled={paused}>
          <RotateCcw size={17} />
        </button>
        <button
          aria-label="Предыдущий кадр объяснения"
          onClick={() => clock.goTo(clock.cursor.step - 1)}
          disabled={paused || clock.cursor.step === 0}
        >
          <ArrowLeft size={17} />
        </button>
        <button
          aria-label={atEnd ? 'Завершить показ шага' : 'Следующий кадр объяснения'}
          onClick={next}
          disabled={paused}
        >
          <ArrowRight size={17} />
        </button>
        <label>
          Темп
          <select
            aria-label="Скорость учебного шага"
            disabled={paused || motionOff}
            value={clock.speed}
            onChange={(e) => clock.setSpeed(Number(e.target.value))}
          >
            {[0.5, 1, 1.5, 2].map((speed) => (
              <option key={speed} value={speed}>
                {String(speed).replace('.', ',')}×
              </option>
            ))}
          </select>
        </label>
      </footer>
      {motionOff && <p className="ts-mode">Без движения: переключай смысловые кадры кнопками.</p>}
    </section>
  );
}

export function TeachingScene(props: TeachingSceneProps) {
  if (!isTeachingVisual(props.visual))
    return (
      <section className="teaching-scene">
        <h3>Уточним данные для рисунка</h3>
        <p>Учебный вопрос остаётся доступен. Для этой записи пока нет проверенной схемы.</p>
      </section>
    );
  return (
    <TeachingPlayer
      key={`${JSON.stringify(props.visual)}:${props.initialStage ?? 'orient'}:${props.revealAnswer === true}`}
      {...props}
    />
  );
}
