import { cleanFigure, drawingGraphBounds, renderSubjectFigure } from './subject-figures.mjs';
import { sceneFormulaMarkdown } from './scene-formula.mjs';
import { historyStageContent } from './history-atlas.mjs';
import { normalizeCoordinateDrawing, numberLineMarkers } from './drawing-coordinate-points.cjs';
const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const kinds = ['number-line', 'algebra', 'function', 'geometry', 'syntax', 'history', 'concept'];
const record = (value) => value && typeof value === 'object' && !Array.isArray(value);
const bounded = (value, limit) =>
  typeof value !== 'string'
    ? ''
    : value.length <= limit
      ? value
      : value.slice(0, limit) + '… [Превышен лимит текста экспорта; исходная запись длиннее.]';
const number = (value) => String(value).replace('.', ',');

/** Data only. Invalid coordinates are rejected as a whole, never shifted into new pairs. */
export function documentDrawings(input) {
  if (!Array.isArray(input)) return [];
  return input
    .slice(0, 40)
    .filter((d) => record(d) && kinds.includes(d.kind) && Array.isArray(d.steps))
    .map((d) => ({
      ...(cleanFigure(d.figure) ? { figure: cleanFigure(d.figure) } : {}),
      kind: d.kind,
      title: bounded(d.title, 300) || 'Рисунок занятия',
      steps: d.steps
        .slice(0, 8)
        .filter(record)
        .map((s) => {
          const values =
            Array.isArray(s.values) &&
            s.values.length <= 32 &&
            s.values.every((v) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 1e8)
              ? [...s.values]
              : [];
          return {
            caption: bounded(s.caption, 16000),
            // Long formulas remain literal in the detail flow; never cut a mathematical assertion.
            formula: bounded(s.formula, 16000),
            labels: Array.isArray(s.labels)
              ? s.labels
                  .filter((v) => typeof v === 'string')
                  .slice(0, 10)
                  .map((v) => bounded(v, 1600))
              : [],
            values:
              (d.kind === 'function' && (values.length < 4 || values.length % 2)) ||
              (d.kind === 'geometry' && values.some((v) => v <= 0))
                ? []
                : values,
            ...(d.figure === 'history-map' ? historyStageContent(values) : {}),
          };
        }),
    }))
    .filter((d) => d.steps.length)
    .map(normalizeCoordinateDrawing);
}

const text = (x, y, value, color = '#d8c1fb', size = 17, anchor = 'middle') =>
  `<text x="${x}" y="${y}" fill="${color}" font-size="${size}" text-anchor="${anchor}">${esc(value)}</text>`;
const line = (x, y, a, b, color = '#9e86ca', width = 2) =>
  `<line x1="${x}" y1="${y}" x2="${a}" y2="${b}" stroke="${color}" stroke-width="${width}"/>`;
const svg = (body, label) =>
  `<svg viewBox="0 0 500 260" role="img" aria-label="${esc(label)}" xmlns="http://www.w3.org/2000/svg" style="font-family:Segoe UI,Arial,sans-serif">${body}</svg>`;
const excerpt = (value, max) => {
  if (value.length <= max) return value;
  const end = value.lastIndexOf(' ', max);
  return value.slice(0, end > max / 2 ? end : max) + '…';
};
const mathKinds = ['number-line', 'algebra', 'function', 'geometry'];
const compactFormula = (value) => value.length <= 100 && !/\\begin|\\\\/.test(value);
const displayFormula = (kind, value, inline) => {
  if (!value) return '';
  if (!mathKinds.includes(kind) || value.length > 1200)
    return `<div class="scene-prose-formula">${inline(sceneFormulaMarkdown(kind, value))}</div>`;
  return `<div class="scene-formula-math">${inline(sceneFormulaMarkdown(kind, value))}</div>`;
};

function art(drawing, step, index, inline) {
  const figure = renderSubjectFigure(drawing, index, 1);
  if (figure) return figure;
  const values = step.values;
  if (drawing.kind === 'number-line' && values.length) {
    const all = drawing.steps.flatMap((s) => s.values);
    const low = Math.min(0, ...all),
      high = Math.max(0, ...all),
      span = Math.max(1, high - low);
    const at = (v) => 62 + ((v - low + span * 0.12) / (span * 1.24)) * 376;
    const a = values[0],
      b = values[1] ?? a;
    let body =
      line(36, 157, 464, 157) +
      '<path d="M454 151 L465 157 L454 163" fill="none" stroke="#9e86ca" stroke-width="2"/>';
    const ticks = [...new Set([0, ...all])].sort((x, y) => x - y);
    let previous = -Infinity;
    for (const v of ticks) {
      body += line(at(v), 151, at(v), 163);
      if (at(v) - previous > 43) {
        body += text(at(v), 193, number(v), undefined, 15);
        previous = at(v);
      }
    }
    const markers = numberLineMarkers(step);
    if (markers) {
      markers.forEach((point, i) => {
        body += `<circle cx="${at(point.value)}" cy="157" r="7" fill="#7fdbe2"/>`;
        body += text(at(point.value), i % 2 ? 118 : 91, number(point.value), '#a1edf2', 20);
      });
      body += text(250, 44, 'Отметки на числовой прямой', '#f4cf95', 18);
      return svg(
        body,
        `Подписанные точки: ${markers.map((point) => number(point.value)).join(', ')}`,
      );
    }
    body +=
      line(at(a), 108, at(b), 108, '#7fdbe2', 5) +
      line(at(a), 113, at(a), 151, '#7a6a93') +
      line(at(b), 114, at(b), 151, '#7a6a93');
    body += `<circle cx="${at(a)}" cy="157" r="6" fill="#c19afc"/><circle cx="${at(b)}" cy="108" r="7" fill="#7fdbe2"/>`;
    if (a !== b)
      body += `<path d="M${at(b) + (b > a ? -8 : 8)} 99 L${at(b)} 108 L${at(b) + (b > a ? -8 : 8)} 117" fill="none" stroke="#7fdbe2" stroke-width="3"/>`;
    body += text(250, 48, `От ${number(a)} к ${number(b)}`, '#f4cf95', 18);
    return svg(body, `Числовая прямая, кадр ${index + 1}; от ${number(a)} к ${number(b)}`);
  }
  if (drawing.kind === 'geometry') {
    const context = `${drawing.title} ${step.caption} ${step.labels.join(' ')}`.toLowerCase();
    const circle = /окружност|радиус|(?:^|\s)круг(?:а|у|ом|е)?(?=$|[\s.,;:])/.test(context),
      triangle = /треугол/.test(context),
      square = /(?:^|\s)квадрат(?:а|у|ом|е)?(?=$|[\s.,;:])/.test(context),
      rectangle = /прямоугол/.test(context);
    const shapes = [circle, triangle, square || rectangle].filter(Boolean).length;
    const a = values[0],
      b = values[1] ?? (square ? a : undefined);
    if (shapes !== 1 || !a || (!circle && !b) || (square && b !== a))
      return `<div class="scene-data-note"><b>Схема не построена</b><p>Фигура или необходимые размеры не определены однозначно. Сохраняем пояснение без выдуманного чертежа.</p></div>`;
    let body = '';
    if (circle) {
      body =
        '<circle cx="250" cy="123" r="82" stroke="#b891eb" fill="#66499244" stroke-width="3"/>' +
        line(250, 123, 332, 123, '#7fdbe2', 3) +
        '<circle cx="250" cy="123" r="4" fill="#7fdbe2"/>' +
        text(286, 106, `r = ${number(a)}`);
    } else {
      const width = square ? 163 : 295,
        height = 163,
        left = (500 - width) / 2,
        top = 36,
        bottom = top + height;
      if (triangle) {
        const vertex = left + width * 0.37;
        body =
          `<path d="M${left} ${bottom} L${vertex} ${top} L${left + width} ${bottom} Z" fill="#66499244" stroke="#b891eb" stroke-width="3"/>` +
          line(vertex, top, vertex, bottom, '#7fdbe2', 3) +
          `<path d="M${vertex} ${bottom - 13} h13 v13" fill="none" stroke="#7fdbe2" stroke-width="2"/>` +
          text(vertex + 47, 126, `h = ${number(b)}`);
      } else
        body =
          `<rect x="${left}" y="${top}" width="${width}" height="${height}" fill="#66499244" stroke="#b891eb" stroke-width="3"/>` +
          text(445, 123, `b = ${number(b)}`, undefined, 13);
      body += text(250, 225, `a = ${number(a)}`);
    }
    return svg(
      body,
      `${circle ? 'Круг' : triangle ? 'Треугольник с перпендикулярной высотой' : square ? 'Квадрат' : 'Прямоугольник'}, значения ${values.map(number).join('; ')}`,
    );
  }
  if (drawing.kind === 'function' && values.length >= 4 && values.length % 2 === 0) {
    const xs = values.filter((_, i) => i % 2 === 0),
      ys = values.filter((_, i) => i % 2);
    const { minX: xmin, maxX: xmax, minY: ymin, maxY: ymax } = drawingGraphBounds(drawing);
    const xspan = Math.max(1, xmax - xmin),
      yspan = Math.max(1, ymax - ymin);
    const x = (v) => 78 + ((v - xmin) / xspan) * 336,
      y = (v) => 205 - ((v - ymin) / yspan) * 156;
    let body =
      line(43, y(0), 461, y(0)) +
      line(x(0), 225, x(0), 22) +
      text(470, y(0) + 5, 'x', undefined, 15) +
      text(x(0) + 14, 22, 'y', undefined, 15);
    body += `<polyline fill="none" stroke="#82dce7" stroke-width="4" points="${xs.map((v, i) => `${x(v)},${y(ys[i])}`).join(' ')}"/>`;
    xs.forEach((v, i) => {
      body += `<circle cx="${x(v)}" cy="${y(ys[i])}" r="5" fill="#d0adff"/>`;
      if (xs.length <= 5)
        body += text(
          Math.max(100, Math.min(400, x(v))),
          y(ys[i]) + (i % 2 ? 22 : -14),
          `(${number(v)}; ${number(ys[i])})`,
          undefined,
          14,
        );
    });
    return svg(body, 'Заданные точки и соединяющие их отрезки; координаты сохранены в пояснении');
  }
  if (drawing.kind === 'algebra') {
    const formula = step.formula;
    return `<div class="scene-algebra-art"><span class="kicker">ПРЕОБРАЗОВАНИЕ · ${index + 1}</span>${formula && compactFormula(formula) ? displayFormula('algebra', formula, inline) : `<p>${formula ? 'Полная запись — в пояснении к кадру.' : inline(excerpt(step.caption, 120))}</p>`}<span class="scene-art-note">Запись текущего шага из разговора</span></div>`;
  }
  if (drawing.kind === 'syntax') {
    return `<div class="scene-syntax-art"><span class="kicker">ПРЕДЛОЖЕНИЕ ИЗ ЗАНЯТИЯ</span><div class="scene-sentence">${inline(excerpt(step.formula || step.caption, 120))}</div><span class="scene-art-note">Пунктуация сохранена как в исходном кадре</span></div>`;
  }
  if (drawing.kind === 'concept' && values.length) {
    const mass = step.labels.findIndex((label) => /масса/i.test(label));
    const force = step.labels.findIndex((label) => /сила/i.test(label));
    const direction = /вправо/i.test(step.caption) ? 1 : /влево/i.test(step.caption) ? -1 : 0;
    if (
      mass >= 0 &&
      force >= 0 &&
      values[mass] !== undefined &&
      values[force] !== undefined &&
      direction
    ) {
      const tip = 250 + direction * 180;
      return svg(
        line(50, 210, 450, 210) +
          '<rect x="195" y="85" width="110" height="125" rx="14" fill="#63498b55" stroke="#c9a4ff" stroke-width="3"/>' +
          text(250, 155, 'm = ' + number(values[mass]), undefined, 23) +
          line(250 + direction * 55, 120, tip, 120, '#7ed8e8', 4) +
          `<path d="M${tip - direction * 12} 110L${tip} 120L${tip - direction * 12} 130" fill="none" stroke="#7ed8e8" stroke-width="3"/>` +
          text(250 + direction * 130, 85, 'F = ' + number(values[force]), '#a1e8f1', 22),
        'Масса и результирующая сила из условия',
      );
    }
    return svg(
      values
        .slice(0, 3)
        .map((value, i) => {
          const x = ((i + 0.5) * 500) / Math.min(3, values.length);
          return (
            `<circle cx="${x}" cy="100" r="52" fill="#75539644" stroke="#bb98ec" stroke-width="2"/>` +
            text(x, 112, number(value), '#e7d4ff', 35) +
            text(x, 180, excerpt(step.labels[i] || `Значение ${i + 1}`, 25), '#a1e8f1', 14)
          );
        })
        .join(''),
      'Числовые данные кадра',
    );
  }
  const date = step.labels.find((label) => /^дата\s*:/i.test(label));
  const labels = step.labels.filter((label) => label !== date);
  return `<div class="scene-label-art ${drawing.kind === 'history' ? 'scene-history-art' : ''}">${drawing.kind === 'history' ? '<div class="scene-document-symbol" aria-hidden="true">§</div>' : ''}${date ? `<div class="scene-date">${inline(excerpt(date, 105))}</div>` : ''}${
    labels.length
      ? labels
          .slice(0, 3)
          .map((label) => `<div class="scene-data-card">${inline(excerpt(label, 90))}</div>`)
          .join('')
      : `<p>${inline(excerpt(step.caption, 180)) || 'Кадр не содержит числовых данных.'}</p>`
  }</div>`;
}

function coordinates(kind, values) {
  if (!values.length) return '';
  return kind === 'function'
    ? 'Координаты (x; y): ' +
        Array.from(
          { length: values.length / 2 },
          (_, i) => `(${number(values[i * 2])}; ${number(values[i * 2 + 1])})`,
        ).join('; ')
    : kind === 'number-line' || kind === 'concept'
      ? 'Значения кадра: ' + values.map(number).join('; ')
      : '';
}

export function drawingPages(input, inline, _paragraphs, options = {}) {
  const pages = [];
  const maxCaption = options.scale === 'large' ? 180 : 240;
  for (const d of documentDrawings(input)) {
    const labelLimit = ['history', 'syntax'].includes(d.kind)
      ? 200
      : d.kind === 'function'
        ? 140
        : 75;
    const spacious = ['history-map', 'chemistry-reaction', 'lesson-lab', 'spatial-plane'].includes(
      d.figure,
    );
    const perPage = spacious ? 1 : 2;
    for (let start = 0; start < d.steps.length; start += perPage) {
      const details = [];
      const rows = d.steps
        .slice(start, start + perPage)
        .map((s, i) => {
          const stepNumber = start + i + 1;
          // Named figures express their values on the drawing; their numeric payload
          // can also contain renderer flags, which do not belong in a student's notes.
          const data = d.figure ? '' : coordinates(d.kind, s.values);
          const labels = s.labels.join('; ');
          const needsDetail =
            s.caption.length > maxCaption ||
            !compactFormula(s.formula) ||
            labels.length > labelLimit ||
            data.length > 95 ||
            d.title.length > 110;
          if (needsDetail)
            details.push({
              title: 'Подробности к рисунку',
              content: `## ${d.title}\n### Кадр ${stepNumber} из ${d.steps.length}\n${s.caption}\n\n${s.labels.map((label) => `- ${label}`).join('\n')}\n${data}\n\n${s.formula ? (mathKinds.includes(d.kind) && s.formula.length <= 1200 ? '\\[' + s.formula + '\\]' : s.formula) : ''}`,
            });
          const caption =
            needsDetail && /\$|\\\[|\\\(/.test(s.caption)
              ? 'Полное пояснение с формулами сохранено на следующих страницах.'
              : excerpt(s.caption, maxCaption);
          const formula =
            d.kind === 'algebra' || d.kind === 'syntax'
              ? ''
              : compactFormula(s.formula)
                ? displayFormula(d.kind, s.formula, inline)
                : '';
          return `<section class="scene-print-row${spacious ? ' scene-print-large' : ''}" data-scene-kind="${d.kind}" data-scene-step="${stepNumber}"><div class="scene-print-art">${art(d, s, start + i, inline)}</div><div class="scene-print-note"><div class="kicker">КАДР ${stepNumber} ИЗ ${d.steps.length}</div><p class="scene-caption">${inline(caption)}</p>${formula}${labels ? `<p class="scene-labels">${inline(excerpt(labels, labelLimit))}</p>` : ''}${data ? `<p class="scene-coordinates">${inline(excerpt(data, 95))}</p>` : ''}${d.kind === 'geometry' ? '<p class="scene-art-note">Схема по условию; пропорции условные.</p>' : d.kind === 'function' ? '<p class="scene-art-note">Заданные точки соединены отрезками; плавная кривая не предполагается.</p>' : ''}${needsDetail ? `<p class="scene-print-detail">Кадр ${stepNumber}: полный текст, подписи и запись — на следующих страницах.</p>` : ''}</div></section>`;
        })
        .join('');
      pages.push({
        kind: 'scene-print',
        body: `<div class="scene-print-heading"><div class="kicker">РИСУНКИ ИЗ НАШЕГО ЗАНЯТИЯ · СОХРАНЁННЫЕ КАДРЫ</div><h1>${inline(excerpt(d.title, 110))}</h1></div>${rows}`,
      });
      pages.push(...details);
    }
  }
  return pages;
}

export const drawingPrintCss = `.scene-print-row.scene-print-large{grid-template-columns:72% 1fr;gap:20px;height:520px}.scene-print-large .scene-print-art svg{height:480px}.scene-print-large .scene-print-note .scene-caption{font-size:14px;line-height:1.6}.scene-print-heading{height:79px;margin:0}.scene-print-heading h1{font-size:23px;line-height:1.25;margin:8px 0}.scene-print-row{display:grid;grid-template-columns:47% 1fr;gap:25px;padding:15px 0;border-top:1px solid var(--line);height:255px}.scene-print-art{background:linear-gradient(130deg,#2b193d,#111523);border:1px solid #9779bd60;border-radius:15px;display:flex;align-items:center;justify-content:center;padding:12px;color:#f1eaff;min-width:0}.scene-print-art svg{width:100%;height:210px;display:block}.scene-print-note{min-width:0}.scene-print-note p{font-size:13px;line-height:1.55;margin:8px 0}.scene-print-note .scene-caption{font-size:14px;line-height:1.55}.scene-print-note .scene-labels,.scene-print-note .scene-coordinates{font-size:11.5px;color:var(--cyan)}.scene-formula-math{padding:5px 8px;border-radius:10px;background:var(--card);font-size:17px}.scene-formula-math .katex-display{margin:.2em 0}.scene-prose-formula{font-size:16px;line-height:1.45;overflow-wrap:anywhere}.scene-print-detail{color:var(--muted);font-size:10.5px!important}.scene-art-note{font-size:10.5px!important;color:var(--muted);line-height:1.45!important;display:block}.scene-print-art .scene-art-note{color:#c5b2da}.scene-algebra-art,.scene-syntax-art,.scene-label-art,.scene-data-note{width:100%;max-height:210px;padding:5px 12px;overflow-wrap:anywhere}.scene-algebra-art .scene-formula-math{font-size:23px;background:transparent;color:#efd9ff;padding:18px 0}.scene-algebra-art .scene-art-note{margin-top:22px}.scene-sentence{font-size:22px;line-height:1.6;padding:18px 0;color:#d9c5ff}.scene-data-card{border-left:3px solid #9470d5;padding:5px 10px;font-size:12px;line-height:1.5;margin:5px 0;background:#a47be513;border-radius:3px}.scene-document-symbol{float:right;width:34px;height:38px;border:1px solid #e0b27c;border-radius:4px;color:#e0b27c;text-align:center;font-size:25px;margin-left:12px}.scene-date{color:#efd1a8;font-size:15px;line-height:1.45;margin-bottom:10px}.scene-data-note b{color:#dfc6ff}.scene-data-note p{font-size:14px;line-height:1.55;margin-top:12px}.large .scene-print-note .scene-caption{font-size:15px}.large .scene-print-note .scene-labels,.large .scene-print-note .scene-coordinates{font-size:12px}.scene-print-art .kicker{color:#d1afff}`;
