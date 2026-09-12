import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronDown, Pause, Play, RotateCcw } from 'lucide-react';
import type { SceneQuality } from './types';
import { useSceneClock } from './useSceneClock';
import { timelineProgress } from './timeline';
import {
  createCurriculumScene,
  curriculumVisualFamily,
  type CurriculumSceneNode,
  type CurriculumVisualFamily,
} from './curriculum-visuals';
import './curriculum-scenes.css';

export type CurriculumSceneProps = {
  node: CurriculumSceneNode;
  quality?: SceneQuality;
  reducedMotion?: boolean;
  autoplay?: boolean;
  initialSpeed?: 0.5 | 1 | 1.5 | 2;
  onComplete?: () => void;
  persistenceKey?: string;
  paused?: boolean;
};

function Layer({
  show,
  children,
  className = '',
}: {
  show: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <g
      className={`cv-layer ${className}`}
      style={{ opacity: show ? 1 : 0, transform: `translateY(${show ? 0 : 9}px)` }}
      aria-hidden={!show}
    >
      {children}
    </g>
  );
}

function Tile({
  x,
  y,
  width = 140,
  label,
  children,
  tone = 'violet',
}: {
  x: number;
  y: number;
  width?: number;
  label?: string;
  children?: ReactNode;
  tone?: string;
}) {
  const words = label?.split(' ') ?? [];
  const wrap = !!label && label.length * 10.8 > width - 24 && words.length > 1;
  let lines = label ? [label] : [];
  if (wrap) {
    let split = 1;
    for (let index = 1; index < words.length; index++) {
      if (
        Math.abs(words.slice(0, index).join(' ').length - words.slice(index).join(' ').length) <
        Math.abs(words.slice(0, split).join(' ').length - words.slice(split).join(' ').length)
      )
        split = index;
    }
    lines = [words.slice(0, split).join(' '), words.slice(split).join(' ')];
  }
  const fontSize = Math.min(
    20,
    (width - 22) / (Math.max(1, ...lines.map((line) => line.length)) * 0.59),
  );
  return (
    <g transform={`translate(${x} ${y})`} className={`cv-tile cv-${tone}`}>
      <rect width={width} height="62" rx="15" />
      {children}
      {label && (
        <text x={width / 2} y={lines.length > 1 ? 25 : 37} textAnchor="middle" style={{ fontSize }}>
          {lines.map((line, index) => (
            <tspan key={index} x={width / 2} dy={index ? 21 : 0}>
              {line}
            </tspan>
          ))}
        </text>
      )}
    </g>
  );
}

function Person({
  x,
  y,
  size = 1,
  tone = 'cyan',
}: {
  x: number;
  y: number;
  size?: number;
  tone?: string;
}) {
  return (
    <g transform={`translate(${x} ${y}) scale(${size})`} className={`cv-person cv-${tone}`}>
      <circle cy="-24" r="18" />
      <path d="M-31 45V15Q-31-1-14-1H14Q31-1 31 15V45Z" />
      <path d="M-15 43V75M15 43V75" className="cv-person-legs" />
    </g>
  );
}

function Arrow({ d, tone = 'cyan' }: { d: string; tone?: string }) {
  return <path d={d} className={`cv-arrow cv-${tone}`} />;
}

function Axes({ market = false }: { market?: boolean }) {
  return (
    <g className="cv-axes">
      <path d="M130 70V325H628M121 84L130 70 139 84M614 316L628 325 614 334" />
      <text x="112" y="59">
        {market ? 'P' : 'y'}
      </text>
      <text x="639" y="333">
        {market ? 'Q' : 'x'}
      </text>
      <text x="108" y="345">
        0
      </text>
      {[1, 2, 3, 4].map((i) => (
        <path className="cv-grid" key={i} d={`M${130 + i * 97} 76V325M130 ${325 - i * 52}H615`} />
      ))}
    </g>
  );
}

function AbsoluteVisual({ step, full }: { step: number; full: boolean }) {
  const s = full ? step : [0, 2, 4, 6][step];
  const shifted = s >= 7;
  const center = shifted ? 466 : 360;
  const left = center - 159,
    right = center + 159;
  const distances = shifted ? s >= 8 : s >= 2;
  return (
    <>
      <text x="360" y="50" textAnchor="middle" className="cv-canvas-title">
        {shifted ? 'Расстояние от точки 2' : 'Расстояние до нуля'}
      </text>
      <g className="cv-axes">
        <path d="M28 257H697M683 249L697 257 683 265" />
        {Array.from({ length: 13 }, (_, i) => i - 6).map((n) => (
          <g key={n}>
            <path d={`M${360 + n * 53} 249V265`} />
            <text
              x={360 + n * 53}
              y="294"
              textAnchor="middle"
              className={n === 0 ? 'cv-origin-label' : ''}
            >
              {n < 0 ? `−${-n}` : n}
            </text>
          </g>
        ))}
      </g>
      <g className="cv-center-move" style={{ transform: `translateX(${center}px)` }}>
        <path d="M0 186V255" className="cv-center-line" />
        <circle cy="257" r="8" className="cv-center-dot" />
        <text y="169" textAnchor="middle" className="cv-center-label">
          {shifted ? 'центр: 2' : 'ноль'}
        </text>
      </g>
      <Layer show={s >= 1 && !shifted}>
        <circle cx="201" cy="257" r="10" className="cv-point cv-cyan" />
        <text x="201" y="226" textAnchor="middle" className="cv-point-label">
          −3
        </text>
      </Layer>
      <Layer show={s >= 4 && !shifted}>
        <circle cx="519" cy="257" r="10" className="cv-point cv-gold" />
        <text x="519" y="226" textAnchor="middle" className="cv-point-label">
          3
        </text>
      </Layer>
      <Layer show={distances}>
        {[0, 1, 2].map((i) => (
          <g key={i} className="cv-distance-piece">
            <path
              className="cv-distance cv-cyan"
              d={`M${left + i * 53 + 3} 330Q${left + i * 53 + 26.5} 362 ${left + (i + 1) * 53 - 3} 330`}
            />
            <text x={left + i * 53 + 26.5} y="378" textAnchor="middle">
              1
            </text>
          </g>
        ))}
        <path
          className="cv-distance-line cv-cyan"
          pathLength="1"
          style={{ strokeDashoffset: distances ? 0 : 1 }}
          d={`M${center} 311H${left}`}
        />
        <text
          x={(center + left) / 2}
          y="125"
          textAnchor="middle"
          className="cv-distance-label cv-cyan"
        >
          3 единицы
        </text>
      </Layer>
      <Layer show={(s >= 4 && !shifted) || (shifted && s >= 8)}>
        <path className="cv-distance-line cv-gold" d={`M${center} 311H${right}`} />
        <text
          x={(center + right) / 2}
          y="125"
          textAnchor="middle"
          className="cv-distance-label cv-gold"
        >
          3 единицы
        </text>
      </Layer>
      <Layer show={shifted && s >= 8}>
        <circle cx="307" cy="257" r="10" className="cv-point cv-cyan" />
        <circle cx="625" cy="257" r="10" className="cv-point cv-gold" />
      </Layer>
      <Layer show={shifted && s >= 9}>
        <text x="307" y="221" textAnchor="middle" className="cv-root-label cv-cyan">
          x = −1
        </text>
        <text x="625" y="221" textAnchor="middle" className="cv-root-label cv-gold">
          x = 5
        </text>
      </Layer>
      <Layer show={shifted && s >= 10}>
        <path d="M295 185L304 194 323 175M613 185L622 194 641 175" className="cv-check" />
      </Layer>
      <Layer show={!shifted && s === 6}>
        <text x="360" y="80" textAnchor="middle" className="cv-small-note">
          Одинаковая длина — две стороны от нуля
        </text>
      </Layer>
    </>
  );
}

function AlgebraVisual({ step }: { step: number }) {
  return (
    <>
      <path d="M355 94V307M292 310H420M208 133H512" className="cv-balance" />
      <circle cx="355" cy="132" r="13" className="cv-point cv-violet" />
      <path
        d="M222 138L184 233M222 138L261 233M490 138L451 233M490 138L530 233"
        className="cv-fine"
      />
      <path
        d="M177 232H268Q260 264 222 264T177 232ZM445 232H536Q527 264 490 264T445 232Z"
        className="cv-pan"
      />
      <Tile x={187} y={165} width={70} label="x" tone="cyan" />
      <Layer show={step >= 1}>
        <Tile x={455} y={165} width={70} label="a" tone="gold" />
        <text x="355" y="220" textAnchor="middle" className="cv-math-sign">
          =
        </text>
      </Layer>
      <Layer show={step >= 2}>
        <Arrow d="M290 92Q355 25 424 92M410 79L424 92 428 73" />
        <text x="355" y="47" textAnchor="middle" className="cv-small-note">
          допустимый шаг
        </text>
      </Layer>
      <Layer show={step >= 3}>
        <Tile x={232} y={330} width={252} label="Проверить подстановкой" tone="green" />
      </Layer>
      <text x="355" y="287" textAnchor="middle" className="cv-small-note">
        Сохраняем равенство
      </text>
    </>
  );
}

function GraphVisual({ step, market }: { step: number; market?: boolean }) {
  return (
    <>
      <Axes market={market} />
      <Layer show={step >= 1}>
        <path
          d={market ? 'M163 108L590 295' : 'M161 290C242 306 251 125 348 184S489 305 595 85'}
          className="cv-curve cv-cyan"
          pathLength="1"
          style={{ strokeDashoffset: step >= 1 ? 0 : 1 }}
        />
      </Layer>
      <Layer show={step >= 2}>
        {market ? (
          <path d="M163 295L590 108" className="cv-curve cv-gold" />
        ) : (
          <path d="M348 184V325M130 184H348" className="cv-guide" />
        )}
        <circle
          cx={market ? 376.5 : 348}
          cy={market ? 201.5 : 184}
          r="9"
          className="cv-point cv-violet"
        />
        {market && (
          <>
            <text x="592" y="100" className="cv-gold">
              S
            </text>
            <text x="592" y="315" className="cv-cyan">
              D
            </text>
          </>
        )}
      </Layer>
      <Layer show={step >= 3}>
        <Tile
          x={market ? 265 : 366}
          y={market ? 64 : 222}
          width={market ? 235 : 184}
          label={market ? 'Точка равновесия' : 'Пара значений'}
          tone="violet"
        />
      </Layer>
      <text x="370" y="387" textAnchor="middle" className="cv-small-note">
        {market
          ? 'Учебная модель без числовых данных'
          : 'Условная линия: вид функции ещё нужно установить'}
      </text>
    </>
  );
}

function GeometryVisual({ step, circle }: { step: number; circle: boolean }) {
  return (
    <>
      {circle ? (
        <>
          <circle cx="350" cy="204" r="133" className="cv-figure" />
          <Layer show={step >= 1}>
            <path d="M350 204L470 147" className="cv-edge cv-cyan" />
            <circle cx="350" cy="204" r="6" className="cv-point cv-cyan" />
            <text x="326" y="226">
              O
            </text>
          </Layer>
          <Layer show={step >= 2}>
            <path d="M236 137L470 147 350 204Z" className="cv-guide" />
          </Layer>
          <Layer show={step >= 3}>
            <path d="M249 72L489 277" className="cv-edge cv-gold" />
          </Layer>
        </>
      ) : (
        <>
          <path d="M135 313L317 75 591 313Z" className="cv-figure" />
          <text x="311" y="55">
            A
          </text>
          <text x="111" y="334">
            B
          </text>
          <text x="600" y="334">
            C
          </text>
          <Layer show={step >= 1}>
            <path d="M135 313H591" className="cv-edge cv-cyan" />
            <path d="M251 303L257 323M459 303L465 323" className="cv-fine cv-cyan" />
          </Layer>
          <Layer show={step >= 2}>
            <path d="M317 75L363 313" className="cv-edge cv-gold" />
            <circle cx="363" cy="313" r="6" className="cv-point cv-gold" />
          </Layer>
          <Layer show={step >= 3}>
            <path d="M290 110Q320 139 356 108" className="cv-guide" />
          </Layer>
        </>
      )}
      <text x="360" y="380" textAnchor="middle" className="cv-small-note">
        Вспомогательный чертёж: свойства обосновываем условием
      </text>
    </>
  );
}

function SolidVisual({ step }: { step: number }) {
  return (
    <>
      <path d="M208 150L399 91 536 166 344 227Z" className="cv-solid-top" />
      <path d="M208 150L344 227V346L208 268Z" className="cv-solid-left" />
      <path d="M344 227L536 166V285L344 346Z" className="cv-solid-right" />
      <Layer show={step >= 1}>
        <path d="M399 91V211L208 268M399 211L536 285" className="cv-guide" />
      </Layer>
      <Layer show={step >= 2}>
        <path d="M208 207L399 149 536 225 344 286Z" className="cv-section-plane" />
      </Layer>
      <Layer show={step >= 3}>
        <path d="M208 207L344 286 536 225 399 149Z" className="cv-edge cv-gold" />
        <Tile x={43} y={58} width={182} label="Плоскость сечения" tone="gold" />
      </Layer>
      <text x="360" y="385" textAnchor="middle" className="cv-small-note">
        Условная призма · невидимые рёбра показаны пунктиром
      </text>
    </>
  );
}

function ChanceVisual({ step }: { step: number }) {
  return (
    <>
      <g transform="translate(80 164) rotate(-8 45 45)">
        <rect width="94" height="94" rx="23" className="cv-die" />
        {[
          [24, 24],
          [70, 24],
          [47, 47],
          [24, 70],
          [70, 70],
        ].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="5" className="cv-die-pip" />
        ))}
      </g>
      <text x="129" y="303" textAnchor="middle" className="cv-small-note">
        опыт
      </text>
      <Layer show={step >= 1}>
        <path d="M177 210H235L330 120M235 210L330 300" className="cv-tree" />
        <circle cx="332" cy="120" r="16" className="cv-point cv-cyan" />
        <circle cx="332" cy="300" r="16" className="cv-point cv-violet" />
      </Layer>
      <Layer show={step >= 2}>
        <path
          d="M348 120L512 69M348 120L512 173M348 300L512 247M348 300L512 351"
          className="cv-tree"
        />
        {[69, 173, 247, 351].map((y) => (
          <circle key={y} cx="526" cy={y} r="14" className="cv-point cv-gold" />
        ))}
      </Layer>
      <Layer show={step >= 3}>
        <rect x="490" y="36" width="74" height="171" rx="33" className="cv-event" />
        <text x="587" y="130" className="cv-cyan">
          событие
        </text>
      </Layer>
      <text x="325" y="389" textAnchor="middle" className="cv-small-note">
        Схема ветвления · вероятности ещё не назначены
      </text>
    </>
  );
}

function LanguageVisual({ step, family }: { step: number; family: CurriculumVisualFamily }) {
  if (family === 'morphology')
    return (
      <>
        <Tile x={260} y={165} width={200} label="СЛОВО" />
        <Layer show={step >= 1}>
          <path d="M290 165L179 105" className="cv-tree" />
          <Tile x={75} y={48} width={185} label="Значение" tone="cyan" />
        </Layer>
        <Layer show={step >= 2}>
          <path d="M428 165L535 105" className="cv-tree" />
          <Tile x={454} y={48} width={185} label="Форма" tone="gold" />
        </Layer>
        <Layer show={step >= 3}>
          <path d="M360 227V298" className="cv-tree" />
          <Tile x={246} y={298} width={228} label="Роль в предложении" tone="green" />
        </Layer>
        <text x="360" y="395" textAnchor="middle" className="cv-small-note">
          Часть речи определяют по совокупности признаков
        </text>
      </>
    );
  if (family === 'syntax')
    return (
      <>
        <text x="360" y="74" textAnchor="middle" className="cv-small-note">
          Учебный пример
        </text>
        <text x="253" y="207" textAnchor="middle" className="cv-sentence cv-cyan">
          Птицы
        </text>
        <text x="479" y="207" textAnchor="middle" className="cv-sentence cv-gold">
          летят.
        </text>
        <Layer show={step >= 1}>
          <path d="M170 223H336M404 223H550M404 229H550" className="cv-syntax-line" />
        </Layer>
        <Layer show={step >= 2}>
          <path d="M253 157V121H479V157M470 148L479 157 488 148" className="cv-arrow cv-violet" />
          <text x="362" y="106" textAnchor="middle">
            что делают?
          </text>
        </Layer>
        <Layer show={step >= 3}>
          <Tile x={172} y={289} width={378} label="Грамматическая основа" tone="green" />
        </Layer>
      </>
    );
  if (family === 'spelling')
    return (
      <>
        <text x="360" y="70" textAnchor="middle" className="cv-canvas-title">
          Место выбора в слове
        </text>
        {[0, 1, 2, 3, 4].map((i) => (
          <g key={i}>
            <rect
              x={157 + i * 84}
              y="125"
              width="70"
              height="80"
              rx="15"
              className={i === 2 ? 'cv-letter-gap' : 'cv-letter-box'}
            />
            <text x={192 + i * 84} y="180" textAnchor="middle" className="cv-letter-placeholder">
              {i === 2 ? '?' : '·'}
            </text>
          </g>
        ))}
        <Layer show={step >= 1}>
          <Tile x={66} y={275} width={168} label="Условие" tone="cyan" />
          <path d="M300 206L155 274" className="cv-tree" />
        </Layer>
        <Layer show={step >= 2}>
          <Tile x={275} y={275} width={168} label="Правило" tone="gold" />
          <path d="M359 206V273" className="cv-tree" />
        </Layer>
        <Layer show={step >= 3}>
          <Tile x={484} y={275} width={168} label="Словарь" tone="green" />
          <path d="M418 206L569 274" className="cv-tree" />
        </Layer>
        <text x="360" y="385" textAnchor="middle" className="cv-small-note">
          Выбор написания зависит от конкретного слова и контекста
        </text>
      </>
    );
  return (
    <>
      <rect x="181" y="36" width="358" height="343" rx="19" className="cv-paper" />
      {['Тезис', 'Материал', 'Объяснение связи', 'Вывод'].map((label, i) => (
        <Layer key={label} show={step >= i}>
          <rect
            x="209"
            y={66 + i * 76}
            width="300"
            height="56"
            rx="10"
            className={`cv-paragraph cv-paragraph-${i}`}
          />
          <text x="229" y={101 + i * 76}>
            {label}
          </text>
        </Layer>
      ))}
      <path d="M153 70H136V345H153" className="cv-tree" />
      <text x="568" y="219" className="cv-small-note">
        мысль
      </text>
    </>
  );
}

function HistoryVisual({
  step,
  family,
  uid,
}: {
  step: number;
  family: CurriculumVisualFamily;
  uid: string;
}) {
  if (family === 'map')
    return (
      <>
        <path
          d="M134 98L220 62 267 95 344 61 404 87 441 136 527 107 593 169 564 220 616 275 558 327 490 314 442 353 359 324 308 350 270 310 199 331 151 279 93 236 113 171Z"
          className="cv-land"
        />
        <path d="M408 90Q324 182 367 247T301 338M523 144Q479 204 537 298" className="cv-river" />
        <Layer show={step >= 1}>
          <circle cx="261" cy="223" r="11" className="cv-point cv-gold" />
          <text x="250" y="199" textAnchor="middle">
            место
          </text>
          <circle cx="466" cy="165" r="7" className="cv-point cv-cyan" />
        </Layer>
        <Layer show={step >= 2}>
          <path d="M269 221Q330 143 456 166" className="cv-map-route" pathLength="1" />
          <path d="M443 157L458 166 442 172" className="cv-edge cv-gold" />
        </Layer>
        <Layer show={step >= 3}>
          <circle cx="261" cy="223" r="51" className="cv-map-zone" />
          <circle cx="466" cy="165" r="34" className="cv-map-zone" />
        </Layer>
        <text x="360" y="392" textAnchor="middle" className="cv-small-note">
          Условная карта · без исторических границ и маршрутов
        </text>
      </>
    );
  if (family === 'person')
    return (
      <>
        <ellipse cx="350" cy="352" rx="141" ry="18" className="cv-shadow" />
        <path d="M273 338L294 196Q350 171 405 196L428 338Z" className="cv-cloak" />
        <path d="M318 191L350 236 383 191" className="cv-cloak-trim" />
        <circle cx="350" cy="127" r="48" fill={`url(#${uid}-skin)`} />
        <path
          d="M301 119Q300 64 350 72 405 64 399 119L384 95 355 105 323 97Z"
          className="cv-hair"
        />
        <path d="M331 149Q349 160 369 149" className="cv-portrait-line" />
        <Layer show={step >= 1}>
          <Tile x={41} y={86} width={175} label="Цели" tone="cyan" />
          <path d="M215 119H267" className="cv-tree" />
        </Layer>
        <Layer show={step >= 2}>
          <Tile x={491} y={172} width={186} label="Действия" tone="gold" />
          <path d="M425 203H490" className="cv-tree" />
        </Layer>
        <Layer show={step >= 3}>
          <Tile x={43} y={268} width={187} label="Обстоятельства" tone="green" />
          <path d="M229 297H279" className="cv-tree" />
        </Layer>
        <text x="350" y="390" textAnchor="middle" className="cv-small-note">
          Условный персонаж · не исторический портрет
        </text>
      </>
    );
  if (family === 'document')
    return (
      <>
        <path
          d="M237 42H502V348Q390 329 237 354Z"
          fill={`url(#${uid}-paper)`}
          className="cv-document"
        />
        <path
          d="M237 42Q211 47 220 74H237M502 348Q521 353 521 366H250Q222 357 237 341"
          className="cv-scroll-edge"
        />
        {[100, 133, 166, 199, 232].map((y, i) => (
          <path key={y} d={`M268 ${y}H${i % 2 ? 440 : 470}`} className="cv-script-line" />
        ))}
        <circle cx="452" cy="297" r="28" className="cv-seal" />
        <path d="M440 315L431 346 451 336 465 348 465 318" className="cv-ribbon" />
        <Layer show={step >= 1}>
          <Tile x={39} y={73} width={166} label="Кто и когда?" tone="cyan" />
          <path d="M204 106H263" className="cv-tree" />
        </Layer>
        <Layer show={step >= 2}>
          <rect x="260" y="182" width="220" height="29" rx="8" className="cv-document-highlight" />
          <Tile x={530} y={166} width={166} label="Свидетельство" tone="gold" />
        </Layer>
        <Layer show={step >= 3}>
          <Tile x={34} y={276} width={164} label="Контекст" tone="green" />
          <path d="M197 307H237" className="cv-tree" />
        </Layer>
        <text x="363" y="393" textAnchor="middle" className="cv-small-note">
          Иллюстрация документа · подлинной цитаты здесь нет
        </text>
      </>
    );
  return (
    <>
      <g className="cv-city">
        <path d="M289 278V147H326V105H381V147H420V278Z" />
        <path d="M278 147L353 70 432 147Z" />
        <rect x="337" y="216" width="35" height="62" rx="16" />
        {[309, 353, 397].map((x) => (
          <rect key={x} x={x - 7} y="164" width="14" height="27" rx="7" />
        ))}
      </g>
      <Tile x={261} y={307} width={189} label="Событие" />
      <Layer show={step >= 1}>
        <Tile x={36} y={181} width={165} label="Условия" tone="cyan" />
        <Arrow d="M203 211H263M251 201L263 211 251 221" />
      </Layer>
      <Layer show={step >= 2}>
        <Tile x={515} y={122} width={180} label="Ближайший итог" tone="gold" />
        <Tile x={515} y={251} width={180} label="Поздний эффект" tone="green" />
        <path d="M425 209H460L513 153M460 209L513 282" className="cv-tree" />
      </Layer>
      <Layer show={step >= 3}>
        <text x="355" y="397" textAnchor="middle" className="cv-small-note">
          Для каждой связи нужны исторические основания
        </text>
      </Layer>
    </>
  );
}

function SocialVisual({ step, family }: { step: number; family: CurriculumVisualFamily }) {
  if (family === 'groups')
    return (
      <>
        <Person x={353} y={182} size={1.14} />
        <Layer show={step >= 1}>
          <ellipse cx="238" cy="191" rx="167" ry="135" className="cv-group-area cv-cyan" />
          <Person x={139} y={178} size={0.7} tone="cyan" />
          <Person x={215} y={114} size={0.55} tone="cyan" />
          <text x="171" y="353" className="cv-cyan">
            общность
          </text>
        </Layer>
        <Layer show={step >= 2}>
          <ellipse cx="467" cy="218" rx="167" ry="135" className="cv-group-area cv-gold" />
          <Person x={550} y={249} size={0.7} tone="gold" />
          <Person x={505} y={119} size={0.55} tone="gold" />
          <text x="478" y="379" className="cv-gold">
            роль
          </text>
        </Layer>
        <Layer show={step >= 3}>
          <path d="M171 173L313 180M394 198L520 243" className="cv-group-link" />
          <text x="350" y="41" textAnchor="middle" className="cv-canvas-title">
            Один человек — разные связи
          </text>
        </Layer>
      </>
    );
  if (family === 'law')
    return (
      <>
        <path d="M358 68L460 107V206Q447 275 358 307 270 275 256 206V107Z" className="cv-shield" />
        <path
          d="M358 123V255M310 255H405M295 154H420M306 154L279 211H332L306 154M409 154L382 211H435L409 154"
          className="cv-law-scale"
        />
        <Layer show={step >= 1}>
          <Tile x={30} y={78} width={180} label="Норма" tone="cyan" />
          <path d="M210 110H256" className="cv-tree" />
        </Layer>
        <Layer show={step >= 2}>
          <Tile x={493} y={171} width={199} label="Обстоятельства" tone="gold" />
          <path d="M458 202H492" className="cv-tree" />
        </Layer>
        <Layer show={step >= 3}>
          <Tile x={259} y={335} width={197} label="Обоснованный вывод" tone="green" />
        </Layer>
      </>
    );
  return (
    <>
      <g className="cv-institution">
        <path d="M229 143L357 66 488 143Z" />
        <path d="M229 159H488M221 301H496M214 318H503" />
        {[253, 317, 381, 445].map((x) => (
          <rect key={x} x={x} y="169" width="22" height="120" rx="4" />
        ))}
      </g>
      <Layer show={step >= 1}>
        <Tile x={20} y={77} width={178} label="Полномочие" tone="cyan" />
        <path d="M197 108H258" className="cv-tree" />
      </Layer>
      <Layer show={step >= 2}>
        <Tile x={523} y={180} width={173} label="Участники" tone="gold" />
        <path d="M489 210H522" className="cv-tree" />
      </Layer>
      <Layer show={step >= 3}>
        <Tile x={262} y={344} width={190} label="Решение" tone="green" />
        <path d="M358 320V343" className="cv-tree" />
      </Layer>
      <text x="358" y="44" textAnchor="middle" className="cv-small-note">
        Условный институт · функции уточняются по теме
      </text>
    </>
  );
}

function Visual({
  family,
  step,
  node,
  uid,
}: {
  family: CurriculumVisualFamily;
  step: number;
  node: CurriculumSceneNode;
  uid: string;
}) {
  if (family === 'absolute')
    return <AbsoluteVisual step={step} full={node.id === 'math-absolute'} />;
  if (family === 'algebra') return <AlgebraVisual step={step} />;
  if (family === 'graph' || family === 'market')
    return <GraphVisual step={step} market={family === 'market'} />;
  if (family === 'geometry')
    return <GeometryVisual step={step} circle={/окруж|круг/.test(node.title.toLowerCase())} />;
  if (family === 'solid') return <SolidVisual step={step} />;
  if (family === 'chance') return <ChanceVisual step={step} />;
  if (['morphology', 'syntax', 'spelling', 'writing'].includes(family))
    return <LanguageVisual step={step} family={family} />;
  if (['map', 'person', 'document', 'causes'].includes(family))
    return <HistoryVisual step={step} family={family} uid={uid} />;
  return <SocialVisual step={step} family={family} />;
}

function CurriculumPlayer({
  node,
  quality = 'high',
  reducedMotion = false,
  autoplay,
  initialSpeed = 1,
  persistenceKey,
  paused = false,
  onComplete,
}: CurriculumSceneProps) {
  const scene = useMemo(
    () => createCurriculumScene(node),
    [node.id, node.subject, node.title, node.section, node.keywords?.join('|')],
  );
  const family = node.id === 'math-absolute' ? 'absolute' : curriculumVisualFamily(node);
  const [systemReduced, setSystemReduced] = useState(
    () =>
      typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [drawing, setDrawing] = useState<'glow' | 'blueprint'>('glow');
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
  const uid = `cv-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const outline = useRef<HTMLDetailsElement>(null);
  const completed = useRef(false);
  const callback = useRef(onComplete);
  callback.current = onComplete;
  const step = scene.steps[cursor.step];
  const atEnd = cursor.step === scene.steps.length - 1;
  const fullLesson = node.id === 'math-absolute';
  const formulaVisible = manualFrame || motionOff || cursor.elapsedMs >= 1400;
  useEffect(() => {
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setSystemReduced(query.matches);
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    if (cursor.complete && !completed.current) {
      completed.current = true;
      callback.current?.();
    }
  }, [cursor.complete]);
  const replay = () => {
    completed.current = false;
    clock.replay();
  };
  const toggle = () => {
    if (cursor.complete) completed.current = false;
    clock.togglePlay();
  };
  const next = () => (atEnd ? clock.finish() : clock.goTo(cursor.step + 1));
  const keyboard = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape' && outline.current?.open) {
      event.preventDefault();
      outline.current.open = false;
      event.currentTarget.focus();
      return;
    }
    if (
      event.target instanceof Element &&
      event.target.closest('input,textarea,button,select,summary,a,[contenteditable="true"]')
    )
      return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      next();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      clock.goTo(cursor.step - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      clock.goTo(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      clock.goTo(scene.steps.length - 1);
    } else if (event.code === 'Space') {
      event.preventDefault();
      if (!event.repeat) toggle();
    }
  };
  return (
    <section
      className={`curriculum-scene cv-quality-${quality} cv-drawing-${drawing} ${motionOff ? 'cv-motion-off' : ''} ${manualFrame ? 'cv-manual' : ''}`}
      data-family={family}
      data-scene-id={node.id}
      aria-label={`${fullLesson ? 'Учебная сцена' : 'Визуальная карта'}: ${node.title}`}
      tabIndex={0}
      onKeyDown={keyboard}
      aria-keyshortcuts="Space ArrowLeft ArrowRight Home End"
    >
      <header className="cv-header">
        <div>
          <span className="cv-eyebrow">{scene.eyebrow}</span>
          <h3>{scene.title}</h3>
        </div>
        <details ref={outline} className="cv-outline">
          <summary aria-label="Оглавление визуальной сцены">
            <span>
              {String(cursor.step + 1).padStart(2, '0')} /{' '}
              {String(scene.steps.length).padStart(2, '0')}
            </span>
            <ChevronDown size={16} />
          </summary>
          <div>
            {scene.steps.map((item, index) => (
              <button
                key={item.id}
                type="button"
                aria-current={index === cursor.step ? 'step' : undefined}
                onClick={() => {
                  clock.goTo(index);
                  if (outline.current) outline.current.open = false;
                }}
              >
                <span>{index + 1}</span>
                {item.title}
              </button>
            ))}
          </div>
        </details>
      </header>
      <div ref={clock.bodyRef} className="cv-body" key={clock.revision}>
        <div className="cv-stage">
          <svg viewBox="0 0 720 410" role="img" aria-label={`${scene.title}. ${step.title}`}>
            <defs>
              <linearGradient id={`${uid}-skin`} x1="0" y1="0" x2="1" y2="1">
                <stop stopColor="#e6c49b" />
                <stop offset="1" stopColor="#a87963" />
              </linearGradient>
              <linearGradient id={`${uid}-paper`} x1="0" y1="0" x2="1" y2="1">
                <stop stopColor="#d7bb83" />
                <stop offset="1" stopColor="#aa895c" />
              </linearGradient>
            </defs>
            <Visual family={family} step={cursor.step} node={node} uid={uid} />
          </svg>
        </div>
        <aside className="cv-explanation" aria-live={playing ? 'off' : 'polite'}>
          <span className="cv-step-label">ШАГ {cursor.step + 1}</span>
          <h4>{step.title}</h4>
          <p>{step.narration}</p>
          {step.formula && (
            <div
              className="cv-formula"
              style={{ opacity: formulaVisible ? 1 : 0 }}
              aria-hidden={!formulaVisible}
            >
              {step.formula}
            </div>
          )}
          {cursor.complete && (
            <div className="cv-question">
              <span>Подумай</span>
              {scene.question}
            </div>
          )}
        </aside>
      </div>
      <div
        className="cv-progress"
        role="progressbar"
        aria-label="Ход визуальной сцены"
        aria-valuenow={Math.round(timelineProgress(scene, cursor.step, cursor.elapsedMs) * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span
          style={{ width: `${timelineProgress(scene, cursor.step, cursor.elapsedMs) * 100}%` }}
        />
      </div>
      <div className="cv-controls">
        <div className="cv-transport">
          <button
            className="cv-play"
            type="button"
            disabled={quality === 'static'}
            onClick={toggle}
          >
            {playing ? <Pause size={17} /> : <Play size={17} />}
            {playing ? 'Пауза' : cursor.complete ? 'Сначала' : 'Смотреть'}
          </button>
          <button
            type="button"
            onClick={replay}
            aria-label="Повторить визуальную сцену"
            title="Повторить"
          >
            <RotateCcw size={17} />
          </button>
          <button
            type="button"
            disabled={cursor.step === 0}
            onClick={() => clock.goTo(cursor.step - 1)}
            aria-label="Предыдущий шаг"
            title="Назад"
          >
            <ArrowLeft size={17} />
          </button>
          <button
            type="button"
            onClick={next}
            aria-label={atEnd ? 'Завершить просмотр сцены' : 'Следующий шаг'}
            title={atEnd ? 'Итог' : 'Далее'}
          >
            {atEnd ? <Check size={17} /> : <ArrowRight size={17} />}
          </button>
        </div>
        <div className="cv-options">
          <label>
            <span>Темп</span>
            <select
              aria-label="Скорость визуальной сцены"
              value={clock.speed}
              disabled={quality === 'static'}
              onChange={(e) => clock.setSpeed(Number(e.target.value))}
            >
              {[0.5, 1, 1.5, 2].map((value) => (
                <option key={value} value={value}>
                  {value}×
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Рисовка</span>
            <select
              aria-label="Стиль визуальной сцены"
              value={drawing}
              onChange={(e) => setDrawing(e.target.value as 'glow' | 'blueprint')}
            >
              <option value="glow">Сияние</option>
              <option value="blueprint">Чертёж</option>
            </select>
          </label>
        </div>
      </div>
      <p className="cv-caption">
        {fullLesson
          ? motionOff
            ? 'Без движения: все шаги доступны кнопками.'
            : 'Пробел — пауза. Стрелки — шаги, когда сцена в фокусе.'
          : 'Карта помогает увидеть структуру темы. Полный разбор и проверка знаний — отдельное занятие.'}
      </p>
    </section>
  );
}

export function CurriculumScene(props: CurriculumSceneProps) {
  return <CurriculumPlayer key={props.node.id} {...props} />;
}
