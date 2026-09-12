import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { ArrowLeft, ArrowRight, Check, Pause, Play, RotateCcw } from 'lucide-react';
import {
  formatProblemNumber as f,
  verifyProblem,
  type ProblemSpec,
} from '../domain/problem-workbench';
import { useSceneClock } from './useSceneClock';
import { timelineProgress } from './timeline';
import type { LessonScene, SceneQuality } from './types';
import './problem-scene.css';

export type ProblemSceneProgress = {
  index: number;
  total: number;
  title: string;
  question: string;
  complete: boolean;
};
export type ProblemSceneProps = {
  problem: ProblemSpec;
  quality?: SceneQuality;
  reducedMotion?: boolean;
  autoplay?: boolean;
  initialSpeed?: 0.5 | 1 | 1.5 | 2;
  persistenceKey?: string;
  paused?: boolean;
  onComplete?: () => void;
  onStepChange?: (progress: ProblemSceneProgress) => void;
  revealAnswer?: boolean;
};
function Layer({ show, children }: { show: boolean; children: ReactNode }) {
  return (
    <g
      className="ps-layer"
      style={{ opacity: show ? 1 : 0, transform: `translateY(${show ? 0 : 8}px)` }}
      aria-hidden={!show}
    >
      {children}
    </g>
  );
}
function Label({
  x,
  y,
  children,
  tone = '',
}: {
  x: number;
  y: number;
  children: ReactNode;
  tone?: string;
}) {
  return (
    <text x={x} y={y} textAnchor="middle" className={`ps-label ${tone}`}>
      {children}
    </text>
  );
}
function Shape({ problem: p, index }: { problem: ProblemSpec; index: number }) {
  const a = Number(p.parameters.a),
    b = Number(p.parameters.b),
    triangle = p.kind === 'triangle';
  const ratio = Math.max(0.4, Math.min(3.5, a / b));
  const width = Math.min(400, 235 * ratio),
    height = Math.min(225, 400 / ratio);
  const left = (640 - width) / 2,
    top = (330 - height) / 2,
    right = left + width,
    bottom = top + height;
  const grid = Number.isInteger(a) && Number.isInteger(b) && a <= 20 && b <= 20;
  return (
    <>
      <path
        d={
          triangle
            ? `M${left} ${top} L${right} ${bottom} H${left} Z`
            : `M${left} ${top} H${right} V${bottom} H${left}Z`
        }
        className="ps-outline"
      />
      <Layer show={index >= 1}>
        <path d={`M${left} ${bottom} H${right}`} className="ps-line ps-cyan" />
        <Label x={320} y={bottom + 36} tone="ps-cyan">
          a = {f(a)} {String(p.parameters.unit)}
        </Label>
      </Layer>
      <Layer show={index >= 2}>
        <path d={`M${left} ${top} V${bottom}`} className="ps-line ps-gold" />
        <Label x={left - 25} y={top + height / 2} tone="ps-gold">
          {triangle ? 'h' : 'b'}
        </Label>
        <Label x={320} y={top - 23} tone="ps-gold">
          {triangle ? 'h' : 'b'} = {f(b)} {String(p.parameters.unit)}
        </Label>
        {triangle && <path d={`M${left} ${bottom - 18} h18 v18`} className="ps-thin" />}
      </Layer>
      <Layer show={index >= 3}>
        {triangle ? (
          <path d={`M${left} ${top} H${right} V${bottom}Z`} className="ps-duplicate" />
        ) : (
          <>
            {grid ? (
              Array.from({ length: a * b }, (_, i) => (
                <rect
                  key={i}
                  x={left + ((i % a) * width) / a + 1}
                  y={top + (Math.floor(i / a) * height) / b + 1}
                  width={Math.max(0, width / a - 2)}
                  height={Math.max(0, height / b - 2)}
                  rx="2"
                  className="ps-cell"
                  style={{ transitionDelay: `${Math.floor(i / a) * 45}ms` }}
                />
              ))
            ) : (
              <path
                d={`M${left + 3} ${top + 3} H${right - 3} V${bottom - 3} H${left + 3}Z`}
                className="ps-cell"
              />
            )}
          </>
        )}
      </Layer>
      <text x="320" y="376" textAnchor="middle" className="ps-note">
        {triangle
          ? 'Условная форма: используем заданные основание и высоту'
          : grid
            ? `Рядов: ${f(b)} · В каждом: ${f(a)}`
            : 'Схема размеров; при большом различии масштаб условный'}
      </text>
    </>
  );
}
function Axis({ p, index }: { p: ProblemSpec; index: number }) {
  const center = Number(p.parameters.center),
    radius = Number(p.parameters.radius);
  const target = radius ? Math.abs(radius) * 1.35 : 3;
  const power = 10 ** Math.floor(Math.log10(target / 4));
  const normalized = target / 4 / power;
  const tick = power * (normalized < 1.5 ? 1 : normalized < 3 ? 2 : normalized < 7 ? 5 : 10);
  const halfTicks = Math.ceil(target / tick),
    span = halfTicks * tick,
    min = center - span,
    max = center + span;
  const x = (v: number) => 70 + ((v - min) / (max - min)) * 500;
  const roots = p.parameters.roots as number[];
  return (
    <>
      <path d="M55 240 H590 m-9 -7 9 7 -9 7" className="ps-axis" />
      {Array.from({ length: halfTicks * 2 + 1 }, (_, i) => {
        const v = min + i * tick;
        return (
          <g key={i}>
            <path d={`M${x(v)} 233 v14`} className="ps-axis" />
            <Label x={x(v)} y={278}>
              {f(v)}
            </Label>
          </g>
        );
      })}
      <Layer show={index >= 1}>
        <path d={`M${x(center)} 130 V230`} className="ps-dashed" />
        <circle cx={x(center)} cy="240" r="8" className="ps-dot" />
        <Label x={x(center)} y={110}>
          Центр: {f(center)}
        </Label>
      </Layer>
      <Layer show={index >= 2}>
        <Label x={320} y={55} tone="ps-gold">
          {radius < 0 ? 'Расстояние не бывает отрицательным' : `Расстояние: ${f(radius)}`}
        </Label>
      </Layer>
      <Layer show={index >= 3 && radius >= 0}>
        <path
          d={`M${x(center - radius)} 310 H${x(center)} H${x(center + radius)}`}
          className="ps-line ps-cyan"
        />
        {roots.map((r, i) => (
          <g key={i}>
            <circle
              cx={x(r)}
              cy="240"
              r="9"
              className={`ps-dot ${i ? 'ps-gold-fill' : 'ps-cyan-fill'}`}
            />
            <Layer show={index >= 4}>
              <Label x={x(r)} y={207} tone={i ? 'ps-gold' : 'ps-cyan'}>
                x = {f(r)}
              </Label>
            </Layer>
          </g>
        ))}
      </Layer>
      <text x="320" y="376" textAnchor="middle" className="ps-note">
        Одинаковый масштаб слева и справа от центра
      </text>
    </>
  );
}
function Graph({ p, index, uid }: { p: ProblemSpec; index: number; uid: string }) {
  const a = Number(p.parameters.a),
    b = Number(p.parameters.b),
    c = Number(p.parameters.c),
    roots = p.parameters.roots as number[];
  const center = a ? -b / (2 * a) : roots[0] || 0;
  const span = Math.max(3, ...roots.map((r) => Math.abs(r - center) * 1.4));
  const xmin = center - span,
    xmax = center + span;
  const evaluate = (v: number) => a * v * v + b * v + c;
  const samples = Array.from({ length: 81 }, (_, i) => ({
    x: xmin + ((xmax - xmin) * i) / 80,
    y: evaluate(xmin + ((xmax - xmin) * i) / 80),
  }));
  const low = Math.min(-1, ...samples.map((s) => s.y)),
    high = Math.max(1, ...samples.map((s) => s.y)),
    pad = (high - low) * 0.14;
  const sx = (v: number) => 70 + ((v - xmin) / (xmax - xmin)) * 500;
  const sy = (v: number) => 315 - ((v - low + pad) / (high - low + 2 * pad)) * 260;
  const curve = samples
    .map((point, i) => `${i ? 'L' : 'M'}${sx(point.x)} ${sy(point.y)}`)
    .join(' ');
  return (
    <>
      <defs>
        <clipPath id={uid}>
          <rect x="60" y="40" width="530" height="300" />
        </clipPath>
      </defs>
      <path d={`M60 ${sy(0)} H590 m-7 -5 7 5 -7 5`} className="ps-axis" />
      <Label x={605} y={sy(0) + 7}>
        x
      </Label>
      {xmin < 0 && xmax > 0 && <path d={`M${sx(0)} 340 V35`} className="ps-axis" />}
      <Layer show={index >= 1}>
        <g clipPath={`url(#${uid})`}>
          <path d={curve} className="ps-curve" />
        </g>
        <Label x={320} y={28}>
          y = {a ? `${f(a)}x² ${b < 0 ? '−' : '+'} ${f(Math.abs(b))}x` : `${f(b)}x`}{' '}
          {c < 0 ? '−' : '+'} {f(Math.abs(c))}
        </Label>
      </Layer>
      <Layer show={index >= 3}>
        {roots.map((r, i) => (
          <g key={i}>
            <circle cx={sx(r)} cy={sy(0)} r="8" className="ps-dot ps-cyan-fill" />
            <Layer show={index >= 4}>
              <Label x={sx(r)} y={sy(0) + 33}>
                x = {f(r)}
              </Label>
            </Layer>
          </g>
        ))}
      </Layer>
      <text x="320" y="376" textAnchor="middle" className="ps-note">
        Корни соответствуют точкам, где y = 0
      </text>
    </>
  );
}
function Arithmetic({ p, index }: { p: ProblemSpec; index: number }) {
  if (typeof p.parameters.absoluteValue === 'number') {
    const n = p.parameters.absoluteValue,
      span = Math.max(Math.abs(n) * 1.35, 1),
      position = 320 + (n / span) * 230;
    return (
      <>
        <Label x={320} y={60}>
          Расстояние до нуля
        </Label>
        <path d="M55 245 H585" className="ps-axis" />
        <circle cx="320" cy="245" r="8" className="ps-dot" />
        <Label x={320} y={285}>
          0
        </Label>
        <Layer show={index >= 1}>
          <circle cx={position} cy="245" r="9" className="ps-dot ps-cyan-fill" />
          <Label x={position} y={208}>
            {f(n)}
          </Label>
        </Layer>
        <Layer show={index >= 2}>
          <path d={`M${position} 310 H320`} className="ps-line ps-cyan" />
        </Layer>
        <text x="320" y="375" textAnchor="middle" className="ps-note">
          Длина не зависит от направления
        </text>
      </>
    );
  }
  const left = Number(p.parameters.left),
    right = Number(p.parameters.right);
  const groups =
    Number.isInteger(left) &&
    Number.isInteger(right) &&
    left > 0 &&
    right > 0 &&
    left <= 16 &&
    right <= 12;
  const fraction = String(p.parameters.expression || '').match(/^(\d+)\s*\/\s*(\d+)$/);
  const canTile =
    fraction &&
    Number(fraction[1]) <= Number(fraction[2]) &&
    Number(fraction[2]) <= 24 &&
    Number(fraction[2]) > 0;
  return (
    <>
      <Label x={320} y={65}>
        {p.confirmedText.length < 43 ? p.confirmedText : 'Порядок действий в твоём выражении'}
      </Label>
      <Layer show={index >= 1}>
        {groups ? (
          <>
            {Array.from({ length: right }, (_, row) => (
              <g
                key={row}
                className="ps-layer"
                style={{ opacity: index >= 2 ? 1 : row === 0 ? 1 : 0.12 }}
              >
                {Array.from({ length: left }, (_, col) => (
                  <rect
                    key={col}
                    x={65 + (col * 510) / left}
                    y={105 + (row * 190) / right}
                    width={510 / left - 5}
                    height={190 / right - 5}
                    rx="5"
                    className="ps-cell"
                  />
                ))}
              </g>
            ))}
            <Label x={320} y={343}>
              Групп: {f(right)} · В каждой: {f(left)}
            </Label>
          </>
        ) : canTile ? (
          <>
            {Array.from({ length: Number(fraction[2]) }, (_, i) => (
              <rect
                key={i}
                x={65 + (i % 8) * 64}
                y={120 + Math.floor(i / 8) * 56}
                width="55"
                height="45"
                rx="7"
                className={i < Number(fraction[1]) ? 'ps-cell' : 'ps-empty'}
              />
            ))}
            <Label x={320} y={333}>
              Взято: {fraction[1]} · Всего равных частей: {fraction[2]}
            </Label>
          </>
        ) : (
          <>
            {[
              ['( )', 'Скобки и степени'],
              ['× ÷', 'Умножение и деление'],
              ['+ −', 'Сложение и вычитание'],
            ].map(([sign, title], i) => (
              <g key={sign} transform={`translate(${45 + i * 190} 143)`}>
                <rect width="170" height="130" rx="20" className="ps-card" />
                <Label x={85} y={52} tone={i === 1 ? 'ps-cyan' : 'ps-gold'}>
                  {sign}
                </Label>
                <text x="85" y="89" textAnchor="middle" className="ps-note">
                  {title.split(' и ')[0]}
                </text>
                <text x="85" y="111" textAnchor="middle" className="ps-note">
                  и {title.split(' и ')[1]}
                </text>
              </g>
            ))}
          </>
        )}
      </Layer>
      <text x="320" y="380" textAnchor="middle" className="ps-note">
        Проверка выполняется точными дробями
      </text>
    </>
  );
}
function Percent({ p, index }: { p: ProblemSpec; index: number }) {
  const rate = Number(p.parameters.rate),
    base = Number(p.parameters.base),
    scale = Math.max(100, rate);
  return (
    <>
      <Label x={320} y={70}>
        Целое: {f(base)}
      </Label>
      <rect x="65" y="143" width={(510 * 100) / scale} height="70" rx="12" className="ps-empty" />
      <Layer show={index >= 1}>
        <path d={`M${65 + 510 / scale} 135 v87`} className="ps-line ps-gold" />
        <Label x={320} y={275}>
          100% — всё целое
        </Label>
      </Layer>
      <Layer show={index >= 2}>
        <rect x="65" y="151" width={(510 * rate) / scale} height="54" rx="8" className="ps-cell" />
        <Label x={320} y={116} tone="ps-cyan">
          Берём {f(rate)}%
        </Label>
      </Layer>
      <text x="320" y="376" textAnchor="middle" className="ps-note">
        Процент переводится в долю делением на 100
      </text>
    </>
  );
}
function Player({
  problem,
  quality = 'high',
  reducedMotion = false,
  autoplay = true,
  initialSpeed = 1,
  persistenceKey,
  paused = false,
  onComplete,
  onStepChange,
  revealAnswer = true,
}: ProblemSceneProps) {
  const scene = useMemo<LessonScene>(() => {
    const steps = problem.steps.filter(
      (s) => revealAnswer || !['result', 'verify'].includes(s.visual),
    );
    return {
      id: `${problem.id}-${revealAnswer ? 'solution' : 'practice'}`,
      subject: 'math',
      topic: problem.kind,
      title: 'Твоя задача',
      eyebrow: 'Проверено локально',
      autoplay: true,
      replayable: true,
      durationMs: steps.reduce((n, s) => n + s.durationMs, 0),
      steps: steps.map((s) => ({ ...s, visualAction: s.visual, highlights: [] })),
      reducedMotionFrame: { step: 0, description: 'Ручные шаги по условию' },
      question: problem.question,
    };
  }, [problem, revealAnswer]);
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
    initialSpeed,
    persistenceKey,
    paused,
  );
  const { cursor, playing, manualFrame } = clock;
  const current = scene.steps[cursor.step],
    atEnd = cursor.step === scene.steps.length - 1;
  const callback = useRef(onStepChange),
    completeCallback = useRef(onComplete),
    completeSent = useRef(false);
  callback.current = onStepChange;
  completeCallback.current = onComplete;
  const uid = `ps-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  useEffect(() => {
    const q = matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setSystemReduced(q.matches);
    q.addEventListener('change', change);
    return () => q.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    callback.current?.({
      index: cursor.step,
      total: scene.steps.length,
      title: current.title,
      question: problem.question,
      complete: cursor.complete,
    });
    if (cursor.complete && !completeSent.current) {
      completeSent.current = true;
      completeCallback.current?.();
    }
  }, [cursor.step, cursor.complete, current.title, problem.question, scene.steps.length]);
  const replay = () => {
    completeSent.current = false;
    clock.replay();
  };
  const next = () => (atEnd ? clock.finish() : clock.goTo(cursor.step + 1));
  const keyboard = (e: KeyboardEvent<HTMLElement>) => {
    if (
      (e.target as Element).closest(
        'input,textarea,button,select,summary,a,[contenteditable=true]',
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
      clock.goTo(cursor.step - 1);
    }
    if (e.code === 'Space' && !e.repeat) {
      e.preventDefault();
      clock.togglePlay();
    }
  };
  const showFormula = manualFrame || motionOff || cursor.elapsedMs >= 1400;
  return (
    <section
      className={`problem-scene ps-${quality} ${motionOff ? 'ps-no-motion' : ''} ${manualFrame ? 'ps-manual' : ''}`}
      data-problem-id={problem.id}
      data-kind={problem.kind}
      data-playing={playing}
      tabIndex={0}
      aria-label="Сцена по твоей задаче"
      onKeyDown={keyboard}
    >
      <header>
        <div>
          <span className="ps-eyebrow">Твои числа · локальная проверка</span>
          <h3>Разбираем твоё условие</h3>
        </div>
        <label className="ps-step-select">
          <span>Шаг</span>
          <select
            aria-label="Шаг решения задачи"
            value={cursor.step}
            onChange={(e) => clock.goTo(Number(e.target.value))}
          >
            {scene.steps.map((s, i) => (
              <option key={s.id} value={i}>
                {i + 1} / {scene.steps.length} · {s.title}
              </option>
            ))}
          </select>
        </label>
      </header>
      <p className="ps-condition">{problem.confirmedText}</p>
      <div className="ps-body" ref={clock.bodyRef} key={clock.revision}>
        <svg
          viewBox="0 0 640 400"
          role="img"
          aria-label={`Шаг ${cursor.step + 1}. ${current.title}. ${problem.confirmedText}`}
        >
          {problem.kind === 'rectangle' || problem.kind === 'triangle' ? (
            <Shape problem={problem} index={cursor.step} />
          ) : problem.kind === 'absolute' ? (
            <Axis p={problem} index={cursor.step} />
          ) : problem.kind === 'linear' || problem.kind === 'quadratic' ? (
            <Graph p={problem} index={cursor.step} uid={uid} />
          ) : problem.kind === 'percent' ? (
            <Percent p={problem} index={cursor.step} />
          ) : (
            <Arithmetic p={problem} index={cursor.step} />
          )}
        </svg>
        <aside aria-live="polite">
          <span className="ps-eyebrow">
            Шаг {cursor.step + 1} из {scene.steps.length}
          </span>
          <h4>{current.title}</h4>
          <p>{current.narration}</p>
          {current.formula && (
            <div
              className="ps-formula"
              style={{ opacity: showFormula ? 1 : 0 }}
              aria-hidden={!showFormula}
            >
              {current.formula}
            </div>
          )}
        </aside>
      </div>
      <div className="ps-progress" aria-hidden="true">
        <span
          style={{ width: `${100 * timelineProgress(scene, cursor.step, cursor.elapsedMs)}%` }}
        />
      </div>
      <footer>
        <div>
          <button
            type="button"
            onClick={clock.togglePlay}
            disabled={motionOff || paused}
            className="ps-play"
          >
            {playing ? <Pause size={17} /> : <Play size={17} />}
            {playing ? 'Пауза' : 'Смотреть'}
          </button>
          <button
            type="button"
            onClick={replay}
            disabled={paused}
            aria-label="Повторить разбор задачи"
          >
            <RotateCcw size={17} />
          </button>
          <button
            type="button"
            onClick={() => clock.goTo(cursor.step - 1)}
            disabled={!cursor.step || paused}
            aria-label="Предыдущий шаг задачи"
          >
            <ArrowLeft size={17} />
          </button>
          <button
            type="button"
            onClick={next}
            disabled={paused}
            aria-label={atEnd ? 'Завершить разбор задачи' : 'Следующий шаг задачи'}
          >
            {atEnd ? <Check size={17} /> : <ArrowRight size={17} />}
          </button>
        </div>
        <label>
          Темп
          <select
            aria-label="Скорость разбора задачи"
            value={clock.speed}
            disabled={motionOff || paused}
            onChange={(e) => clock.setSpeed(Number(e.target.value))}
          >
            {[0.5, 1, 1.5, 2].map((s) => (
              <option value={s} key={s}>
                {String(s).replace('.', ',')}×
              </option>
            ))}
          </select>
        </label>
      </footer>
      <p className="ps-help">
        {motionOff
          ? 'Без движения: шаги доступны кнопками.'
          : 'Пробел — пауза. Стрелки — шаги, когда сцена в фокусе.'}
      </p>
    </section>
  );
}
export function ProblemScene(props: ProblemSceneProps) {
  const verification = useMemo(() => verifyProblem(props.problem), [props.problem]);
  if (!verification.valid)
    return (
      <section className="problem-scene ps-clarification">
        <h3>Уточним условие</h3>
        <p>{props.problem.question || verification.reason}</p>
      </section>
    );
  return (
    <Player
      key={`${props.problem.id}-${props.revealAnswer === false ? 'practice' : 'solution'}`}
      {...props}
    />
  );
}
