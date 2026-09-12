import { lessonLabExamples } from './lesson-lab-data.mjs';
export { lessonLabExamples, lessonLabSources } from './lesson-lab-data.mjs';
const c = {
  ink: '#eee8ff',
  purple: '#b49aff',
  cyan: '#6ee7f2',
  gold: '#f6c76f',
  green: '#8ce6b0',
  pink: '#f2a6cb',
  muted: '#aaa0bc',
};
const esc = (x) =>
  String(x).replace(
    /[&<>"']/g,
    (k) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[k],
  );
const text = (x, y, s, size = 22, color = c.ink, anchor = 'middle') =>
  `<text x="${x}" y="${y}" fill="${color}" font-size="${size}" text-anchor="${anchor}">${esc(s)}</text>`;
const line = (a, b, color = c.muted, width = 3, dash = '') =>
  `<path d="M${a}L${b}" fill="none" stroke="${color}" stroke-width="${width}" ${dash ? `stroke-dasharray="${dash}"` : ''}/>`;
const circle = (x, y, r, color = c.cyan) =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}"/>`;
const box = (x, y, w, h, color = c.purple, fill = '#241d37') =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" stroke="${color}" stroke-width="2" fill="${fill}"/>`;
const poly = (points, color = c.purple, opacity = 0.16) =>
  `<polygon points="${points.map((p) => p.join(',')).join(' ')}" fill="${color}" fill-opacity="${opacity}" stroke="${color}" stroke-width="2"/>`;
const arrow = (a, b, color = c.cyan) => {
  const angle = Math.atan2(b[1] - a[1], b[0] - a[0]),
    n = 12;
  return (
    line(a, b, color, 4) +
    line(b, [b[0] - n * Math.cos(angle - 0.5), b[1] - n * Math.sin(angle - 0.5)], color, 4) +
    line(b, [b[0] - n * Math.cos(angle + 0.5), b[1] - n * Math.sin(angle + 0.5)], color, 4)
  );
};
const words = (s, limit = 56) => {
  const lines = [];
  let row = '';
  for (const word of s.split(' ')) {
    if (row.length + word.length > limit) {
      lines.push(row);
      row = '';
    }
    row += (row ? ' ' : '') + word;
  }
  if (row) lines.push(row);
  return lines;
};
const note = (s, color = c.cyan) =>
  box(35, 488, 930, 80, color, '#1b1729') +
  words(s, 85)
    .slice(0, 3)
    .map((v, i) => text(500, 513 + i * 24, v, 18, color))
    .join('');
const label = (x, y, s, color = c.cyan, w = 245) =>
  box(x - w / 2, y - 26, w, 52, color) + text(x, y + 7, s, 19, color);
const person = (x, y, color = c.gold) =>
  circle(x, y, 19, color) +
  `<path d="M${x - 31} ${y + 68}Q${x - 32} ${y + 26} ${x} ${y + 26}Q${x + 32} ${y + 26} ${x + 31} ${y + 68}Z" fill="${color}" fill-opacity=".65"/>`;
const cubePoints = {
  A: [190, 405],
  B: [440, 405],
  C: [590, 285],
  D: [340, 285],
  A1: [190, 205],
  B1: [440, 205],
  C1: [590, 85],
  D1: [340, 85],
};
const point = (n) => cubePoints[n];
const edge = (a, b, color, width = 7) => line(point(a), point(b), color, width);
const face = (names, color, alpha = 0.18) => poly(names.map(point), color, alpha);
function cube() {
  let svg = '';
  for (const [a, b] of [
    ['A', 'B'],
    ['B', 'C'],
    ['C', 'D'],
    ['D', 'A'],
    ['A1', 'B1'],
    ['B1', 'C1'],
    ['C1', 'D1'],
    ['D1', 'A1'],
    ['A', 'A1'],
    ['B', 'B1'],
    ['C', 'C1'],
    ['D', 'D1'],
  ])
    svg += line(point(a), point(b), '#736784', 2, [a, b].includes('D') ? '7 6' : '');
  for (const [k, [x, y]] of Object.entries(cubePoints))
    svg += text(
      x + (k.startsWith('B') ? 17 : -15),
      y + (k.includes('1') ? -12 : 25),
      k.replace('1', '₁'),
      18,
    );
  return svg;
}
function mathScene(id, s, p) {
  let b = '';
  const hot = (svg) => `<g opacity="${0.35 + 0.65 * p}">${svg}</g>`;
  if (id === 'plane-points') {
    const A = [230, 360],
      B = [555, 335],
      C = [425, 170],
      plane = [
        [100, 415],
        [625, 415],
        [850, 115],
        [325, 115],
      ];
    b = poly(plane, c.purple, 0.18) + text(755, 195, 'α', 38, c.purple);
    if (s === 4) {
      b +=
        poly(
          [
            [200, 210],
            [720, 125],
            [720, 365],
            [200, 450],
          ],
          c.gold,
          0.12,
        ) + line([140, 340], [810, 230], c.cyan, 4);
      for (const [n, x, y] of [
        ['A', 250, 322],
        ['B', 450, 289],
        ['C', 650, 256],
      ])
        b += circle(x, y, 7) + text(x, y + 28, n, 22);
      b += label(480, 100, 'Плоскость не единственная', c.gold, 350);
    } else {
      if (s >= 1)
        for (const [n, [x, y]] of [
          ['A', A],
          ['B', B],
          ['C', C],
        ])
          b += circle(x, y, 7) + text(x - 15, y - 15, n, 24, c.cyan);
      if (s >= 2) b += hot(line(A, B, c.cyan, 6) + line(A, C, c.gold, 6) + line(B, C, c.green, 6));
      if (s === 3)
        b += line([105, 370], [815, 315], c.cyan, 3, '8 6') + text(845, 315, 'AB', 22, c.cyan);
      if (s === 5)
        b +=
          circle(855, 75, 7, c.pink) +
          text(878, 80, 'D', 23, c.pink) +
          line([855, 87], [715, 235], c.pink, 2, '6 6') +
          text(850, 135, 'Дано: D ∉ α', 20, c.pink) +
          label(440, 445, 'Как читается A ∈ α?', c.cyan, 350);
      if (s === 0)
        b +=
          arrow([625, 415], [715, 415], c.purple) +
          arrow([325, 115], [260, 115], c.purple) +
          label(500, 65, 'Плоскость продолжается', c.purple, 350);
    }
    return b;
  }
  b = cube();
  if (id === 'skew-lines') {
    if (s >= 1) b += hot(edge('A', 'B', c.cyan) + edge('C', 'C1', c.gold));
    if (s >= 2) b = face(['A', 'B', 'C', 'D'], c.purple) + b + circle(...point('C'), 9, c.gold);
    b += label(780, 200, s < 2 ? 'AB и CC₁' : 'Не одна плоскость', c.gold, 270);
    if (s >= 3) b += label(780, 280, 'Скрещиваются', c.cyan, 270);
  }
  if (id === 'line-plane-parallel') {
    b = face(['A', 'B', 'C', 'D'], c.purple) + b + edge('A1', 'B1', c.cyan);
    if (s >= 1) b += hot(edge('A', 'B', c.gold));
    if (s >= 2) b += arrow([230, 205], [330, 205], c.cyan) + arrow([230, 405], [330, 405], c.gold);
    b +=
      label(780, 200, s >= 3 ? 'Общих точек нет' : 'A₁B₁ ∥ AB', c.cyan, 270) +
      text(535, 355, 'α', 32, c.purple);
  }
  if (id === 'plane-intersection') {
    b = face(['A', 'B', 'B1', 'A1'], c.purple) + face(['B', 'C', 'C1', 'B1'], c.cyan) + b;
    if (s >= 1) b += circle(...point('B'), 9, c.gold) + circle(...point('B1'), 9, c.gold);
    if (s >= 2) b += hot(line([440, 455], [440, 140], c.gold, 7));
    b +=
      label(780, 215, s >= 3 ? 'α ∩ β = BB₁' : 'Две общие точки', c.gold, 270) +
      text(290, 325, 'α', 32, c.purple) +
      text(525, 290, 'β', 32, c.cyan);
  }
  if (id === 'cube-section') {
    const E = [190, 305],
      F = [440, 305],
      G = [590, 185],
      H = [340, 185];
    b += circle(...E, 8, c.gold) + text(169, 307, 'E', 20, c.gold);
    if (s >= 1)
      b += hot(line(E, F, c.cyan, 6)) + circle(...F, 8, c.gold) + text(458, 315, 'F', 20, c.gold);
    if (s >= 2) {
      b +=
        poly([E, F, G, H], c.green, 0.25) +
        circle(...G, 8, c.gold) +
        circle(...H, 8, c.gold) +
        text(610, 185, 'G', 20, c.gold) +
        text(327, 170, 'H', 20, c.gold);
    }
    b += label(785, 240, s >= 3 ? 'В пространстве — квадрат' : 'Середины рёбер', c.green, 320);
  }
  if (id === 'line-plane-perpendicular') {
    b = face(['A', 'B', 'C', 'D'], c.purple) + b + edge('A', 'A1', c.cyan);
    if (s >= 1) b += edge('A', 'B', c.gold) + edge('A', 'D', c.green);
    if (s >= 2)
      b += hot(
        line([190, 380], [215, 380], c.gold, 3) +
          line([215, 380], [215, 405], c.gold, 3) +
          line([190, 375], [212, 358], c.green, 3) +
          line([212, 358], [212, 388], c.green, 3),
      );
    b +=
      label(790, 210, s >= 3 ? 'AA₁ ⟂ α' : 'Две прямые через A', c.cyan, 290) +
      text(515, 355, 'α', 30, c.purple);
  }
  if (id === 'parallel-planes') {
    b = face(['A', 'B', 'C', 'D'], c.purple) + face(['A1', 'B1', 'C1', 'D1'], c.cyan) + b;
    if (s >= 1) b += edge('A', 'B', c.gold) + edge('A', 'D', c.green);
    if (s >= 2) b += hot(edge('A1', 'B1', c.gold) + edge('A1', 'D1', c.green));
    b +=
      text(475, 350, 'α', 30, c.purple) +
      text(475, 145, 'β', 30, c.cyan) +
      label(790, 245, s >= 3 ? 'α ∥ β' : 'Сравни две пары', c.cyan, 270);
  }
  return b;
}
function resistorScene(s, p) {
  let b =
    line([160, 220], [840, 220], c.muted, 4) +
    line([840, 220], [840, 405], c.muted, 4) +
    line([840, 405], [160, 405], c.muted, 4) +
    line([160, 405], [160, 220], c.muted, 4);
  b +=
    box(275, 180, 180, 80, c.cyan) +
    box(585, 180, 180, 80, c.gold) +
    text(365, 215, 'R₁ = 2 Ом', 22, c.cyan) +
    text(675, 215, 'R₂ = 4 Ом', 22, c.gold);
  b +=
    circle(500, 405, 40, '#271e3a') +
    line([486, 381], [486, 428], c.purple, 5) +
    line([510, 392], [510, 418], c.purple, 5) +
    text(500, 470, 'Источник: 6 В', 20, c.purple);
  if (s >= 1)
    b +=
      arrow([170, 220], [245, 220]) +
      arrow([475, 220], [555, 220]) +
      arrow([785, 220], [835, 220]) +
      circle(180 + p * 52, 220, 6, c.cyan);
  if (s >= 2) b += label(500, 100, 'I = 1 А в обоих резисторах', c.green, 440);
  if (s >= 3)
    b += label(365, 310, 'U₁ = 2 В', c.cyan, 200) + label(675, 310, 'U₂ = 4 В', c.gold, 200);
  return b;
}
function ionicScene(s, p) {
  const terms = [
    ['Na⁺', c.purple],
    ['OH⁻', c.cyan],
    ['H⁺', c.gold],
    ['Cl⁻', c.pink],
  ];
  let b = '';
  if (s === 0)
    return (
      text(500, 165, 'HCl + NaOH → NaCl + H₂O', 36) +
      box(90, 230, 360, 180, c.cyan) +
      box(550, 230, 360, 180, c.gold) +
      text(270, 315, 'Раствор HCl', 26, c.cyan) +
      text(730, 315, 'Раствор NaOH', 26, c.gold) +
      arrow([465, 320], [535, 320])
    );
  terms.forEach(([v, col], i) => {
    const x = 140 + i * 225;
    b += circle(x, 155, 47, col) + text(x, 164, v, 28, '#151220');
  });
  b += arrow([500, 220], [500, 260]);
  b +=
    circle(200, 345, 47, c.purple) +
    text(200, 354, 'Na⁺', 28, '#151220') +
    circle(500, 345, 62, c.green) +
    text(500, 354, 'H₂O', 32, '#151220') +
    circle(800, 345, 47, c.pink) +
    text(800, 354, 'Cl⁻', 28, '#151220');
  if (s >= 2) {
    for (const [a, z, col] of [
      [[140, 155], [200, 345], c.purple],
      [[815, 155], [800, 345], c.pink],
    ])
      b += line(a, z, col, 2, '8 6');
    b +=
      line([100, 125], [180, 185], c.ink, 4) +
      line([160, 315], [240, 375], c.ink, 4) +
      line([775, 125], [855, 185], c.ink, 4) +
      line([760, 315], [840, 375], c.ink, 4);
  }
  if (s >= 3) b += label(500, 445, 'H⁺ + OH⁻ → H₂O', c.green, 360);
  if (s >= 2)
    b +=
      text(205, 430, 'Ион остаётся в воде', 17, c.purple) +
      text(800, 430, 'Ион остаётся в воде', 17, c.pink);
  return b;
}
function dnaScene(s, p) {
  const bases = ['А', 'Г', 'Т', 'Ц'],
    match = ['Т', 'Ц', 'А', 'Г'];
  let b = '';
  const strand = (x, seq, col, startY = 130) =>
    line([x, startY - 20], [x, startY + 260], col, 6) +
    seq
      .map(
        (v, i) =>
          circle(x, startY + i * 65, 22, col) + text(x, startY + i * 65 + 7, v, 21, '#141121'),
      )
      .join('');
  if (s === 0) {
    b = strand(430, bases, c.purple) + strand(565, match, c.purple);
    for (let i = 0; i < 4; i++) b += line([455, 130 + i * 65], [540, 130 + i * 65], c.muted, 3);
    b += text(500, 430, 'Две исходные цепи', 24, c.purple);
  } else {
    b = strand(230, bases, c.purple) + strand(760, match, c.purple);
    if (s >= 2) {
      b += strand(360, match, c.green) + strand(630, bases, c.green);
      for (let i = 0; i < 4; i++)
        b +=
          line([255, 130 + i * 65], [335, 130 + i * 65], c.muted, 3) +
          line([655, 130 + i * 65], [735, 130 + i * 65], c.muted, 3);
    } else b += arrow([425, 245], [295, 245], c.purple) + arrow([575, 245], [695, 245], c.purple);
    if (s >= 3)
      b +=
        label(295, 430, 'Старая + новая', c.green, 285) +
        label(695, 430, 'Новая + старая', c.green, 285);
  }
  b += text(500, 70, 'А ↔ Т       Г ↔ Ц', 28, c.gold);
  return b;
}
function breezeScene(s, p) {
  let b =
    `<path d="M40 360H500V455H40Z" fill="#153e5b"/><path d="M500 360H960V455H500Z" fill="#4b4130"/>` +
    text(245, 410, 'Море · прохладнее', 23, c.cyan) +
    text(740, 410, 'Суша · теплее', 23, c.gold) +
    circle(835, 95, 37, c.gold);
  for (let i = 0; i < 5; i++) b += line([85 + i * 80, 380], [115 + i * 80, 380], c.cyan, 3);
  if (s >= 1) b += arrow([740, 330], [740, 150], c.gold);
  if (s >= 2)
    b +=
      arrow([250, 320], [690, 320], c.cyan) +
      circle(285 + p * 325, 320, 7, c.cyan) +
      text(455, 294, 'Ветер у поверхности', 20, c.cyan);
  if (s >= 3)
    b += arrow([700, 135], [290, 135], c.purple) + arrow([250, 150], [250, 280], c.purple);
  return b;
}
function industryScene(s, p) {
  let b = '';
  if (s === 0) {
    b +=
      box(100, 160, 400, 240, c.gold) +
      line([145, 205], [455, 205], c.gold, 5) +
      line([145, 350], [455, 350], c.gold, 5);
    for (let i = 0; i < 7; i++) b += line([180 + i * 35, 205], [180 + i * 35, 350], c.purple, 2);
    b += person(680, 225, c.gold) + text(300, 435, 'Ручной ткацкий станок', 24, c.gold);
  } else {
    b +=
      poly(
        [
          [90, 385],
          [90, 225],
          [195, 160],
          [195, 225],
          [300, 160],
          [300, 225],
          [405, 160],
          [405, 385],
        ],
        c.purple,
        0.28,
      ) + box(315, 105, 45, 135, c.muted, '#332b3e');
    for (let i = 0; i < 3; i++) b += box(120 + i * 85, 285, 50, 65, c.gold, '#5a4730');
    b += text(250, 430, 'Фабрика', 26, c.purple);
    if (s >= 2) {
      b +=
        circle(600, 305, 65, '#342e44') +
        `<circle cx="600" cy="305" r="59" fill="none" stroke="${c.gold}" stroke-width="5"/>` +
        line(
          [600 - 50 * Math.cos(p * 2), 305 - 50 * Math.sin(p * 2)],
          [600 + 50 * Math.cos(p * 2), 305 + 50 * Math.sin(p * 2)],
          c.gold,
          5,
        ) +
        box(730, 220, 130, 145, c.gold) +
        line([665, 280], [730, 260], c.cyan, 5) +
        line([665, 330], [730, 340], c.cyan, 5) +
        text(740, 420, 'Вал и привод машин', 22, c.cyan);
    }
    if (s >= 3)
      b +=
        person(485, 118, c.green) +
        person(550, 118, c.green) +
        text(575, 95, 'Наёмный труд', 18, c.green);
  }
  b += text(500, 65, 'Великобритания · XVIII–XIX века', 26, c.gold);
  return b;
}
function externalityScene(s, p) {
  let b =
    box(65, 165, 260, 145, c.purple) +
    text(195, 225, 'Фабрика', 28, c.purple) +
    person(810, 180, c.green) +
    text(810, 290, 'Покупатель', 23, c.green) +
    arrow([355, 205], [715, 205], c.green) +
    text(520, 185, 'Товар', 20, c.green) +
    arrow([715, 270], [355, 270], c.gold) +
    text(520, 305, 'Оплата', 20, c.gold);
  if (s >= 1) {
    b +=
      box(645, 345, 240, 100, c.pink) +
      poly(
        [
          [635, 345],
          [765, 320],
          [895, 345],
        ],
        c.pink,
        0.25,
      ) +
      text(765, 400, 'Дом соседей', 22, c.pink) +
      arrow([210, 325], [570, 390], c.muted);
    for (let i = 0; i < 4; i++) b += circle(280 + i * 70, 350 + i * 10, 18, '#6c627c');
  }
  if (s >= 2) b += text(410, 450, 'Ущерб вне цены сделки', 24, c.pink);
  return b;
}
function commaScene(s, p) {
  let b = '';
  const parts = [
    ['Листья', 165, 245, c.cyan],
    ['освещённые солнцем', 520, 420, c.gold],
    ['казались золотыми.', 520, 460, c.green],
  ];
  b += text(500, 110, 'Существительное → какой признак?', 25, c.muted);
  b +=
    box(60, 180, 205, 82, c.cyan) +
    text(162, 230, 'Листья', 29, c.cyan) +
    box(300, 180, 620, 82, s >= 1 ? c.gold : c.muted) +
    text(610, 230, 'освещённые солнцем', 29, s >= 1 ? c.gold : c.ink) +
    text(500, 355, 'казались золотыми.', 32, c.green);
  if (s >= 1) b += arrow([175, 155], [480, 155], c.gold) + text(370, 140, 'какие?', 22, c.gold);
  if (s >= 2) b += text(280, 233, ',', 50, c.pink) + text(933, 233, ',', 50, c.pink);
  if (s >= 3) b += label(500, 440, 'Основа: листья казались золотыми', c.green, 680);
  return b;
}
function narratorScene(s, p) {
  let b =
    person(135, 165, c.gold) +
    text(135, 280, 'Автор', 25, c.gold) +
    box(330, 105, 595, 335, c.purple) +
    line([365, 130], [365, 415], c.muted, 2) +
    text(635, 155, 'ВНУТРИ ТЕКСТА', 21, c.purple);
  if (s >= 1) {
    b +=
      person(445, 215, c.cyan) +
      text(455, 325, s >= 3 ? 'Повествователь' : 'Рассказчик «я»', 20, c.cyan) +
      box(545, 205, 340, 170, c.cyan) +
      text(715, 250, s >= 3 ? '«Он вошёл в сад,' : '«Я вошёл в сад', 23, c.ink) +
      text(715, 285, s >= 3 ? 'не замечая письма».' : 'и заметил письмо».', 23, c.ink);
  }
  if (s >= 2)
    b +=
      line([220, 320], [295, 245], c.pink, 5) +
      line([220, 245], [295, 320], c.pink, 5) +
      text(235, 360, 'не равно', 18, c.pink);
  return b;
}
function englishScene(s, p) {
  let b =
    line([100, 350], [900, 350], c.muted, 4) +
    arrow([875, 350], [925, 350], c.muted) +
    text(230, 400, 'yesterday', 24, c.gold) +
    text(795, 400, 'now', 24, c.cyan) +
    circle(230, 350, 9, c.gold) +
    circle(795, 350, 9, c.cyan);
  if (s === 0) b += text(500, 160, 'Когда произошло? Что важно сейчас?', 27);
  if (s >= 1)
    b += box(70, 95, 860, 70, c.gold) + text(500, 139, 'I lost my key yesterday.', 31, c.gold).replace('yesterday.', s >= 3 ? '<tspan text-decoration="underline">yesterday.</tspan>' : 'yesterday.');
  if (s >= 2)
    b +=
      box(70, 195, 860, 70, c.cyan) +
      text(500, 238, 'I have lost my key.', 31, c.cyan) +
      arrow([480, 305], [770, 305], c.cyan) +
      text(570, 445, 'Результат важен сейчас', 24, c.cyan);
  return b;
}
function binaryScene(s, p) {
  let b = text(500, 95, 'Ищем 11 · проверяем слева направо', 28, c.gold);
  const current = s < 1 ? -1 : Math.min(s - 1, 2);
  [19, 7, 11, 3, 23, 15, 27].forEach((v, i) => {
    let col = c.purple;
    if (i < current) col = c.muted;
    if (i === current) col = c.gold;
    const alpha = i < current ? 0.28 : 1;
    b +=
      `<g opacity="${alpha}">` +
      box(72 + i * 125, 200, 110, 85, col) +
      text(127 + i * 125, 255, v, 32, col) +
      text(127 + i * 125, 325, `[${i}]`, 20, c.muted) +
      '</g>';
  });
  if (s >= 1) b += arrow([127 + current * 125, 140], [127 + current * 125, 190], c.gold);
  if (s >= 3) b += label(500, 425, 'Число 11 · индекс 2', c.green, 500);
  return b;
}
function experimentScene(s, p) {
  let b = text(500, 85, 'Проверяем влияние освещения на рост', 25);
  for (const [x, col, title] of [
    [260, c.purple, 'Группа A'],
    [740, c.gold, 'Группа B'],
  ]) {
    b += box(x - 170, 135, 340, 280, col) + text(x, 175, title, 25, col);
    for (let i = 0; i < 3; i++) {
      const px = x - 100 + i * 100;
      b +=
        box(px - 28, 325, 56, 50, col, '#4a3c33') +
        line([px, 325], [px, 260], c.green, 4) +
        poly(
          [
            [px, 290],
            [px - 28, 275],
            [px - 28, 295],
          ],
          c.green,
          0.7,
        ) +
        poly(
          [
            [px, 280],
            [px + 25, 260],
            [px + 25, 282],
          ],
          c.green,
          0.7,
        );
    }
    b += text(x, 395, s >= 2 ? 'Измеряем одинаково' : 'Один вид и возраст', 19, c.muted);
  }
  if (s >= 1)
    b +=
      circle(250, 215, 17, c.gold) +
      circle(690, 215, 17, c.gold) +
      circle(750, 215, 17, c.gold) +
      circle(810, 215, 17, c.gold);
  if (s >= 2)
    b += line([105, 235], [105, 375], c.cyan, 4) + line([585, 235], [585, 375], c.cyan, 4);
  if (s >= 3) b += text(500, 457, 'Данных пока нет: результат не выдумываем', 22, c.cyan);
  return b;
}
export function validLessonLabValues(values) {
  return (
    Array.isArray(values) &&
    values.length === 2 &&
    values.every(Number.isInteger) &&
    values[0] >= 0 &&
    values[0] < lessonLabExamples.length &&
    values[1] >= 0 &&
    values[1] < lessonLabExamples[values[0]].steps.length
  );
}
export function renderLessonLab(values, progress = 1) {
  if (!validLessonLabValues(values)) return null;
  const [scenario, s] = values,
    item = lessonLabExamples[scenario],
    p = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 1;
  let body = '';
  if (item.subject === 'math') body = mathScene(item.id, s, p);
  else
    body = {
      physics: resistorScene,
      chemistry: ionicScene,
      biology: dnaScene,
      geography: breezeScene,
      history: industryScene,
      social: externalityScene,
      russian: commaScene,
      literature: narratorScene,
      english: englishScene,
      informatics: binaryScene,
      project: experimentScene,
    }[item.subject](s, p);
  const cue =
    s === item.steps.length - 1
      ? 'Теперь объясни своими словами'
      : s === 0
        ? 'Сначала рассматриваем условие'
        : s === item.steps.length - 2
          ? 'Свяжем рисунок с правилом'
          : 'Один шаг — одно изменение';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 590" role="img" aria-label="${esc(item.title)}" data-subject-figure="lesson-lab" data-lab-id="${item.id}" data-stage="${s}" style="font-family:Segoe UI,Arial,sans-serif"><title>${esc(item.title)}</title><desc>${esc(item.steps[s].caption)}</desc><rect width="1000" height="590" rx="20" fill="#161222"/>${text(35, 34, `ШАГ ${s + 1} / ${item.steps.length}`, 17, c.muted, 'start')}${body}${note(cue, s === item.steps.length - 1 ? c.gold : c.cyan)}</svg>`;
}
