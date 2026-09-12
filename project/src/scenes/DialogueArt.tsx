import type { TutorDrawing } from '../domain/cloud-learning';
import { TutorMarkdown } from '../ui/TutorMarkdown';
import { drawingGraphBounds, renderSubjectFigure } from '../../shared/subject-figures.mjs';
import { sceneFormulaMarkdown } from '../../shared/scene-formula.mjs';
import { numberLineMarkers } from '../../shared/drawing-coordinate-points.cjs';

type DrawingStep = TutorDrawing['steps'][number];
type ArtProps = {
  drawing: TutorDrawing;
  step: DrawingStep;
  progress: number;
  index: number;
  subject?: import('../domain/school-program/types').SchoolSubjectId;
};
const num = (value: number) => String(value).replace('.', ',');
const reveal = (progress: number, start = 0) =>
  Math.max(0, Math.min(1, (progress - start) / Math.max(0.1, 1 - start)));

/** Render only data supplied by a bounded, validated drawing. No HTML or expression evaluation. */
export function DialogueArt(props: ArtProps) {
  const { drawing, step, progress, index } = props;
  const figure = renderSubjectFigure(drawing, index, progress);
  if (figure)
    return (
      <>
        <div className="ds-subject-figure" dangerouslySetInnerHTML={{ __html: figure }} />
        {step.labels?.length && drawing.figure !== 'spatial-plane' ? (
          <div className="ds-figure-labels">
            {step.labels.map((label, i) => (
              <span key={i}>{label}</span>
            ))}
          </div>
        ) : null}
        {step.formula && (
          <div className="ds-main-formula" style={{ opacity: reveal(progress, 0.74) }}>
            <TutorMarkdown text={sceneFormulaMarkdown(drawing.kind, step.formula)} />
          </div>
        )}
      </>
    );
  return (
    <>
      {drawing.kind === 'number-line' ? (
        <NumberLine {...props} />
      ) : drawing.kind === 'function' ? (
        <FunctionGraph {...props} />
      ) : drawing.kind === 'geometry' ? (
        <GeometryArt {...props} />
      ) : drawing.kind === 'syntax' ? (
        <SyntaxArt {...props} />
      ) : drawing.kind === 'history' ? (
        <HistoryArt {...props} />
      ) : drawing.kind === 'algebra' ? (
        <div className="ds-equations">
          {drawing.steps.slice(0, index + 1).map((line, i) => (
            <div
              key={i}
              className={i === index ? 'ds-current' : 'ds-previous'}
              style={{ opacity: i === index ? 0.3 + 0.7 * progress : 0.78 }}
            >
              {i > 0 && <span className="ds-chain-arrow">↓</span>}
              <TutorMarkdown
                text={
                  line.formula ? sceneFormulaMarkdown(drawing.kind, line.formula) : line.caption
                }
              />
            </div>
          ))}
        </div>
      ) : (step.values?.length && step.values.length === step.labels?.length) ||
        (props.subject && !['social', 'history'].includes(props.subject)) ? (
        <DataConceptArt {...props} />
      ) : (
        <ConceptArt {...props} />
      )}
      {step.formula && !['algebra', 'syntax'].includes(drawing.kind) && (
        <div className="ds-main-formula" style={{ opacity: reveal(progress, 0.74) }}>
          <TutorMarkdown text={sceneFormulaMarkdown(drawing.kind, step.formula)} />
        </div>
      )}
    </>
  );
}

/** Neutral scientific data: social institutions and people cannot stand for atoms or forces. */
function DataConceptArt({ step, progress, subject }: ArtProps) {
  const labels = step.labels?.length ? step.labels : [step.caption],
    values = step.values || [];
  const massIndex = labels.findIndex((label) => /масса/i.test(label)),
    forceIndex = labels.findIndex((label) => /сила/i.test(label));
  const direction = /вправо/i.test(step.caption) ? 1 : /влево/i.test(step.caption) ? -1 : 0;
  if (
    subject === 'biology' &&
    ['Мембрана', 'Цитоплазма', 'Ядро'].every((label) => labels.includes(label))
  ) {
    return (
      <>
        <svg
          viewBox="0 0 820 300"
          role="img"
          aria-label="Условная животная клетка: мембрана, цитоплазма и ядро"
        >
          <ellipse cx="400" cy="150" rx="235" ry="112" className="ds-geometry-fill" opacity={0.7} />
          <ellipse
            cx="400"
            cy="150"
            rx="235"
            ry="112"
            className="ds-geometry-outline"
            pathLength="1"
            strokeDasharray="1"
            strokeDashoffset={1 - progress}
          />
          <ellipse
            cx="390"
            cy="155"
            rx="69"
            ry="59"
            className="ds-data-core"
            opacity={reveal(progress, 0.15)}
          />
          <circle cx="400" cy="157" r="19" className="ds-point" opacity={reveal(progress, 0.3)} />
          <path d="M325 152H190M465 189H635M606 84H707" className="ds-guide" />
          <text x="130" y="143">
            Ядро
          </text>
          <text x="570" y="218">
            Цитоплазма
          </text>
          <text x="601" y="66">
            Мембрана
          </text>
        </svg>
        <p className="ds-art-note">
          Условная схема животной клетки; показаны только три части, масштабы не соблюдены.
        </p>
      </>
    );
  }
  if (
    subject === 'chemistry' &&
    labels[0] === 'Протон в ядре' &&
    labels[1] === 'Электрон вне ядра' &&
    values[0] === 1 &&
    values[1] === 1
  ) {
    return (
      <>
        <svg
          viewBox="0 0 820 300"
          role="img"
          aria-label="Нейтральный атом водорода: один протон и один электрон"
        >
          <ellipse
            cx="410"
            cy="145"
            rx="145"
            ry="101"
            className="ds-data-ring"
            strokeDasharray="5 7"
          />
          <circle cx="410" cy="145" r="37" className="ds-data-core" />
          <text x="410" y="154" textAnchor="middle">
            +1
          </text>
          <circle cx="555" cy="145" r="16" className="ds-point" opacity={reveal(progress, 0.2)} />
          <text x="582" y="151">
            −1
          </text>
          <text x="410" y="277" textAnchor="middle">
            Протон в ядре · электрон вне ядра
          </text>
        </svg>
        <p className="ds-art-note">
          Это схема состава, а не траектория электрона или масштабное изображение.
        </p>
      </>
    );
  }
  if (
    subject === 'physics' &&
    massIndex >= 0 &&
    forceIndex >= 0 &&
    values[massIndex] !== undefined &&
    values[forceIndex] !== undefined &&
    direction
  ) {
    const tip = 410 + direction * (95 + 160 * progress);
    return (
      <>
        <svg
          viewBox="0 0 820 270"
          role="img"
          aria-label="Масса тела и результирующая сила из условия"
        >
          <path d="M120 212H700" className="ds-axis" />
          <rect x="322" y="79" width="176" height="132" rx="18" className="ds-geometry-fill" />
          <rect x="322" y="79" width="176" height="132" rx="18" className="ds-geometry-outline" />
          <text x="410" y="153" textAnchor="middle">
            m = {num(values[massIndex])}
          </text>
          <path d={`M${410 + direction * 88} 106H${tip}`} className="ds-travel" />
          <path
            d={`M${tip - direction * 13} 96L${tip} 106L${tip - direction * 13} 116`}
            className="ds-arrow-tip"
          />
          <text x={410 + direction * 192} y="70" textAnchor="middle">
            F = {num(values[forceIndex])}
          </text>
        </svg>
        <LabelCards step={step} progress={progress} compact />
      </>
    );
  }
  return (
    <div className="ds-data-concepts">
      {labels.map((label, index) => {
        const value = values[index],
          electrons =
            subject === 'chemistry' &&
            /электрон/i.test(label) &&
            Number.isInteger(value) &&
            value > 0 &&
            value <= 24;
        return (
          <div
            className={`ds-data-node ds-tone-${index % 4}`}
            key={index}
            style={{
              opacity: 0.2 + 0.8 * reveal(progress, (index / Math.max(1, labels.length)) * 0.65),
              transform: `translateY(${(1 - progress) * 12}px)`,
            }}
          >
            {value !== undefined && (
              <svg viewBox="0 0 200 175" role="img" aria-label={`${label}: ${num(value)}`}>
                <circle cx="100" cy="86" r="61" className="ds-data-ring" />
                <circle cx="100" cy="86" r="44" className="ds-data-core" />
                {electrons &&
                  Array.from({ length: value }, (_, i) => {
                    const angle = (i / value) * Math.PI * 2 - Math.PI / 2;
                    return (
                      <circle
                        key={i}
                        cx={100 + 61 * Math.cos(angle)}
                        cy={86 + 61 * Math.sin(angle)}
                        r="5"
                        className="ds-point"
                        opacity={reveal(progress, (i / value) * 0.7)}
                      />
                    );
                  })}
                <text x="100" y="99" textAnchor="middle" className="ds-data-value">
                  {num(value)}
                </text>
              </svg>
            )}
            <span>{label}</span>
          </div>
        );
      })}
    </div>
  );
}

function NumberLine({ drawing, step, progress }: ArtProps) {
  const values = step.values ?? [],
    all = drawing.steps.flatMap((frame) => frame.values ?? []);
  if (!values.length) return <LabelCards step={step} progress={progress} />;
  const low = Math.min(0, ...all),
    high = Math.max(0, ...all),
    range = Math.max(1, high - low),
    pad = range * 0.13;
  const position = (n: number) => 75 + ((n - low + pad) / (range + 2 * pad)) * 670;
  const source = values[0],
    target = values[1] ?? source;
  const ticks = [...new Set([0, source, target, ...all])]
    .sort((a, b) => a - b)
    .filter((n, i, list) => i === 0 || Math.abs(position(n) - position(list[i - 1])) > 40)
    .slice(0, 14);
  const tip = position(source) + (position(target) - position(source)) * progress;
  const markers = numberLineMarkers(step);
  return (
    <>
      <svg
        viewBox="0 0 820 260"
        role="img"
        aria-label={`Числовая прямая: ${values.map(num).join(', ')}`}
      >
        <path d="M48 172H775m-12-7 12 7-12 7" className="ds-axis" />
        {ticks.map((n) => (
          <g key={n}>
            <path d={`M${position(n)} 166v12`} className="ds-axis" />
            <text x={position(n)} y="207" textAnchor="middle">
              {num(n)}
            </text>
          </g>
        ))}
        {markers ? (
          markers.map((point, i) => (
            <g key={`${point.value}:${i}`} opacity={reveal(progress, Math.min(0.6, i * 0.15))}>
              <circle cx={position(point.value)} cy="172" r="8" className="ds-point" />
              <path d={`M${position(point.value)} ${i % 2 ? 123 : 92}V160`} className="ds-guide" />
              <text x={position(point.value)} y={i % 2 ? 112 : 81} textAnchor="middle">
                {num(point.value)}
              </text>
            </g>
          ))
        ) : (
          <>
            <line x1={position(source)} x2={tip} y1="111" y2="111" className="ds-travel" />
            <path d={`M${position(source)} 118v45 M${tip} 124v39`} className="ds-guide" />
            <circle cx={position(source)} cy="172" r="6" className="ds-start" />
            <circle cx={tip} cy="111" r="13" className="ds-halo" />
            <circle cx={tip} cy="111" r="7" className="ds-point" />
            {source !== target && (
              <path
                d={`M${tip + (target > source ? -7 : 7)} 99 L${tip} 111 L${tip + (target > source ? -7 : 7)} 123`}
                className="ds-arrow-tip"
                opacity={progress}
              />
            )}
            <text x={position(source)} y="68" textAnchor="middle">
              {`Точка ${num(source)}`}
            </text>
            {!ticks.includes(target) && (
              <text
                x={position(target)}
                y="242"
                textAnchor="middle"
                opacity={reveal(progress, 0.7)}
              >
                {num(target)}
              </text>
            )}
          </>
        )}
      </svg>
      {step.labels?.length ? <LabelCards step={step} progress={progress} compact /> : null}
    </>
  );
}

function FunctionGraph({ drawing, step, progress }: ArtProps) {
  const values = step.values ?? [];
  if (values.length < 4 || values.length % 2) return <LabelCards step={step} progress={progress} />;
  const points = Array.from({ length: values.length / 2 }, (_, i) => ({
    x: values[2 * i],
    y: values[2 * i + 1],
  }));
  const { minX, maxX, minY, maxY } = drawingGraphBounds(drawing);
  const x = (n: number) => 95 + ((n - minX) / Math.max(1, maxX - minX)) * 620;
  const y = (n: number) => 253 - ((n - minY) / Math.max(1, maxY - minY)) * 202;
  return (
    <>
      <svg viewBox="0 0 820 312" role="img" aria-label="Заданные точки и соединяющие их отрезки">
        {Array.from({ length: 6 }, (_, i) => (
          <path
            key={i}
            d={`M${95 + i * 124} 41V270M82 ${51 + i * 40.4}H735`}
            className="ds-grid-line"
          />
        ))}
        <path d={`M65 ${y(0)}H756m-9-5 9 5-9 5 M${x(0)} 283V26m-5 9 5-9 5 9`} className="ds-axis" />
        <text x="765" y={y(0) + 5}>
          x
        </text>
        <text x={x(0) + 12} y="25">
          y
        </text>
        <polyline
          points={points.map((point) => `${x(point.x)},${y(point.y)}`).join(' ')}
          className="ds-travel"
          pathLength="1"
          strokeDasharray="1"
          strokeDashoffset={1 - progress}
        />
        {points.map((point, i) => (
          <g key={i} opacity={reveal(progress, (i / (points.length + 1)) * 0.7)}>
            <circle cx={x(point.x)} cy={y(point.y)} r="6" className="ds-point" />
            <text
              x={x(point.x)}
              y={y(point.y) + (i % 2 ? 26 : -14)}
              textAnchor="middle"
              className="ds-coordinate"
            >
              ({num(point.x)}; {num(point.y)})
            </text>
          </g>
        ))}
      </svg>
      <p className="ds-art-note">
        Заданные точки, соединённые отрезками. Масштаб одинаковый во всех кадрах.
      </p>
      {step.labels?.length ? <LabelCards step={step} progress={progress} compact /> : null}
    </>
  );
}

export function geometryDrawingData(drawing: TutorDrawing, step: DrawingStep) {
  const context = `${drawing.title} ${step.caption} ${(step.labels ?? []).join(' ')}`.toLowerCase();
  const shape = /окруж|круг|радиус/.test(context)
    ? 'circle'
    : /треугол/.test(context)
      ? 'triangle'
      : /прямоугол|квадрат/.test(context)
        ? 'rectangle'
        : undefined;
  const values = step.values ?? [],
    a = values[0],
    b = values[1] ?? (/квадрат/.test(context) ? a : undefined);
  return {
    shape,
    a: typeof a === 'number' && Number.isFinite(a) && a > 0 ? a : undefined,
    b: typeof b === 'number' && Number.isFinite(b) && b > 0 ? b : undefined,
  };
}
function GeometryArt({ drawing, step, progress }: ArtProps) {
  const { shape, a, b } = geometryDrawingData(drawing, step);
  if (!shape) return <LabelCards step={step} progress={progress} />;
  const aspect = a && b ? a / b : 1.65;
  const width = 350 * Math.min(1, Math.max(0.5, aspect / 1.5)),
    height = 210 * Math.min(1, Math.max(0.3, 1.5 / aspect));
  const left = (820 - width) / 2,
    right = left + width,
    top = 50,
    bottom = top + height;
  const shapePath =
    shape === 'triangle'
      ? `M${left} ${bottom}L${right} ${bottom}L${left + width * 0.38} ${top}Z`
      : `M${left} ${top}H${right}V${bottom}H${left}Z`;
  const show = (start: number) => reveal(progress, start);
  return (
    <>
      <svg
        viewBox="140 0 560 330"
        role="img"
        aria-label={`${shape === 'circle' ? 'Круг' : shape === 'triangle' ? 'Треугольник' : 'Прямоугольник'}: ${(step.values ?? []).map(num).join(', ')}`}
      >
        {shape === 'circle' ? (
          <>
            <circle
              cx="410"
              cy="161"
              r="108"
              className="ds-geometry-fill"
              opacity={show(0.1) * 0.4}
            />
            <circle
              cx="410"
              cy="161"
              r="108"
              className="ds-geometry-outline"
              pathLength="1"
              strokeDasharray="1"
              strokeDashoffset={1 - progress}
            />
            <path d={`M410 161h${108 * show(0.2)}`} className="ds-dimension-cyan" />
            <circle cx="410" cy="161" r="5" className="ds-point" />
            <text x="464" y="144" textAnchor="middle" opacity={show(0.3)}>
              r{a ? ` = ${num(a)}` : ''}
            </text>
          </>
        ) : (
          <>
            <path d={shapePath} className="ds-geometry-fill" opacity={show(0.15) * 0.55} />
            <path
              d={shapePath}
              className="ds-geometry-outline"
              pathLength="1"
              strokeDasharray="1"
              strokeDashoffset={1 - progress}
            />
            {shape === 'rectangle' &&
            a &&
            b &&
            Number.isInteger(a) &&
            Number.isInteger(b) &&
            a <= 14 &&
            b <= 10 ? (
              <g opacity={show(0.3)}>
                {Array.from({ length: a - 1 }, (_, i) => (
                  <path
                    key={`c${i}`}
                    d={`M${left + (width * (i + 1)) / a} ${top}V${bottom}`}
                    className="ds-grid-line"
                  />
                ))}
                {Array.from({ length: b - 1 }, (_, i) => (
                  <path
                    key={`r${i}`}
                    d={`M${left} ${top + (height * (i + 1)) / b}H${right}`}
                    className="ds-grid-line"
                  />
                ))}
              </g>
            ) : null}
            <path
              d={`M${left} ${bottom + 15}v9m0-4H${left + width * show(0.2)} M${right} ${bottom + 15}v9`}
              className="ds-dimension-cyan"
            />
            <text x="410" y={bottom + 48} textAnchor="middle" opacity={show(0.3)}>
              a{a ? ` = ${num(a)}` : ''}
            </text>
            {shape === 'triangle' ? (
              <>
                <path
                  d={`M${left + width * 0.38} ${top}V${top + height * show(0.2)}`}
                  className="ds-dimension-gold"
                />
                <path
                  d={`M${left + width * 0.38} ${bottom - 13}h13v13`}
                  className="ds-angle"
                  opacity={show(0.5)}
                />
                <text
                  x={left + width * 0.38 - 18}
                  y={top + height / 2}
                  textAnchor="end"
                  opacity={show(0.3)}
                >
                  h{b ? ` = ${num(b)}` : ''}
                </text>
              </>
            ) : (
              <>
                <path
                  d={`M${right + 16} ${top}h9m-4 0V${top + height * show(0.3)}M${right + 16} ${bottom}h9`}
                  className="ds-dimension-gold"
                />
                <text x={right + 39} y={top + height / 2 + 6} opacity={show(0.4)}>
                  b{b ? ` = ${num(b)}` : ''}
                </text>
              </>
            )}
          </>
        )}
      </svg>
      <p className="ds-art-note">Схема по условию; пропорции условные.</p>
      {step.labels?.length ? <LabelCards step={step} progress={progress} compact /> : null}
    </>
  );
}

function SyntaxArt({ step, progress }: ArtProps) {
  const labels = step.labels ?? [],
    pieces = labels.length ? labels : (step.formula ?? step.caption).split(/\s+/).filter(Boolean);
  const roleClass = (label: string) =>
    /^(подлежащее|главное)\s*:/i.test(label)
      ? 'subject'
      : /^(сказуемое|придаточное)\s*:/i.test(label)
        ? 'predicate'
        : /^определение\s*:/i.test(label)
          ? 'attribute'
          : 'neutral';
  return (
    <div className="ds-language-art">
      <div className="ds-language-line" aria-label="Части языкового примера">
        {pieces.map((part, i) => {
          const role = roleClass(part),
            colon = part.indexOf(':'),
            term = role === 'neutral' ? part : part.slice(colon + 1).trim();
          return (
            <div
              key={i}
              className={`ds-language-piece ds-role-${role}`}
              style={{
                opacity: 0.25 + 0.75 * reveal(progress, (i / Math.max(1, pieces.length)) * 0.6),
                transform: `translateY(${(1 - reveal(progress, (i / Math.max(1, pieces.length)) * 0.6)) * 9}px)`,
              }}
            >
              {role !== 'neutral' && <small>{part.slice(0, colon)}</small>}
              <strong>
                {term.split(/([,;:—!?])/).map((token, j) => (
                  <span key={j} className={/^[,;:—!?]$/.test(token) ? 'ds-punctuation' : undefined}>
                    {token}
                  </span>
                ))}
              </strong>
            </div>
          );
        })}
      </div>
      {step.formula && labels.length > 0 && (
        <div className="ds-sentence" style={{ opacity: reveal(progress, 0.65) }}>
          <TutorMarkdown text={step.formula} />
        </div>
      )}
    </div>
  );
}

export function historyDrawingTheme(drawing: TutorDrawing, step: DrawingStep) {
  const context =
    `${drawing.title} ${step.caption} ${drawing.steps.flatMap((item) => item.labels ?? []).join(' ')}`.toLowerCase();
  const city = /город|крепост[ьи]|осад|столиц/.test(context),
    battle = /битв|войн|войск|сражен/.test(context);
  const ruler = /княз|правител|император|царь|владимир|пётр|петр|александр|екатерин/.test(context);
  const document =
    /договор|документ|реформ|манифест|указ|отмен/.test(context) || (!city && !battle && !ruler);
  return { city, battle, ruler, document };
}
function HistoryArt({ drawing, step, progress }: ArtProps) {
  const { city, battle, ruler, document } = historyDrawingTheme(drawing, step);
  const documentX = city && ruler ? 545 : city || ruler || battle ? 435 : 315;
  return (
    <div className="ds-history-art">
      <svg
        viewBox="0 0 820 270"
        role="img"
        aria-label="Тематическая иллюстрация события; точная карта не задана"
      >
        <ellipse cx="410" cy="234" rx="258" ry="18" className="ds-ground" />
        <path
          d="M153 219Q215 163 282 194Q367 135 462 191Q570 145 670 219"
          className="ds-landscape"
          opacity={0.2 + progress * 0.5}
        />
        {city && (
          <g opacity={reveal(progress, 0.05)} transform={`translate(${(1 - progress) * 12} 0)`}>
            <path
              d="M160 223V127h20v-13h22v13h20v96M273 223V127h20v-13h22v13h20v96M222 154h51v69h-51"
              className="ds-building"
            />
            <path d="M172 113l19-24 19 24M286 113l18-24 18 24" className="ds-roof" />
            <path d="M238 223v-38q10-16 20 0v38" className="ds-building-door" />
            <path d="M183 151v20M305 151v20" className="ds-window" />
          </g>
        )}
        {ruler && (
          <g
            opacity={reveal(progress, 0.12)}
            transform={`translate(${city ? 110 : 0} ${(1 - progress) * 10})`}
          >
            <path d="M264 208Q266 156 286 144H325Q345 159 349 217Z" className="ds-cloak" />
            <path d="M287 142v-20h36v20" className="ds-skin" />
            <ellipse cx="305" cy="108" rx="26" ry="30" className="ds-skin" />
            <path d="M279 91l-4-19 17 8 12-17 12 17 19-8-5 24Z" className="ds-crown" />
            <path d="M287 151l18 35 18-35M278 204h55" className="ds-gold-line" />
          </g>
        )}
        {document && (
          <g opacity={reveal(progress, 0.18)} transform={`translate(0 ${(1 - progress) * 10})`}>
            <path d={`M${documentX} 54h150l16 166h-166Z`} className="ds-parchment" />
            {Array.from({ length: 5 }, (_, i) => (
              <path
                key={i}
                d={`M${documentX + 27} ${89 + i * 20}h${i === 4 ? 68 : 104}`}
                className="ds-ink"
                opacity={reveal(progress, 0.25 + i * 0.09)}
              />
            ))}
            <circle cx={documentX + 109} cy="188" r="18" className="ds-seal" />
            <path d={`M${documentX + 97} 200l-4 26 15-7 14 7-4-26`} className="ds-ribbon" />
          </g>
        )}
        {battle && !document && (
          <g opacity={reveal(progress, 0.2)}>
            {[0, 1, 2].map((i) => (
              <g key={i} transform={`translate(${450 + i * 46} ${110 + (i % 2) * 10})`}>
                <path d="M-12 104L-9 42h23l12 62" className="ds-soldier" />
                <circle cx="3" cy="27" r="14" className="ds-helmet" />
                <path d="M-12 73q21-13 26 0v26q-14 20-26 0Z" className="ds-shield" />
                <path d="M31 98V4l-4 11m4-11 4 11" className="ds-spear" />
              </g>
            ))}
          </g>
        )}
      </svg>
      <LabelCards step={step} progress={progress} />
      <p className="ds-art-note">Условная иллюстрация. Названия и связи — из текущего шага.</p>
    </div>
  );
}

function ConceptArt({ drawing, step, progress }: ArtProps) {
  const context = `${drawing.title} ${step.caption} ${(step.labels ?? []).join(' ')}`.toLowerCase();
  const market = /рынок|спрос|предложен|покупат|продав|эконом/.test(context),
    law = /прав|государ|закон|полит|власт/.test(context);
  return (
    <div className="ds-concept-art">
      <svg
        viewBox="0 0 820 180"
        role="img"
        aria-label={market ? 'Участники обмена' : law ? 'Институт и участники' : 'Группы и связи'}
      >
        {market ? (
          <>
            <path d="M123 135V65h165v70M111 65l22-35h148l19 35Z" className="ds-building" />
            <path d="M135 64h152M140 84h45v52M205 86h61v35" className="ds-market-detail" />
            <path d={`M328 78H${328 + 165 * progress}`} className="ds-travel" />
            <path d={`M493 114H${493 - 165 * progress}`} className="ds-dimension-gold" />
            <path
              d={`M${328 + 165 * progress - 8} 71l8 7-8 7`}
              className="ds-arrow-tip"
              opacity={progress}
            />
            <path
              d={`M${493 - 165 * progress + 8} 107l-8 7 8 7`}
              className="ds-dimension-gold"
              opacity={progress}
            />
            <Person x={578} y={92} />
            <Person x={636} y={98} />
          </>
        ) : law ? (
          <>
            <path
              d="M300 61l105-40 105 40ZM312 69h186M310 137h192M295 151h222"
              className="ds-institution"
            />
            {[329, 375, 423, 470].map((x) => (
              <path
                key={x}
                d={`M${x} 76v54`}
                className="ds-column"
                opacity={0.3 + 0.7 * progress}
              />
            ))}
            <Person x={218} y={98} />
            <Person x={606} y={98} />
          </>
        ) : (
          <>
            <ellipse cx="215" cy="99" rx="111" ry="58" className="ds-group-ring" />
            <ellipse cx="605" cy="99" rx="111" ry="58" className="ds-group-ring secondary" />
            {[177, 233, 572, 628].map((x, i) => (
              <Person key={x} x={x} y={i % 2 ? 106 : 96} />
            ))}
            <path d={`M350 98H${350 + 120 * progress}`} className="ds-travel" />
          </>
        )}
      </svg>
      <LabelCards step={step} progress={progress} />
    </div>
  );
}
function Person({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle cy="-19" r="11" className="ds-person-head" />
      <path d="M-18 29v-7q0-24 18-24t18 24v7" className="ds-person-body" />
    </g>
  );
}
function LabelCards({
  step,
  progress,
  compact = false,
}: {
  step: DrawingStep;
  progress: number;
  compact?: boolean;
}) {
  const labels = step.labels?.length ? step.labels : [step.caption];
  return (
    <div className={`ds-label-cards${compact ? ' compact' : ''}`}>
      {labels.map((label, i) => (
        <div
          className={`ds-label-card ds-tone-${i % 4}`}
          key={i}
          style={{
            opacity: 0.2 + 0.8 * reveal(progress, (i / Math.max(1, labels.length)) * 0.65),
            transform: `translateY(${(1 - reveal(progress, (i / Math.max(1, labels.length)) * 0.65)) * 8}px)`,
          }}
        >
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}
