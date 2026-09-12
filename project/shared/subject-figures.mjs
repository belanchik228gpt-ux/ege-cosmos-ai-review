/** Local, bounded SVG construction shared by the interactive player and exported notes.
 * The model supplies numbers and labels, never SVG, markup or executable expressions. */
import figureTypes from './subject-figure-types.json' with { type: 'json' };
import { renderHistoryAtlas } from './history-atlas.mjs';
import { renderChemistryScene } from './chemistry-scenes.mjs';
import { renderLessonLab } from './lesson-lab.mjs';
import { renderSpatialPlane } from './spatial-plane.mjs';
export const subjectFigures = figureTypes;
export const cleanFigure = (value) => (subjectFigures.includes(value) ? value : undefined);
export function drawingGraphBounds(drawing) {
  const coordinates = (drawing.steps || []).flatMap((s) =>
    Array.isArray(s.values) &&
    s.values.length >= 4 &&
    s.values.length % 2 === 0 &&
    s.values.every(Number.isFinite)
      ? s.values
      : [],
  );
  const xs = coordinates.filter((_, i) => i % 2 === 0),
    ys = coordinates.filter((_, i) => i % 2 === 1);
  return {
    minX: Math.min(0, ...xs),
    maxX: Math.max(1, ...xs),
    minY: Math.min(0, ...ys),
    maxY: Math.max(1, ...ys),
  };
}
const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const num = (value) =>
  Number.isInteger(value) ? String(value) : String(Number(value.toPrecision(5))).replace('.', ',');
const colors = ['#a78bfa', '#67e8f9', '#fbbf77', '#86efac', '#f9a8d4', '#a5b4fc'];
const text = (x, y, value, size = 19, color = '#e9e1ff', anchor = 'middle') =>
  `<text x="${x}" y="${y}" fill="${color}" font-size="${size}" text-anchor="${anchor}">${esc(value)}</text>`;
const line = (x, y, a, b, color = '#a78bfa', width = 3, extra = '') =>
  `<path d="M${x} ${y}L${a} ${b}" fill="none" stroke="${color}" stroke-width="${width}" ${extra}/>`;
const arrow = (x, y, a, b, color = '#67e8f9', p = 1) => {
  const tx = x + (a - x) * p,
    ty = y + (b - y) * p,
    angle = Math.atan2(b - y, a - x),
    q = 11;
  return (
    line(x, y, tx, ty, color, 3) +
    `<path d="M${tx - q * Math.cos(angle - 0.5)} ${ty - q * Math.sin(angle - 0.5)}L${tx} ${ty}L${tx - q * Math.cos(angle + 0.5)} ${ty - q * Math.sin(angle + 0.5)}" fill="none" stroke="${color}" stroke-width="3"/>`
  );
};
function wrap(value, max = 20) {
  const words = String(value).split(/\s+/),
    lines = [];
  let current = '';
  for (const word of words) {
    if (current && current.length + word.length + 1 > max) {
      lines.push(current);
      current = '';
    }
    // A long token is split without silently discarding content.
    let tail = word;
    while (tail.length > max) {
      if (current) {
        lines.push(current);
        current = '';
      }
      lines.push(tail.slice(0, max));
      tail = tail.slice(max);
    }
    current += (current ? ' ' : '') + tail;
  }
  if (current) lines.push(current);
  return lines;
}
const label = (x, y, value, max = 20, size = 17, color) =>
  wrap(value, max)
    .map((s, i) => text(x, y + i * (size + 5), s, size, color))
    .join('');
const card = (x, y, w, h, value, color, p = 1) => {
  const rows = wrap(value, Math.floor(w / 9)),
    max = Math.max(1, Math.floor((h - 20) / 21)),
    shown = rows.slice(0, max);
  if (rows.length > max) shown[max - 1] = shown[max - 1].slice(0, -1) + '…';
  return `<g opacity="${0.25 + 0.75 * p}"><title>${esc(value)}</title><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="16" fill="${color}18" stroke="${color}" stroke-width="2"/>${shown.map((s, i) => text(x + w / 2, y + 27 + i * 21, s, 16, color)).join('')}</g>`;
};
const finite = (values) =>
  Array.isArray(values) &&
  values.every((v) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 1e8);

export function renderSubjectFigure(drawing, index = 0, progress = 1) {
  const figure = cleanFigure(drawing?.figure);
  if (!figure) return null;
  const step = drawing.steps?.[index] || {},
    p = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 1;
  const values = finite(step.values) ? step.values : [],
    labels = Array.isArray(step.labels)
      ? step.labels.filter((v) => typeof v === 'string').slice(0, 10)
      : [];
  if (figure === 'history-map') {
    const atlas = renderHistoryAtlas(values, p);
    if (atlas) return atlas;
  }
  if (figure === 'lesson-lab') return renderLessonLab(values, p);
  if (figure === 'spatial-plane') return renderSpatialPlane(values, step.labels, p);
  if (figure === 'chemistry-reaction') {
    const chemistry = renderChemistryScene(values, p);
    if (chemistry) return chemistry;
  }
  let body = '',
    note = '',
    height = 360;
  if (
    figure === 'interval' &&
    values.length === 5 &&
    values[0] < values[1] &&
    values.slice(2).every((v) => v === 0 || v === 1)
  ) {
    const [a, b, closedA, closedB, selected] = values,
      left = 220,
      right = 600,
      y = 158;
    body = line(80, y, 740, y, '#817495', 2) + text(735, y + 37, 'x', 23);
    if (selected)
      body += line(
        left,
        y,
        right,
        y,
        '#67e8f9',
        8,
        `pathLength="1" stroke-dasharray="1" stroke-dashoffset="${1 - p}"`,
      );
    for (const [x, v, closed] of [
      [left, a, closedA],
      [right, b, closedB],
    ])
      body +=
        (selected
          ? `<circle cx="${x}" cy="${y}" r="10" fill="${closed ? '#67e8f9' : '#15111f'}" stroke="#67e8f9" stroke-width="3"/>`
          : line(x, y - 9, x, y + 9, '#b9a6d4', 2)) + text(x, y + 44, num(v), 24);
    body += text(410, 83, selected ? 'Выделено множество решений' : 'Отметим граничные точки', 23);
    if (selected)
      body += text(
        410,
        271,
        `${closedA ? '[' : '('}${num(a)}; ${num(b)}${closedB ? ']' : ')'}`,
        30,
        '#67e8f9',
      );
    note = selected
      ? 'Пустой кружок: граница не включена. Закрашенный: включена. Отрезок обозначает множество, не движение точки.'
      : 'Решение пока не выделено. Сначала проверь знаки выражения на промежутках и включение границ.';
  } else if (figure === 'right-triangle' && values.length >= 2 && values[0] > 0 && values[1] > 0) {
    const [a, b] = values,
      scale = Math.min(440 / a, 205 / b),
      w = a * scale,
      h = b * scale,
      left = (820 - w) / 2,
      base = 275;
    body = `<path d="M${left} ${base - h}L${left} ${base}H${left + w}Z" fill="#a78bfa19" stroke="#a78bfa" stroke-width="3" pathLength="1" stroke-dasharray="1" stroke-dashoffset="${1 - p}"/>`;
    const marker = Math.min(20, w / 5, h / 5);
    body += `<path d="M${left} ${base - marker}h${marker}v${marker}" fill="none" stroke="#67e8f9" stroke-width="2"/>`;
    body +=
      text(left + w / 2, base + 33, `a = ${num(a)}`, 23, '#67e8f9') +
      text(left - 35, base - h / 2, `b = ${num(b)}`, 23, '#fbbf77', 'end');
    body += text(left + w / 2 + 38, base - h / 2 - 20, 'c', 26, '#a78bfa');
    note = 'Квадрат в углу обозначает 90°. a и b — катеты, c — гипотенуза.';
  } else if (figure === 'circuit' && values.length >= 2 && values[0] > 0 && values[1] > 0) {
    const [u, r] = values;
    body = `<path d="M210 210V94H525M625 94H690V250H210V232" fill="none" stroke="#a78bfa" stroke-width="4" pathLength="1" stroke-dasharray="1" stroke-dashoffset="${1 - p}"/><path d="M180 210H240M192 232H228" stroke="#fbbf77" stroke-width="4"/><rect x="525" y="77" width="100" height="34" rx="3" fill="#67e8f920" stroke="#67e8f9" stroke-width="3"/>`;
    body +=
      text(575, 56, `R = ${num(r)} Ом`, 22, '#67e8f9') +
      text(180, 211, '+', 20, '#fbbf77', 'end') +
      text(148, 249, `U = ${num(u)} В`, 22, '#fbbf77');
    body += arrow(320, 94, 435, 94, '#86efac', p) + text(375, 68, 'I', 24, '#86efac');
    note =
      'Идеальный источник и один резистор. Стрелка — условное направление тока во внешней цепи.';
  } else if (
    figure === 'wave' &&
    values.length >= 2 &&
    values[0] > 0 &&
    values[1] > 0 &&
    values[1] <= 6
  ) {
    const [amplitude, periods] = values,
      y = 170,
      length = 640,
      points = [];
    for (let i = 0; i <= 200; i++) {
      const x = 90 + (length * i) / 200;
      points.push(`${i ? 'L' : 'M'}${x} ${y - 85 * Math.sin((i / 200) * Math.PI * 2 * periods)}`);
    }
    body = line(65, y, 755, y, '#7d6f9d', 2) + line(90, 65, 90, 280, '#7d6f9d', 2);
    body += `<path d="${points.join(' ')}" fill="none" stroke="#67e8f9" stroke-width="4" pathLength="1" stroke-dasharray="1" stroke-dashoffset="${1 - p}"/>`;
    body +=
      line(125, 85, 125, 170, '#fbbf77', 2) +
      text(144, 119, `A = ${num(amplitude)}`, 20, '#fbbf77', 'start');
    note =
      'Условный мгновенный профиль волны. Амплитуда указана в единицах примера; рисунок нормирован по высоте.';
  } else if (
    figure === 'particles' &&
    values.length &&
    Number.isInteger(values[0]) &&
    values[0] >= 1 &&
    values[0] <= 36
  ) {
    const count = values[0],
      columns = Math.ceil(Math.sqrt(count)),
      rows = Math.ceil(count / columns);
    body =
      '<rect x="215" y="44" width="390" height="238" rx="24" fill="#a78bfa12" stroke="#a78bfa" stroke-width="3"/>';
    for (let i = 0; i < count; i++) {
      const x = 245 + (((i % columns) + 0.5) * 330) / columns,
        y = 62 + ((Math.floor(i / columns) + 0.5) * 195) / rows;
      body += `<circle cx="${x}" cy="${y}" r="${Math.min(15, 70 / columns)}" fill="${colors[i % 2]}" opacity="${Math.max(0.16, Math.min(1, p * 2 - i / count))}"/>`;
    }
    body += text(410, 320, `Частиц в модели: ${count}`, 23);
    note =
      'Условные частицы одного вещества. Цвет не обозначает разные элементы; размеры и расположение схематические.';
  } else if (figure === 'earth-layers' && labels.length === 3) {
    body = `<circle cx="340" cy="165" r="122" fill="#67e8f920" stroke="#67e8f9" stroke-width="8"/><circle cx="340" cy="165" r="114" fill="#fbbf7755" opacity="${0.2 + 0.8 * p}"/><circle cx="340" cy="165" r="61" fill="#fb7185bb" opacity="${0.2 + 0.8 * p}"/>`;
    body += line(451, 117, 562, 75, '#67e8f9', 2) + label(633, 70, labels[0], 18, 20, '#67e8f9');
    body += line(416, 165, 562, 164, '#fbbf77', 2) + label(633, 159, labels[1], 18, 20, '#fbbf77');
    body += line(359, 188, 562, 258, '#fb7185', 2) + label(633, 251, labels[2], 18, 20, '#fb7185');
    note =
      'Упрощённый разрез Земли. Толщины слоёв не в масштабе; внутреннее и внешнее ядро объединены.';
  } else if (figure === 'food-chain' && labels.length >= 2 && labels.length <= 6) {
    const count = labels.length,
      width = Math.min(165, 680 / count - 20),
      left = (820 - (count * (width + 24) - 24)) / 2;
    height = 400;
    for (let i = 0; i < count; i++) {
      const x = left + i * (width + 24),
        cx = x + width / 2,
        c = colors[i % 6];
      // Matter flows between organism cards; icons intentionally do not invent species anatomy.
      body += `<g opacity="${0.25 + 0.75 * Math.min(1, p * 2 - i / count)}"><circle cx="${cx}" cy="100" r="31" fill="${c}20" stroke="${c}" stroke-width="2"/>${text(cx, 109, String(i + 1), 26, c)}</g>`;
      body += card(x, 153, width, 180, labels[i], c, Math.max(0, Math.min(1, p * 2 - i / count)));
      if (i < count - 1) body += arrow(x + width + 3, 215, x + width + 21, 215, '#67e8f9', p);
    }
    note =
      'Стрелка идёт от пищи к потребителю: перенос вещества и энергии. Это фрагмент пищевой сети.';
  } else if (
    figure === 'timeline' &&
    values.length >= 1 &&
    values.length <= 6 &&
    values.length === labels.length
  ) {
    height = 440;
    body = line(85, 145, 735, 145, '#8b78a5', 3);
    // Even spacing is explicit: short historical periods must remain readable beside distant dates.
    for (let i = 0; i < values.length; i++) {
      const x = values.length === 1 ? 410 : 100 + (i * 620) / (values.length - 1),
        w = Math.min(180, 690 / values.length - 10),
        c = colors[i % 6];
      body += `<g opacity="${0.22 + 0.78 * Math.min(1, p * 2 - i / values.length)}"><circle cx="${x}" cy="145" r="9" fill="${c}"/>${text(x, 118, num(values[i]), 26, c)}${line(x, 155, x, 179, c, 2)}${card(x - w / 2, 180, w, 210, labels[i], c)}</g>`;
    }
    note = 'Даты и события из примера. Расстояния между отметками не пропорциональны времени.';
  } else if (figure === 'cycle' && labels.length >= 2 && labels.length <= 6) {
    height = 490;
    const n = labels.length,
      points = labels.map((_, i) => {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2;
        return [410 + 260 * Math.cos(a), 225 + 150 * Math.sin(a)];
      });
    for (let i = 0; i < n; i++) {
      const [x, y] = points[i],
        [a, b] = points[(i + 1) % n],
        dx = a - x,
        dy = b - y,
        len = Math.hypot(dx, dy),
        pad = Math.min(86, len * 0.3);
      body += arrow(
        x + (dx / len) * pad,
        y + (dy / len) * pad,
        a - (dx / len) * pad,
        b - (dy / len) * pad,
        '#7d9aaf',
        p,
      );
    }
    for (let i = 0; i < n; i++) {
      const [x, y] = points[i];
      body += card(x - 90, y - 48, 180, 110, labels[i], colors[i % 6], Math.min(1, p * 2 - i / n));
    }
    note = 'Стрелки показывают повторяющуюся последовательность из примера.';
  } else if (figure === 'tree' && labels.length >= 2 && labels.length <= 7) {
    const n = labels.length - 1,
      w = Math.min(170, 700 / n - 10);
    height = 420;
    body += card(275, 30, 270, 80, labels[0], colors[0], p);
    for (let i = 0; i < n; i++) {
      const x = 60 + ((i + 0.5) * 700) / n;
      body += line(410, 110, x, 200, '#7d9aaf', 2);
      body += card(
        x - w / 2,
        200,
        w,
        165,
        labels[i + 1],
        colors[(i + 1) % 6],
        Math.min(1, p * 2 - i / n),
      );
    }
    note =
      'Верхний блок — корень или родительский узел; нижние — его непосредственные ветви в этом примере.';
  } else {
    body =
      text(410, 145, 'Для этого кадра нужны уточнённые данные', 22) +
      text(410, 185, 'Пояснение сохранено ниже рисунка.', 18, '#b9afca');
    note = 'Неполные данные не заменяются выдуманными размерами, числами или связями.';
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 820 ${height + 65}" role="img" aria-label="${esc(drawing.title)}" data-subject-figure="${figure}" style="font-family:Segoe UI,Arial,sans-serif"><title>${esc(drawing.title)}</title><desc>${esc(note)}</desc>${body}${label(410, height + 10, note, 95, 14, '#bcb2d0')}</svg>`;
}
