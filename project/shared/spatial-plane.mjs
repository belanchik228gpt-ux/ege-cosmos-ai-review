/** Bounded spatial relations for live explanations. Coordinates illustrate only the selected case. */
const palette = {
  ink: '#eee8ff',
  purple: '#b49aff',
  cyan: '#6ee7f2',
  gold: '#f6c76f',
  green: '#8ce6b0',
  muted: '#aaa0bc',
};
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c],
  );
const defaults = ['α', 'A', 'B', 'C', 'a', 'β'];
export function spatialPlaneNames(labels) {
  const names = defaults.map((fallback, index) => {
    const supplied = Array.isArray(labels) ? labels[index] : undefined;
    if (typeof supplied !== 'string') return fallback;
    const name = supplied.trim().replace(/^(?:плоскость|точка|прямая)\s+/iu, '');
    return /^[\p{L}][\p{L}\p{N}′'₀-₉]{0,3}$/u.test(name) ? name : fallback;
  });
  // Distinct points and two different planes must not acquire identical names.
  if (new Set(names.slice(1, 4)).size !== 3 || names[0] === names[5]) return [...defaults];
  return names;
}
export const validSpatialPlaneValues = (values) =>
  Array.isArray(values) &&
  values.length === 2 &&
  values.every((v) => Number.isInteger(v) && v >= 0 && v <= 3);
const text = (x, y, value, size = 24, color = palette.ink, anchor = 'middle') =>
  `<text x="${x}" y="${y}" font-size="${size}" fill="${color}" text-anchor="${anchor}">${escape(value)}</text>`;
const path = (a, b, color, progress = 1, width = 4, dashed = false) =>
  `<path d="M${a[0]} ${a[1]}L${a[0] + (b[0] - a[0]) * progress} ${a[1] + (b[1] - a[1]) * progress}" fill="none" stroke="${color}" stroke-width="${width}" ${dashed ? 'stroke-dasharray="8 8"' : ''}/>`;
const point = (x, y, name, color, opacity = 1) =>
  `<g opacity="${opacity}"><circle cx="${x}" cy="${y}" r="8" fill="${color}" stroke="#100c19" stroke-width="3"/>${text(x, y - 19, name, 25, color)}</g>`;
const plane = (points, name, x, y, color, opacity = 1) =>
  `<g opacity="${opacity}"><polygon points="${points}" fill="${color}" fill-opacity="0.13" stroke="${color}" stroke-width="2"/>${text(x, y, name, 29, color)}</g>`;

export function renderSpatialPlane(values, labels = [], progress = 1) {
  if (!validSpatialPlaneValues(values)) return null;
  const [kind, stage] = values,
    [alpha, A, B, C, a, beta] = spatialPlaneNames(labels);
  const p = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 1;
  const appear = (threshold) => (stage === threshold ? p : 1);
  let body = plane('145,335 675,205 865,335 335,465', alpha, 790, 350, palette.purple, appear(0));
  let caption = `Плоскость ${alpha} бесконечна. Параллелограмм изображает лишь её часть.`;
  let relation = `Рассматриваем плоскость ${alpha}`;
  const fullLine = (color, amount = 1) =>
    path([165, 370], [835, 240], color, amount) +
    path([125, 378], [165, 370], color, 1, 3, true) +
    path([835, 240], [875, 232], color, amount, 3, true);
  if (kind === 0) {
    if (stage >= 1) {
      body += fullLine(palette.cyan, appear(1)) + text(855, 218, a, 25, palette.cyan);
      relation = `${a} ⊂ ${alpha}`;
      caption = `По условию прямая ${a} целиком лежит в плоскости ${alpha}.`;
    }
    if (stage >= 2) {
      body += point(410, 322.462, A, palette.gold, appear(2));
      relation = `${A} ∈ ${a},   ${a} ⊂ ${alpha}`;
      caption = `Точка ${A} принадлежит прямой ${a}. Значит, она принадлежит и плоскости ${alpha}.`;
    }
    if (stage >= 3) {
      body += point(555, 375, B, palette.green, appear(3));
      relation = `${A} ∈ ${a},   ${B} ∈ ${alpha},   ${B} ∉ ${a}`;
      caption = `Здесь задано: ${B} лежит в плоскости, но не на прямой. «∈» — принадлежит, «∉» — не принадлежит.`;
    }
  } else if (kind === 1) {
    if (stage >= 1) {
      body +=
        point(345, 325, A, palette.gold, appear(1)) +
        point(620, 290, B, palette.cyan, appear(1)) +
        point(580, 385, C, palette.green, appear(1));
      relation = `${A}, ${B}, ${C} ∈ ${alpha}`;
      caption = 'Даны три различные точки плоскости, не лежащие на одной прямой.';
    }
    if (stage >= 2) {
      body += `<g data-spatial-segments="AB-AC-BC">${path([345, 325], [620, 290], palette.cyan, appear(2))}${path([345, 325], [580, 385], palette.gold, appear(2))}${path([620, 290], [580, 385], palette.green, appear(2))}</g>`;
      relation = `${A}${B}, ${A}${C}, ${B}${C} ⊂ ${alpha}`;
      caption =
        'Прямая через две различные точки плоскости целиком лежит в ней. Отрезок — часть этой прямой.';
    }
    if (stage >= 3) {
      const onAB = (x) => [x, 325 - ((x - 345) * 35) / 275];
      body += `<g data-spatial-full-line="AB">${path(onAB(180), onAB(840), palette.cyan, appear(3), 3)}${path(onAB(135), onAB(180), palette.cyan, 1, 3, true)}${path(onAB(840), onAB(885), palette.cyan, appear(3), 3, true)}${text(863, 239, `${A}${B}`, 23, palette.cyan)}</g>`;
      relation = `Прямая ${A}${B} ⊂ ${alpha}`;
      caption = `Через три неколлинеарные точки проходит ровно одна плоскость. В ней лежит вся прямая ${A}${B}, а не только отрезок.`;
    }
  } else if (kind === 2) {
    if (stage >= 1) {
      body += fullLine(palette.cyan, appear(1)) + text(855, 218, a, 25, palette.cyan);
      relation = `${a} ⊂ ${alpha}`;
      caption = 'Теперь рассмотрим другой случай: точки лежат на одной прямой.';
    }
    if (stage >= 2) {
      body +=
        point(340, 336.045, A, palette.gold, appear(2)) +
        point(505, 304.03, B, palette.green, appear(2)) +
        point(670, 272.015, C, palette.cyan, appear(2));
      relation = `${A}, ${B}, ${C} ∈ ${a},   ${a} ⊂ ${alpha}`;
      caption = 'Точки различны, но коллинеарны: все три принадлежат одной прямой.';
    }
    if (stage >= 3) {
      relation = `${A}, ${B}, ${C} ∈ ${alpha}`;
      caption =
        'Все три точки лежат в показанной плоскости. Но через эту прямую можно провести бесконечно много плоскостей.';
    }
  } else {
    // Both depicted plane patches share this exact diagonal; the mathematical intersection is an infinite line.
    body = plane('155,235 725,135 845,405 275,505', alpha, 205, 273, palette.purple, appear(0));
    if (stage >= 1) {
      body += plane('125,470 695,370 875,170 305,270', beta, 805, 218, palette.green, appear(1));
      relation = `${alpha} и ${beta} — разные пересекающиеся плоскости`;
      caption =
        'Показаны части двух разных пересекающихся плоскостей. Их общие точки образуют прямую.';
    }
    if (stage >= 2) {
      const onLine = (x) => [x, 370 - ((x - 215) * 100) / 570];
      body +=
        path(onLine(135), onLine(865), palette.cyan, appear(2), 5) +
        path(onLine(100), onLine(135), palette.cyan, 1, 3, true) +
        path(onLine(865), onLine(900), palette.cyan, appear(2), 3, true) +
        text(895, 211, a, 25, palette.cyan);
      relation = `${alpha} ∩ ${beta} = ${a}`;
      caption = `Общая прямая ${a} принадлежит обеим плоскостям. «∩» обозначает пересечение.`;
    }
    if (stage >= 3) {
      relation = `${a} ⊂ ${alpha}   и   ${a} ⊂ ${beta}`;
      caption =
        'Пересечение — вся прямая, а не только видимый отрезок внутри двух параллелограммов.';
    }
  }
  const wrap = (value, limit = 83) => {
    const lines = [];
    let row = '';
    for (const word of value.split(' ')) {
      if ((row + ' ' + word).trim().length > limit && row) {
        lines.push(row);
        row = '';
      }
      row += (row ? ' ' : '') + word;
    }
    if (row) lines.push(row);
    return lines.map((line, i) => text(500, 566 + i * 28, line, 20, palette.ink)).join('');
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 650" role="img" data-subject-figure="spatial-plane" data-spatial-case="${kind}" data-spatial-stage="${stage}" style="font-family:Segoe UI,Arial,sans-serif"><title>${escape(relation)}</title><desc>${escape(caption)} Схематический рисунок без масштаба; края изображения не являются границами плоскости.</desc><rect width="1000" height="650" rx="24" fill="#151021"/>${text(38, 42, 'ЧЕРТЁЖ К ОБЪЯСНЕНИЮ', 17, palette.muted, 'start')}${text(500, 90, relation, 24, palette.cyan)}${body}<rect x="30" y="525" width="940" height="102" rx="16" fill="#20182e" stroke="#695387"/><g opacity="${0.2 + 0.8 * p}">${wrap(caption)}</g></svg>`;
}
