/** Fixed regional atlas. Model labels never define coastlines, places or routes. */
import registry from './history-atlas.json' with { type: 'json' };

const freeze = (object) => {
  Object.freeze(object);
  for (const value of Object.values(object))
    if (value && typeof value === 'object' && !Object.isFrozen(value)) freeze(value);
  return object;
};
export const historyAtlas = freeze(registry);
export function getHistoryAtlas(index) {
  return Number.isInteger(index) && index >= 0 ? historyAtlas.maps[index] : undefined;
}
export function validHistoryAtlasValues(values) {
  return (
    Array.isArray(values) &&
    values.length === 2 &&
    values.every(Number.isInteger) &&
    !!getHistoryAtlas(values[0]) &&
    values[1] >= 0 &&
    values[1] <= 3
  );
}
/** The fixed map owns its narration, so model prose cannot describe another frame. */
export function historyStageContent(values) {
  if (!validHistoryAtlasValues(values)) return undefined;
  const stage = getHistoryAtlas(values[0]).stages[values[1]];
  return { caption: stage.caption, labels: [stage.date, stage.heading], formula: '' };
}
const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const number = (value) => +value.toFixed(2);
const colors = { cyan: '#75e3ed', gold: '#f5be72', rose: '#f39ead' };
function wrap(value, max = 29) {
  const result = [];
  let line = '';
  for (const word of String(value).split(/\s+/)) {
    if (line && line.length + word.length + 1 > max) {
      result.push(line);
      line = '';
    }
    line += (line ? ' ' : '') + word;
  }
  if (line) result.push(line);
  return result;
}
const text = (x, y, value, size = 16, color = '#eee8fa', anchor = 'start') =>
  `<text x="${number(x)}" y="${number(y)}" text-anchor="${anchor}" fill="${color}" font-size="${size}" paint-order="stroke" stroke="#121528" stroke-width="2.5" stroke-linejoin="round">${esc(value)}</text>`;
const paragraph = (x, y, value, max = 29, size = 16, color = '#dfdbea') =>
  wrap(value, max)
    .map((line, i) => text(x, y + i * (size + 6), line, size, color))
    .join('');

export function historyAtlasProjection(map) {
  const [west, south, east, north] = map.bounds;
  const longitudeScale = Math.cos((((south + north) / 2) * Math.PI) / 180);
  const scale = Math.min(484 / ((east - west) * longitudeScale), 286 / (north - south));
  const left = 20 + (520 - (east - west) * longitudeScale * scale) / 2;
  const top = 74 + (320 - (north - south) * scale) / 2;
  return ([lon, lat]) => [
    number(left + (lon - west) * longitudeScale * scale),
    number(top + (north - lat) * scale),
  ];
}
function path(points, project, close = false) {
  return (
    points.map((point, i) => `${i ? 'L' : 'M'}${project(point).join(' ')}`).join('') +
    (close ? 'Z' : '')
  );
}
function travelled(points, progress) {
  const lengths = points
    .slice(1)
    .map((p, i) => Math.hypot(p[0] - points[i][0], p[1] - points[i][1]));
  let remaining = lengths.reduce((a, b) => a + b, 0) * progress;
  const result = [points[0]];
  for (let i = 0; i < lengths.length; i++) {
    if (remaining >= lengths[i]) {
      result.push(points[i + 1]);
      remaining -= lengths[i];
    } else {
      const t = lengths[i] ? remaining / lengths[i] : 0;
      result.push([
        points[i][0] + (points[i + 1][0] - points[i][0]) * t,
        points[i][1] + (points[i + 1][1] - points[i][1]) * t,
      ]);
      break;
    }
  }
  return result;
}
function routeSvg(route, project, p, dim = false) {
  const color = colors[route.color],
    points = travelled(route.points.map(project), p),
    end = points.at(-1),
    prev = points.at(-2) || end;
  const angle = Math.atan2(end[1] - prev[1], end[0] - prev[0]),
    q = 10;
  const head =
    p > 0.015
      ? `<path d="M${number(end[0] - q * Math.cos(angle - 0.52))} ${number(end[1] - q * Math.sin(angle - 0.52))}L${end.map(number).join(' ')}L${number(end[0] - q * Math.cos(angle + 0.52))} ${number(end[1] - q * Math.sin(angle + 0.52))}" fill="none" stroke="${color}" stroke-width="3"/>`
      : '';
  return `<g data-atlas-route="${esc(route.id)}" data-route-progress="${number(p)}" opacity="${dim ? 0.35 : 1}"><title>${esc(route.label)}</title><path d="${path(points, (v) => v)}" fill="none" stroke="#0b1022" stroke-width="7" stroke-linejoin="round"/><path d="${path(points, (v) => v)}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" ${route.kind === 'retreat' ? 'stroke-dasharray="7 5"' : ''}/>${head}</g>`;
}

export function renderHistoryAtlas(values, progress = 1) {
  if (!validHistoryAtlasValues(values)) return null;
  const [mapIndex, stageIndex] = values,
    map = getHistoryAtlas(mapIndex),
    stage = map.stages[stageIndex];
  const p = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 1,
    project = historyAtlasProjection(map);
  const land = map.land
    .map(
      (poly) =>
        `<path d="${poly.map((r) => path(r, project, true)).join('')}" fill="#2a2b3c" fill-rule="evenodd"/>`,
    )
    .join('');
  // Coastlines retain only source segments; the edge of a regional crop is not a coast.
  const coasts = map.coastlines
    .map((r) => `<path d="${path(r, project)}" fill="none" stroke="#7d91a0" stroke-width="1.15"/>`)
    .join('');
  const [mapLeft, mapTop] = project([map.bounds[0], map.bounds[3]]),
    [mapRight, mapBottom] = project([map.bounds[2], map.bounds[1]]);
  const rivers = map.rivers
    .map((r) => `<path d="${path(r, project)}" fill="none" stroke="#558d9d" stroke-width="1.5"/>`)
    .join('');
  const names = [
    ...map.waterLabels.map((l) => ({ ...l, color: '#83b4c1', size: 14 })),
    ...map.landLabels.map((l) => ({ ...l, color: '#b0b1c5', size: 13 })),
  ]
    .map((l) => {
      const [x, y] = project(l.coordinates);
      return text(x, y, l.text, l.size, l.color, 'middle');
    })
    .join('');
  const routes = map.routes
    .filter((r) => r.stage <= stageIndex)
    .map((r) =>
      routeSvg(
        r,
        project,
        r.stage === stageIndex ? p : 1,
        map.index === 2 && stageIndex >= 2 && r.kind === 'advance',
      ),
    )
    .join('');
  const markers = map.places
    .map((place) => {
      const [x, y] = project(place.coordinates),
        active = stage.highlight.includes(place.id),
        r = active ? 5 : 3.5,
        color = place.faction ? colors[place.faction] : active ? '#eee8fa' : '#b8bccb';
      const dx = place.offset[0],
        dy = place.offset[1];
      return `<g data-atlas-place="${esc(place.id)}"><title>${esc(place.label)}</title>${active ? `<circle cx="${x}" cy="${y}" r="${number(8 + 4 * p)}" fill="none" stroke="${color}" opacity="${number(0.2 + 0.35 * p)}"/>` : ''}<circle cx="${x}" cy="${y}" r="${r}" fill="${color}" stroke="#101629" stroke-width="1.5"/>${Math.abs(dx) + Math.abs(dy) > 24 ? `<path d="M${x} ${y}L${number(x + dx * 0.8)} ${number(y + dy * 0.8)}" stroke="${color}" stroke-width=".8" fill="none"/>` : ''}${text(x + dx, y + dy, place.label, 14, color, place.anchor)}</g>`;
    })
    .join('');
  const headings = paragraph(562, 112, stage.heading, 26, 18, '#90e0e8');
  const headingLines = wrap(stage.heading, 26).length;
  const explanation = paragraph(562, 124 + headingLines * 24, stage.explanation, 27, 16);
  const participants = map.participants
    .map(
      (item, i) =>
        `<circle cx="${31 + i * 382}" cy="423" r="4" fill="${colors[item.color]}"/>${text(43 + i * 382, 428, item.label, 14, colors[item.color])}`,
    )
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 820 540" role="img" aria-label="${esc(map.title + ' — ' + stage.title)}" data-subject-figure="history-map" data-atlas-id="${esc(map.id)}" data-atlas-stage="${stageIndex}" style="font-family:Segoe UI,Arial,sans-serif"><title>${esc(map.title + ' — ' + stage.title)}</title><desc>${esc(historyAtlas.legend + ' ' + map.geographyNote)}</desc><rect x="1" y="1" width="818" height="538" rx="20" fill="#111426"/>${text(22, 34, map.title, 22)}${text(800, 33, stage.date, 17, '#f4cc91', 'end')}<rect x="20" y="74" width="520" height="320" rx="14" fill="#141727" stroke="#35465c"/><rect x="${mapLeft}" y="${mapTop}" width="${number(mapRight - mapLeft)}" height="${number(mapBottom - mapTop)}" fill="#142535"/>${land}${coasts}${rivers}${names}${routes}${markers}<path d="M511 119V91l-5 8m5-8 5 8" fill="none" stroke="#b7c9d8" stroke-width="1.5"/>${text(511, 85, 'С', 11, '#b7c9d8', 'middle')}<path d="M548 76V393" stroke="#37405a"/>${text(562, 84, `ЭТАП ${stageIndex + 1} / 4`, 11, '#aaa6bc')}${headings}${explanation}${participants}<path d="M22 446H798" stroke="#35364c"/>${paragraph(22, 469, historyAtlas.legend, 100, 13, '#bbb8cc')}${paragraph(22, 510, map.geographyNote, 104, 12, '#a5a7bb')}</svg>`;
}
