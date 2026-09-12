import { memo, type CSSProperties, type ReactNode } from 'react';
import { medianGeometry } from './geometry';

const C = {
  violet: '#b8a0ff',
  cyan: '#74dded',
  gold: '#f5cd83',
  green: '#8ee3b0',
  muted: '#8d91b6',
  white: '#f4f0ff',
  line: '#383656',
};
function Reveal({
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
      className={`sc-reveal ${show ? 'sc-visible' : 'sc-hidden'} ${className}`}
      style={{ opacity: show ? 1 : 0, pointerEvents: show ? 'auto' : 'none' }}
    >
      {children}
    </g>
  );
}
function Label({
  x,
  y,
  children,
  color = C.white,
  size = 20,
  anchor = 'middle',
}: {
  x: number;
  y: number;
  children: ReactNode;
  color?: string;
  size?: number;
  anchor?: 'start' | 'middle' | 'end';
}) {
  return (
    <text x={x} y={y} fill={color} textAnchor={anchor} fontSize={size} fontWeight="600">
      {children}
    </text>
  );
}
function Badge({
  x,
  y,
  children,
  color = C.violet,
  width = 130,
}: {
  x: number;
  y: number;
  children: ReactNode;
  color?: string;
  width?: number;
}) {
  return (
    <g>
      <rect
        x={x - width / 2}
        y={y - 22}
        width={width}
        height={38}
        rx="19"
        fill={color}
        fillOpacity=".1"
        stroke={color}
        strokeOpacity=".35"
      />
      <Label x={x} y={y + 3} color={color} size={15}>
        {children}
      </Label>
    </g>
  );
}

function Rectangle({ step: s }: { step: number }) {
  const filledRows = s >= 7 ? 4 : s >= 6 ? 2 : s >= 5 ? 1 : 0;
  return (
    <>
      <g opacity=".25">
        {Array.from({ length: 9 }, (_, i) => (
          <path key={i} d={`M ${115 + i * 60} 45 V 345`} stroke={C.line} strokeDasharray="2 7" />
        ))}
        {Array.from({ length: 6 }, (_, i) => (
          <path key={i} d={`M 115 ${45 + i * 60} H 655`} stroke={C.line} strokeDasharray="2 7" />
        ))}
      </g>
      <Reveal show={s === 0}>
        <circle
          cx="360"
          cy="190"
          r="62"
          fill={C.violet}
          fillOpacity=".07"
          stroke={C.violet}
          strokeOpacity=".3"
          strokeDasharray="3 9"
        />
        <Label x={360} y={184} color={C.violet} size={20}>
          Сколько места
        </Label>
        <Label x={360} y={215} color={C.violet} size={20}>
          внутри?
        </Label>
      </Reveal>
      <Reveal show={s >= 1}>
        <rect
          x="165"
          y="70"
          width="360"
          height="240"
          rx="2"
          fill="url(#sc-surface)"
          stroke={C.violet}
          strokeWidth="2.5"
          pathLength="1"
          className="sc-trace"
        />
      </Reveal>
      <Reveal show={s >= 4}>
        {Array.from({ length: 24 }, (_, i) => {
          const row = Math.floor(i / 6),
            col = i % 6;
          return (
            <rect
              key={i}
              x={165 + col * 60 + 3}
              y={70 + row * 60 + 3}
              width="54"
              height="54"
              rx="5"
              fill={row < filledRows ? (row === 0 ? C.cyan : C.violet) : '#302a49'}
              fillOpacity={row < filledRows ? 0.6 : 0.35}
              stroke={row < filledRows ? (row === 0 ? C.cyan : C.violet) : C.line}
              strokeOpacity=".8"
              className="sc-cell"
              style={{ transitionDelay: `${col * 55 + row * 85}ms` }}
            />
          );
        })}
      </Reveal>
      <Reveal show={s >= 2}>
        <path d="M165 51 V39 H525 V51" fill="none" stroke={C.cyan} strokeWidth="2" />
        <Label x={345} y={28} color={C.cyan}>
          a = 6 см
        </Label>
        <path d="M165 70 H525" stroke={C.cyan} strokeWidth="4" />
      </Reveal>
      <Reveal show={s >= 3}>
        <path d="M145 70 H134 V310 H145" fill="none" stroke={C.gold} strokeWidth="2" />
        <text
          x="104"
          y="190"
          fill={C.gold}
          textAnchor="middle"
          fontWeight="600"
          fontSize="20"
          transform="rotate(-90 104 190)"
        >
          b = 4 см
        </text>
        <path d="M165 70 V310" stroke={C.gold} strokeWidth="4" />
      </Reveal>
      <Reveal show={s >= 5 && s < 8}>
        <path d="M547 100 H573" stroke={C.cyan} strokeWidth="2" />
        <Label x={625} y={107} color={C.cyan} size={18}>
          6 клеток
        </Label>
        <Label x={345} y={350} color={C.violet} size={21}>
          {filledRows === 4
            ? '6 + 6 + 6 + 6 = 24'
            : filledRows === 2
              ? '6 + 6 = 12'
              : 'Один ряд — 6 клеток'}
        </Label>
      </Reveal>
      <Reveal show={s >= 8}>
        <Badge x={345} y={357} color={s >= 10 ? C.green : C.violet} width={310}>
          {s === 8
            ? '6 клеток × 4 ряда'
            : s === 9
              ? 'Подставляем длину и ширину'
              : s === 10
                ? '24 единичных квадрата'
                : 'Добавь мысленно один столбец'}
        </Badge>
      </Reveal>
      <Reveal show={s >= 11}>
        {Array.from({ length: 4 }, (_, i) => (
          <rect
            key={i}
            x="533"
            y={73 + i * 60}
            width="54"
            height="54"
            rx="5"
            fill={C.gold}
            fillOpacity=".1"
            stroke={C.gold}
            strokeDasharray="5 6"
          />
        ))}
        <Label x={559} y={55} color={C.gold}>
          +1
        </Label>
      </Reveal>
    </>
  );
}

function Triangle({ step: s }: { step: number }) {
  return (
    <>
      <path d="M105 304 H613" stroke={C.line} strokeWidth="1" />
      <Reveal show={s >= 3}>
        <path
          d="M240 100 L560 100 L465 300 Z"
          fill={C.cyan}
          fillOpacity=".17"
          stroke={C.cyan}
          strokeWidth="2"
          strokeDasharray={s < 4 ? '7 7' : undefined}
          pathLength="1"
          className="sc-trace"
        />
        <Label x={421} y={173} color={C.cyan} size={19}>
          Точная копия
        </Label>
      </Reveal>
      <path
        d="M145 300 L240 100 L465 300 Z"
        fill="url(#sc-triangle)"
        stroke={C.violet}
        strokeWidth="2.5"
      />
      <Reveal show={s >= 1}>
        <path d="M145 300 H465" stroke={C.cyan} strokeWidth="4" />
        <path d="M145 320 V332 H465 V320" stroke={C.cyan} strokeWidth="1.5" fill="none" />
        <Label x={305} y={359} color={C.cyan}>
          a = 8 см
        </Label>
      </Reveal>
      <Reveal show={s >= 2}>
        <path
          d="M240 100 V300"
          stroke={C.gold}
          strokeWidth="2.5"
          strokeDasharray="6 5"
          pathLength="1"
          className="sc-trace"
        />
        <path d="M240 282 H258 V300" fill="none" stroke={C.gold} strokeWidth="2" />
        <Label x={190} y={214} color={C.gold} size={18}>
          h = 5 см
        </Label>
      </Reveal>
      <Reveal show={s >= 4}>
        <path d="M145 300 L240 100 H560 L465 300 Z" stroke={C.cyan} strokeWidth="1" fill="none" />
        <Badge x={360} y={49} color={C.cyan} width={280}>
          Два треугольника = a · h
        </Badge>
      </Reveal>
      <Reveal show={s >= 5}>
        <Label x={340} y={255} color={C.white} size={s >= 7 ? 36 : 26}>
          {s >= 7 ? '20 см²' : '½'}
        </Label>
        <circle cx="145" cy="300" r="4" fill={C.cyan} />
        <circle cx="240" cy="100" r="4" fill={C.gold} />
        <circle cx="465" cy="300" r="4" fill={C.cyan} />
      </Reveal>
    </>
  );
}

function Median({ step: s }: { step: number }) {
  const m = s >= 5 ? 360 : 450;
  return (
    <>
      <path
        d="M135 305 L230 70 L585 305 Z"
        fill="url(#sc-triangle)"
        stroke={C.violet}
        strokeWidth="2"
      />
      <Reveal show={s >= 3}>
        <path d="M135 305 H585" stroke={C.cyan} strokeWidth="4" />
      </Reveal>
      {[
        { x: 230, y: 70, label: 'A', active: s === 1 },
        { x: 135, y: 305, label: 'B', active: s === 2 },
        { x: 585, y: 305, label: 'C', active: s === 2 },
      ].map((p) => (
        <g key={p.label}>
          <circle
            cx={p.x}
            cy={p.y}
            r={p.active ? 13 : 5}
            fill={p.active ? C.gold : C.violet}
            fillOpacity={p.active ? 0.3 : 1}
          />
          <circle cx={p.x} cy={p.y} r="5" fill={p.active ? C.gold : C.violet} />
          <Label
            x={p.x + (p.label === 'B' ? -22 : p.label === 'C' ? 22 : 0)}
            y={p.y + (p.label === 'A' ? -20 : 30)}
            color={p.active ? C.gold : C.white}
            size={24}
          >
            {p.label}
          </Label>
        </g>
      ))}
      <Reveal show={s >= 4}>
        <circle cx={m} cy="305" r="6" fill={C.cyan} className="sc-median-point" />
        <text
          x={360}
          y="340"
          textAnchor="middle"
          fill={C.cyan}
          fontSize="23"
          fontWeight="600"
          className="sc-median-point"
          style={{ transform: `translateX(${m - 360}px)` }}
        >
          M
        </text>
      </Reveal>
      <Reveal show={s >= 6}>
        <path d="M185 296 l-7 18 M475 296 l-7 18" stroke={C.cyan} strokeWidth="3" />
        <Label x={248} y={363} color={C.cyan} size={18}>
          BM
        </Label>
        <Label x={361} y={363} color={C.cyan} size={20}>
          =
        </Label>
        <Label x={473} y={363} color={C.cyan} size={18}>
          MC
        </Label>
      </Reveal>
      <Reveal show={s >= 7}>
        <path
          d="M230 70 L360 305"
          stroke={C.cyan}
          strokeWidth="3.5"
          pathLength="1"
          className="sc-trace"
        />
        <Badge x={432} y={123} color={C.cyan} width={175}>
          AM — медиана
        </Badge>
      </Reveal>
      <Reveal show={s >= 9}>
        <path d="M230 70 V305" stroke={C.gold} strokeWidth="2" strokeDasharray="6 5" />
        <path d="M230 286 H249 V305" fill="none" stroke={C.gold} strokeWidth="1.5" />
        <Label x={230} y={333} color={C.gold} size={19}>
          H
        </Label>
        <Label x={166} y={185} color={C.gold} size={15}>
          Высота
        </Label>
      </Reveal>
      <Reveal show={s >= 10}>
        <path
          d={`M230 70 L${medianGeometry.L.x} 305`}
          stroke={C.green}
          strokeWidth="2"
          strokeDasharray="4 4"
        />
        <path
          d="M215 107 Q230 116 243 109 M244 110 Q258 105 268 95"
          fill="none"
          stroke={C.green}
          strokeWidth="2"
        />
        <Label x={medianGeometry.L.x} y={334} color={C.green} size={19}>
          L
        </Label>
        <Label x={444} y={193} color={C.green} size={15}>
          AL — биссектриса
        </Label>
      </Reveal>
      <Reveal show={s >= 11}>
        <Label x={360} y={398} color={C.muted} size={15}>
          Середина стороны · Прямой угол · Равные углы
        </Label>
      </Reveal>
    </>
  );
}

function Fraction({ step: s }: { step: number }) {
  return (
    <>
      <rect
        x="188"
        y="91"
        width="364"
        height="208"
        rx="22"
        fill="url(#sc-surface)"
        stroke={C.violet}
        strokeWidth="2"
      />
      <Reveal show={s >= 1}>
        {Array.from({ length: 8 }, (_, i) => (
          <rect
            key={i}
            x={193 + (i % 4) * 90}
            y={96 + Math.floor(i / 4) * 100}
            width="84"
            height="94"
            rx="12"
            fill={(s >= 4 && i < 3) || (s >= 3 && i === 0) ? C.violet : '#29243e'}
            stroke={(s >= 4 && i < 3) || (s >= 3 && i === 0) ? '#d2bfff' : '#51476b'}
            fillOpacity={(s >= 4 && i < 3) || (s >= 3 && i === 0) ? 0.7 : 0.7}
            className="sc-cell"
            style={{ transitionDelay: `${i * 75}ms` }}
          />
        ))}
      </Reveal>
      <Reveal show={s >= 2 && s < 5}>
        {Array.from({ length: 8 }, (_, i) => (
          <Label
            key={i}
            x={235 + (i % 4) * 90}
            y={152 + Math.floor(i / 4) * 100}
            color={i < (s >= 4 ? 3 : s >= 3 ? 1 : 0) ? C.white : C.muted}
            size={22}
          >
            {i + 1}
          </Label>
        ))}
      </Reveal>
      <Reveal show={s >= 5}>
        <path d="M189 317 V330 H551 V317" fill="none" stroke={C.cyan} strokeWidth="1.5" />
        <Label x={370} y={358} color={C.cyan} size={19}>
          8 равных частей в целом
        </Label>
      </Reveal>
      <Reveal show={s >= 6}>
        <path d="M195 77 V65 H460 V77" fill="none" stroke={C.violet} strokeWidth="1.5" />
        <Label x={328} y={48} color={C.violet} size={19}>
          3 взятые части
        </Label>
      </Reveal>
      <Reveal show={s >= 5}>
        <Label x={107} y={172} color={s >= 6 ? C.violet : C.muted} size={45}>
          {s >= 6 ? '3' : '?'}
        </Label>
        <path d="M78 189 H137" stroke={C.white} strokeWidth="2.5" />
        <Label x={107} y={239} color={C.cyan} size={45}>
          8
        </Label>
      </Reveal>
      <Reveal show={s >= 7}>
        <Badge x={630} y={204} color={C.green} width={94}>
          3/8
        </Badge>
      </Reveal>
    </>
  );
}

function FractionNumber({
  x,
  y,
  top,
  bottom,
  active,
}: {
  x: number;
  y: number;
  top: string;
  bottom: string;
  active?: 'top' | 'bottom';
}) {
  return (
    <g>
      <Label x={x} y={y - 12} color={active === 'bottom' ? C.muted : C.violet} size={37}>
        {top}
      </Label>
      <path d={`M${x - 25} ${y + 2} H${x + 25}`} stroke={C.white} strokeWidth="2" />
      <Label x={x} y={y + 48} color={active === 'top' ? C.muted : C.cyan} size={37}>
        {bottom}
      </Label>
    </g>
  );
}

function Multiply({ step: s }: { step: number }) {
  return (
    <>
      <FractionNumber
        x={100}
        y={190}
        top="2"
        bottom="3"
        active={s === 4 ? 'top' : s === 5 ? 'bottom' : undefined}
      />
      <FractionNumber
        x={617}
        y={190}
        top="3"
        bottom="4"
        active={s === 4 ? 'top' : s === 5 ? 'bottom' : undefined}
      />
      <Label x={100} y={287} color={C.violet} size={17}>
        2 строки
      </Label>
      <Label x={617} y={287} color={C.cyan} size={17}>
        3 столбца
      </Label>
      <rect
        x="212"
        y="80"
        width="280"
        height="210"
        rx="10"
        fill="url(#sc-surface)"
        stroke={C.line}
        strokeWidth="2"
      />
      {Array.from({ length: 12 }, (_, i) => {
        const row = Math.floor(i / 4),
          col = i % 4;
        const selected = s >= 3 && row < 2 && col < 3;
        const fill = selected
          ? C.violet
          : s >= 2 && row < 2
            ? C.gold
            : s >= 1 && col < 3
              ? C.cyan
              : '#27223c';
        return (
          <rect
            key={i}
            x={215 + col * 70}
            y={83 + row * 70}
            width="64"
            height="64"
            rx="7"
            fill={fill}
            fillOpacity={selected ? 0.85 : 0.18}
            stroke={s > 0 ? fill : 'transparent'}
            strokeOpacity=".65"
            className="sc-cell"
          />
        );
      })}
      <Reveal show={s >= 1}>
        <path d="M212 62 V50 H422 V62" stroke={C.cyan} fill="none" strokeWidth="2" />
        <Label x={317} y={36} color={C.cyan} size={17}>
          3 из 4 столбцов
        </Label>
      </Reveal>
      <Reveal show={s >= 2}>
        <path d="M202 80 H187 V220 H202" stroke={C.gold} fill="none" strokeWidth="2" />
      </Reveal>
      <Reveal show={s >= 3}>
        <Badge x={352} y={340} color={s >= 7 ? C.green : C.violet} width={s >= 7 ? 320 : 240}>
          {s >= 7 ? '6 клеток из 12 — половина' : '6 клеток в пересечении'}
        </Badge>
      </Reveal>
      <Reveal show={s >= 7}>
        <path d="M212 295 H492" stroke={C.green} strokeWidth="3" />
        <Label x={353} y={389} color={C.green} size={20}>
          Числитель и знаменатель делим на 6
        </Label>
      </Reveal>
    </>
  );
}

function Percent({ step: s }: { step: number }) {
  return (
    <>
      <circle cx="333" cy="196" r="126" fill="url(#sc-surface)" stroke={C.line} strokeWidth="2" />
      <Reveal show={s >= 2}>
        <path d="M333 70 V322 M207 196 H459" stroke={C.violet} strokeWidth="2" />
        <Label x={278} y={148} color={C.violet} size={19}>
          25%
        </Label>
        <Label x={391} y={148} color={C.violet} size={19}>
          {s < 3 ? '25%' : ''}
        </Label>
        <Label x={278} y={260} color={C.violet} size={19}>
          25%
        </Label>
        <Label x={391} y={260} color={C.violet} size={19}>
          25%
        </Label>
      </Reveal>
      <Reveal show={s >= 3}>
        <path
          d="M333 196 V70 A126 126 0 0 1 459 196 Z"
          fill={C.violet}
          fillOpacity=".55"
          stroke={C.violet}
          strokeWidth="2"
        />
        <Label x={389} y={150} color={C.white} size={25}>
          {s >= 4 ? '20' : '25%'}
        </Label>
      </Reveal>
      <circle cx="333" cy="196" r="48" fill="#151329" stroke={C.line} strokeWidth="1.5" />
      <Label x={333} y={192} size={31}>
        80
      </Label>
      <Label x={333} y={217} color={C.muted} size={14}>
        целое
      </Label>
      <Reveal show={s < 2}>
        <Label x={333} y={40} color={C.violet} size={22}>
          100%
        </Label>
      </Reveal>
      <Reveal show={s >= 1}>
        <Badge x={575} y={174} color={C.cyan} width={145}>
          1% = 1/100
        </Badge>
      </Reveal>
      <Reveal show={s >= 3}>
        <Badge x={575} y={227} color={C.violet} width={145}>
          25% = 1/4
        </Badge>
      </Reveal>
      <Label x={333} y={371} color={s >= 4 ? C.green : C.muted} size={22}>
        {s >= 4
          ? '80 ÷ 4 = 20'
          : s >= 2
            ? 'Четыре одинаковые доли'
            : 'Вся величина — сто процентов'}
      </Label>
    </>
  );
}

function Russian({ id, step: s }: { id: string; step: number }) {
  if (id === 'ne-ni')
    return (
      <>
        <Label x={360} y={79} color={C.muted} size={16}>
          ПРОЧИТАЙ И НАЙДИ СМЫСЛ
        </Label>
        <text x="360" y="165" textAnchor="middle" fontSize="30" fill={C.white} fontWeight="500">
          Я <tspan fill={s >= 1 ? C.violet : C.white}>не пропустил</tspan>
        </text>
        <text x="360" y="219" textAnchor="middle" fontSize="30" fill={C.white} fontWeight="500">
          <tspan fill={s >= 2 ? C.cyan : C.white}>ни одного</tspan> занятия.
        </text>
        <Reveal show={s >= 1}>
          <path d="M303 179 H454" stroke={C.violet} strokeWidth="3" />
          <Badge x={211} y={311} color={C.violet} width={185}>
            НЕ — отрицает
          </Badge>
          <path d="M320 238 Q280 265 220 283" stroke={C.violet} strokeWidth="1.5" fill="none" />
        </Reveal>
        <Reveal show={s >= 2}>
          <Badge x={494} y={311} color={C.cyan} width={195}>
            НИ — усиливает
          </Badge>
          <path d="M335 240 Q420 269 490 283" stroke={C.cyan} strokeWidth="1.5" fill="none" />
        </Reveal>
        <Reveal show={s >= 3}>
          <Label x={360} y={383} color={C.green} size={18}>
            Смысл: не пропустил даже одного занятия
          </Label>
        </Reveal>
      </>
    );
  const syntax = id === 'syntax';
  const bases = syntax ? s >= 1 : s >= 1;
  const second = syntax ? s >= 2 : s >= 1;
  const clauses = syntax ? s >= 3 : s >= 2;
  const comma = syntax || s >= 3;
  return (
    <>
      <Reveal show={clauses}>
        <rect
          x="80"
          y="93"
          width="560"
          height="91"
          rx="16"
          fill={C.violet}
          fillOpacity=".08"
          stroke={C.violet}
          strokeOpacity=".3"
        />
        <rect
          x="80"
          y="208"
          width="560"
          height="91"
          rx="16"
          fill={C.cyan}
          fillOpacity=".06"
          stroke={C.cyan}
          strokeOpacity=".3"
        />
        <Label x={100} y={80} color={C.violet} anchor="start" size={14}>
          ПРИДАТОЧНАЯ ЧАСТЬ
        </Label>
        <Label x={100} y={327} color={C.cyan} anchor="start" size={14}>
          ГЛАВНАЯ ЧАСТЬ
        </Label>
      </Reveal>
      <text x="110" y="145" fill={C.white} fontSize="29" fontWeight="500">
        <tspan
          x="110"
          textLength="88"
          lengthAdjust="spacingAndGlyphs"
          fill={clauses ? C.violet : C.white}
        >
          Когда
        </tspan>
        <tspan x="210" textLength="145" lengthAdjust="spacingAndGlyphs">
          наступила
        </tspan>
        <tspan x="368" textLength="87" lengthAdjust="spacingAndGlyphs">
          весна
        </tspan>
        <tspan x="458" fill={C.gold} opacity={comma ? 1 : 0} fontSize="40">
          ,
        </tspan>
      </text>
      <text x="110" y="264" fill={C.white} fontSize="29" fontWeight="500">
        <tspan x="110" textLength="91" lengthAdjust="spacingAndGlyphs">
          птицы
        </tspan>
        <tspan x="215" textLength="151" lengthAdjust="spacingAndGlyphs">
          вернулись
        </tspan>
        <tspan x="380" textLength="102" lengthAdjust="spacingAndGlyphs">
          домой.
        </tspan>
      </text>
      <Reveal show={bases}>
        <path d="M210 158 H355 M210 164 H355 M368 158 H455" stroke={C.violet} strokeWidth="2" />
      </Reveal>
      <Reveal show={second}>
        <path d="M110 277 H201 M215 277 H366 M215 283 H366" stroke={C.cyan} strokeWidth="2" />
      </Reveal>
      <Reveal show={clauses && !syntax && !comma}>
        <circle
          cx="477"
          cy="135"
          r="22"
          fill={C.gold}
          fillOpacity=".1"
          stroke={C.gold}
          strokeDasharray="3 4"
        />
        <Label x={477} y={143} color={C.gold} size={23}>
          ?
        </Label>
      </Reveal>
      <Reveal show={syntax ? s >= 4 : s >= 4}>
        <path
          d="M648 257 Q691 202 648 135"
          stroke={C.gold}
          fill="none"
          strokeWidth="2"
          markerEnd="url(#sc-arrow-gold)"
        />
        <text
          x="685"
          y="207"
          textAnchor="middle"
          fill={C.gold}
          fontSize="15"
          transform="rotate(-90 685 207)"
        >
          когда?
        </text>
      </Reveal>
      <Label x={360} y={379} color={C.muted} size={17}>
        {bases
          ? 'Одна черта — подлежащее. Две — сказуемое.'
          : 'Сначала найди, о ком или о чём говорится.'}
      </Label>
    </>
  );
}

function Person({
  x,
  y,
  color = C.violet,
  scale = 1,
  royal = false,
}: {
  x: number;
  y: number;
  color?: string;
  scale?: number;
  royal?: boolean;
}) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <ellipse cx="0" cy="115" rx="40" ry="9" fill="#090716" fillOpacity=".65" />
      <path
        d="M-19 23 Q-40 41 -43 104 Q-2 119 42 104 Q35 43 19 23Z"
        fill={color}
        fillOpacity=".75"
        stroke={color}
        strokeWidth="1.5"
      />
      <path d="M-9 27 L-17 108 H20 L9 27Z" fill="#272037" />
      <path d="M-13 34 L13 34 M-15 42 L15 42 M-18 82 H20" stroke={C.gold} strokeWidth="3" />
      <circle cx="0" cy="1" r="20" fill="#d7bba0" />
      <path d="M-20 -2 Q-21 -29 3 -23 Q21 -23 22 0 Q8 -13 -5 -12Z" fill="#55413e" />
      <path d="M-14 10 Q0 41 15 10 Q2 20 -14 10Z" fill="#675046" />
      {royal && (
        <>
          <path
            d="M-24 -14 L-27 -36 L-10 -27 L0 -42 L11 -27 L26 -36 L23 -14Z"
            fill={C.gold}
            stroke="#fce0a4"
            strokeWidth="1.5"
          />
          <circle cx="0" cy="-25" r="4" fill={color} />
        </>
      )}
      <path
        d="M-34 56 L-44 85 M34 56 L44 84"
        stroke="#d7bba0"
        strokeWidth="9"
        strokeLinecap="round"
      />
      <path
        d="M-14 111 V123 M15 111 V123"
        stroke="#3b2d36"
        strokeWidth="12"
        strokeLinecap="round"
      />
    </g>
  );
}

function Church({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <path
        d="M-57 70 V-6 H-27 V-29 H27 V-6 H57 V70Z"
        fill="#b5b3bc"
        stroke="#d9ced0"
        strokeWidth="2"
      />
      <path d="M-30 -30 Q-34 -48 0 -70 Q34 -48 30 -30Z" fill={C.gold} />
      <path
        d="M-56 -7 Q-58 -21 -43 -34 Q-26 -20 -29 -7Z M29 -7 Q27 -22 43 -34 Q59 -21 56 -7Z"
        fill="#a68766"
      />
      <path d="M0 -69 V-89 M-9 -81 H9" stroke={C.gold} strokeWidth="4" />
      <path d="M-12 70 V30 A12 12 0 0 1 12 30 V70" fill="#403d5b" />
      <path
        d="M-43 16 V36 M43 16 V36 M0 -12 V7"
        stroke="#565169"
        strokeWidth="9"
        strokeLinecap="round"
      />
    </g>
  );
}

function MapArt({ reform = false }: { reform?: boolean }) {
  return (
    <g>
      <path
        d={
          reform
            ? 'M70 130 L99 87 L150 96 L185 66 L240 92 L292 66 L338 88 L366 62 L399 101 L450 83 L481 116 L545 103 L565 148 L606 146 L645 190 L604 213 L587 249 L528 243 L488 268 L430 241 L397 281 L346 273 L319 316 L264 298 L234 320 L203 278 L169 264 L169 218 L114 195 L89 158Z'
            : 'M115 80 L158 64 L190 84 L231 71 L264 96 L295 89 L323 113 L309 143 L332 167 L315 203 L340 233 L315 263 L319 294 L282 317 L264 345 L223 333 L198 344 L184 313 L155 295 L159 262 L132 236 L143 201 L118 180 L126 150 L105 119Z'
        }
        fill="url(#sc-map)"
        stroke="#71687f"
        strokeWidth="1.5"
      />
      <path
        d={
          reform
            ? 'M165 91 Q192 158 206 203 T255 293 M338 90 Q312 151 350 212 T346 273 M480 119 Q434 165 460 219'
            : 'M221 92 Q176 128 215 183 T215 272 Q214 302 247 336'
        }
        fill="none"
        stroke={C.cyan}
        strokeWidth="2"
        strokeOpacity=".48"
      />
      <g fill={C.gold} fillOpacity=".36">
        {[
          { x: 160, y: 112 },
          { x: 273, y: 123 },
          { x: 167, y: 248 },
          { x: 284, y: 267 },
          { x: 240, y: 161 },
        ].map((p, i) => (
          <path key={i} d={`M${p.x - 6} ${p.y + 6} l6 -12 l6 12Z`} />
        ))}
      </g>
      <path
        d="M79 327 V286 M65 300 L79 286 L92 300"
        fill="none"
        stroke={C.muted}
        strokeOpacity=".45"
      />
      <Label x={79} y={274} color={C.muted} size={12}>
        С
      </Label>
    </g>
  );
}

function History({ id, step: s }: { id: string; step: number }) {
  const reform = id === 'reform';
  if (reform)
    return (
      <>
        <g opacity={s >= 3 ? 0.3 : 0.65}>
          <MapArt reform />
        </g>
        <Reveal show={s >= 1}>
          <Person x={169} y={151} royal color="#849eb7" scale={1.1} />
          <Badge x={166} y={331} color={C.cyan} width={170}>
            Александр II
          </Badge>
        </Reveal>
        <Reveal show={s >= 2 && s < 4}>
          <Badge x={435} y={49} color={C.gold} width={300}>
            Назрела необходимость реформ
          </Badge>
        </Reveal>
        <Reveal show={s >= 3}>
          <g transform="translate(374 85)">
            <path
              d="M-51 0 H136 Q150 0 150 14 V184 H-39 Q-54 184 -54 172Z"
              fill="#d8c7aa"
              stroke="#efd9ac"
              strokeWidth="2"
            />
            <path d="M-51 0 Q-67 0 -67 15 H-37 Q-35 0 -51 0Z" fill="#a89177" />
            <text x="46" y="36" textAnchor="middle" fill="#544442" fontSize="17" fontWeight="700">
              МАНИФЕСТ
            </text>
            <path
              d="M-20 55 H113 M-20 65 H113 M-20 81 H104 M-20 91 H113 M-20 107 H95"
              stroke="#8c7764"
              strokeWidth="2"
              opacity=".65"
            />
            <circle cx="68" cy="144" r="20" fill="#7e4561" />
            <path d="M58 160 L52 183 L70 175 L83 184 L79 159" fill="#7e4561" />
            <Label x={46} y={222} color={C.gold} size={34}>
              1861
            </Label>
          </g>
        </Reveal>
        <Reveal show={s >= 4}>
          <Badge x={246} y={49} color={C.green} width={200}>
            Личная свобода
          </Badge>
        </Reveal>
        <Reveal show={s >= 5}>
          <Badge x={507} y={49} color={C.gold} width={235}>
            Земля — через выкуп
          </Badge>
        </Reveal>
        <Label x={360} y={390} color={C.muted} size={14}>
          {s >= 6
            ? 'Свобода получена. Земельный вопрос остался сложным.'
            : 'Карта и персонаж — учебная стилизация'}
        </Label>
      </>
    );
  return (
    <>
      <MapArt />
      <Reveal show={s >= 1}>
        <circle
          cx="215"
          cy="246"
          r="24"
          fill={C.gold}
          fillOpacity=".1"
          stroke={C.gold}
          strokeOpacity=".3"
        />
        <circle cx="215" cy="246" r="6" fill={C.gold} />
        <path d="M222 243 L272 219 H311" fill="none" stroke={C.gold} strokeWidth="1.5" />
        <Label x={282} y={209} color={C.gold} size={19}>
          Киев
        </Label>
      </Reveal>
      <Reveal show={s >= 2}>
        <Person x={429} y={159} royal color="#9072b4" scale={1.1} />
        <Badge x={429} y={326} color={C.violet} width={190}>
          Князь Владимир
        </Badge>
      </Reveal>
      <Reveal show={s >= 3}>
        <Badge x={255} y={36} color={C.gold} width={300}>
          {s < 4 ? 'Власть и международные связи' : 'Принятие христианства'}
        </Badge>
      </Reveal>
      <Reveal show={s >= 4}>
        <Church x={599} y={216} scale={0.75} />
        <Label x={593} y={114} color={C.gold} size={44}>
          988
        </Label>
      </Reveal>
      <Reveal show={s >= 5}>
        <path
          d="M497 301 Q543 334 609 313"
          fill="none"
          stroke={C.cyan}
          strokeWidth="1.5"
          markerEnd="url(#sc-arrow-cyan)"
        />
        <Label x={595} y={354} color={C.cyan} size={17}>
          Книжность · культура
        </Label>
      </Reveal>
      <Label x={360} y={393} color={C.muted} size={14}>
        Условная карта · 988 — традиционная дата события
      </Label>
    </>
  );
}

function Demand({ step: s }: { step: number }) {
  return (
    <>
      <Reveal show={s === 0}>
        <Person x={196} y={152} color={C.violet} />
        <Person x={526} y={152} color={C.cyan} />
        <path
          d="M283 161 L360 114 L434 161 V281 H284Z"
          fill="#2f2848"
          stroke={C.gold}
          strokeWidth="2"
        />
        <path d="M270 161 H447" stroke={C.gold} strokeWidth="5" />
        <path
          d="M306 163 V269 M338 163 V269 M374 163 V269 M410 163 V269"
          stroke={C.gold}
          strokeOpacity=".35"
          strokeWidth="12"
        />
        <Badge x={358} y={335} color={C.gold} width={175}>
          Рынок
        </Badge>
        <Label x={195} y={322} color={C.violet} size={17}>
          Покупатель
        </Label>
        <Label x={526} y={322} color={C.cyan} size={17}>
          Продавец
        </Label>
      </Reveal>
      <Reveal show={s >= 1}>
        <g stroke={C.line} opacity=".55">
          {[95, 155, 215, 275].map((y) => (
            <path key={y} d={`M150 ${y} H586`} />
          ))}
          {[235, 320, 405, 490, 575].map((x) => (
            <path key={x} d={`M${x} 70 V326`} />
          ))}
        </g>
        <path d="M150 57 V326 H604" fill="none" stroke={C.muted} strokeWidth="2" />
        <path
          d="M144 70 L150 57 L156 70 M591 320 L604 326 L591 332"
          stroke={C.muted}
          strokeWidth="2"
          fill="none"
        />
        <Label x={128} y={47} color={C.white}>
          P
        </Label>
        <Label x={627} y={334} color={C.white}>
          Q
        </Label>
        <Label x={371} y={375} color={C.muted} size={15}>
          Количество товара
        </Label>
        <text
          x="100"
          y="200"
          fill={C.muted}
          fontSize="15"
          textAnchor="middle"
          transform="rotate(-90 100 200)"
        >
          Цена
        </text>
      </Reveal>
      <Reveal show={s >= 2}>
        <path
          d="M199 95 L547 288"
          fill="none"
          stroke={C.violet}
          strokeWidth="4"
          pathLength="1"
          className="sc-trace"
        />
        <Badge x={595} y={279} color={C.violet} width={102}>
          Спрос
        </Badge>
      </Reveal>
      <Reveal show={s >= 3}>
        <path
          d="M199 288 L547 95"
          fill="none"
          stroke={C.cyan}
          strokeWidth="4"
          pathLength="1"
          className="sc-trace"
        />
        <Badge x={585} y={78} color={C.cyan} width={171}>
          Предложение
        </Badge>
      </Reveal>
      <Reveal show={s >= 4}>
        <path
          d="M150 191.5 H373 V326"
          fill="none"
          stroke={C.gold}
          strokeWidth="1.5"
          strokeDasharray="5 5"
        />
        <circle cx="373" cy="191.5" r="16" fill={C.gold} fillOpacity=".15" />
        <circle cx="373" cy="191.5" r="6" fill={C.gold} />
        <Label x={396} y={222} color={C.gold} size={18}>
          E
        </Label>
        <Label x={129} y={200} color={C.gold} size={18}>
          P*
        </Label>
        <Label x={373} y={352} color={C.gold} size={18}>
          Q*
        </Label>
      </Reveal>
      <Reveal show={s >= 5}>
        <path
          d="M150 126 H493"
          fill="none"
          stroke={C.green}
          strokeWidth="1.5"
          strokeDasharray="3 4"
        />
        <path d="M255 121 V111 H491 V121" fill="none" stroke={C.green} strokeWidth="2" />
        <Label x={373} y={97} color={C.green} size={17}>
          Избыток
        </Label>
        <circle cx="255" cy="126" r="4" fill={C.green} />
        <circle cx="491" cy="126" r="4" fill={C.green} />
      </Reveal>
    </>
  );
}

function Groups({ step: s }: { step: number }) {
  return (
    <>
      <circle
        cx="361"
        cy="206"
        r="63"
        fill={C.violet}
        fillOpacity=".08"
        stroke={C.violet}
        strokeOpacity=".4"
      />
      <Person x={361} y={175} scale={0.55} color={C.violet} />
      <Label x={361} y={304} color={C.white} size={19}>
        Один человек
      </Label>
      <Reveal show={s >= 1}>
        <path d="M298 201 L217 148" fill="none" stroke={C.gold} strokeWidth={s >= 4 ? 2.5 : 1.5} />
        <circle
          cx="166"
          cy="112"
          r="64"
          fill={C.gold}
          fillOpacity=".07"
          stroke={C.gold}
          strokeOpacity=".4"
        />
        <Person x={151} y={90} scale={0.38} color={C.gold} />
        <Person x={182} y={104} scale={0.29} color="#e4a47a" />
        <Badge x={165} y={201} color={C.gold} width={106}>
          Семья
        </Badge>
      </Reveal>
      <Reveal show={s >= 2}>
        <path d="M422 196 L512 140" fill="none" stroke={C.cyan} strokeWidth={s >= 4 ? 2.5 : 1.5} />
        <circle
          cx="562"
          cy="112"
          r="70"
          fill={C.cyan}
          fillOpacity=".07"
          stroke={C.cyan}
          strokeOpacity=".4"
        />
        {[-27, 0, 27].map((x, i) => (
          <Person key={x} x={562 + x} y={i === 1 ? 78 : 92} scale={0.32} color={C.cyan} />
        ))}
        <Badge x={562} y={207} color={C.cyan} width={143}>
          Учебный класс
        </Badge>
      </Reveal>
      <Reveal show={s >= 3}>
        <path d="M361 145 V100" fill="none" stroke={C.green} strokeWidth={s >= 4 ? 2.5 : 1.5} />
        <Badge x={360} y={72} color={C.green} width={170}>
          Молодёжь
        </Badge>
        <path
          d="M258 97 Q361 129 466 97"
          fill="none"
          stroke={C.green}
          strokeOpacity=".45"
          strokeDasharray="4 5"
        />
      </Reveal>
      <Reveal show={s >= 4}>
        <Label x={360} y={361} color={C.violet} size={20}>
          Каждая группа — отдельная связь
        </Label>
      </Reveal>
      <Label x={360} y={398} color={C.muted} size={14}>
        {s >= 3
          ? 'Малая группа: личное общение. Большая: общие социальные признаки.'
          : 'Участники группы связаны общением, деятельностью или общими признаками.'}
      </Label>
    </>
  );
}

export const SceneVisual = memo(function SceneVisual({
  sceneId,
  step,
}: {
  sceneId: string;
  step: number;
}) {
  const views: Record<string, ReactNode> = {
    rectangle: <Rectangle step={step} />,
    triangle: <Triangle step={step} />,
    median: <Median step={step} />,
    fraction: <Fraction step={step} />,
    multiply: <Multiply step={step} />,
    percent: <Percent step={step} />,
    syntax: <Russian id="syntax" step={step} />,
    commas: <Russian id="commas" step={step} />,
    'ne-ni': <Russian id="ne-ni" step={step} />,
    baptism: <History id="baptism" step={step} />,
    reform: <History id="reform" step={step} />,
    demand: <Demand step={step} />,
    groups: <Groups step={step} />,
  };
  return (
    <svg
      viewBox="0 0 720 410"
      className="sc-visual"
      aria-hidden="true"
      style={{ '--sc-cyan': C.cyan } as CSSProperties}
    >
      <defs>
        <linearGradient id="sc-surface" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#25203d" />
          <stop offset="1" stopColor="#16152a" />
        </linearGradient>
        <linearGradient id="sc-triangle" x1="0" y1="0" x2=".8" y2="1">
          <stop stopColor="#b8a0ff" stopOpacity=".3" />
          <stop offset="1" stopColor="#7c63c6" stopOpacity=".08" />
        </linearGradient>
        <linearGradient id="sc-map" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#59505d" />
          <stop offset="1" stopColor="#292738" />
        </linearGradient>
        <marker
          id="sc-arrow-gold"
          markerWidth="7"
          markerHeight="7"
          refX="6"
          refY="3.5"
          orient="auto"
        >
          <path d="M0 0 L7 3.5 L0 7Z" fill={C.gold} />
        </marker>
        <marker
          id="sc-arrow-cyan"
          markerWidth="7"
          markerHeight="7"
          refX="6"
          refY="3.5"
          orient="auto"
        >
          <path d="M0 0 L7 3.5 L0 7Z" fill={C.cyan} />
        </marker>
      </defs>
      {views[sceneId]}
    </svg>
  );
});
