/** Eight authored, finite chemistry illustrations. Never evaluate model formulas or markup. */
export { formulaAtomCounts } from './chemistry-atoms.cjs';
const SCENARIOS = [
  {
    id: 0,
    title: 'Баланс атомов: образование воды',
    equation: '2H2 + O2 → 2H2O',
    atoms: { H: 4, O: 2 },
  },
  {
    id: 1,
    title: 'Разложение карбоната кальция',
    equation: 'CaCO3 → CaO + CO2',
    atoms: { Ca: 1, C: 1, O: 3 },
  },
  { id: 2, title: 'Масса и количество вещества', mass: 36, molarMass: 18, amount: 2 },
  {
    id: 3,
    title: 'Масса продукта по уравнению',
    mass: 10,
    molarMass: 100,
    amount: 0.1,
    productMolarMass: 56,
    productMass: 5.6,
  },
  {
    id: 4,
    title: 'Полное сгорание метана',
    equation: 'CH4 + 2O2 → CO2 + 2H2O',
    atoms: { C: 1, H: 4, O: 4 },
  },
  {
    id: 5,
    title: 'Замещение: цинк и соляная кислота',
    equation: 'Zn + 2HCl → ZnCl2 + H2',
    atoms: { Zn: 1, H: 2, Cl: 2 },
  },
  { id: 6, title: 'Массовая доля соли в растворе', mass: 10, solutionMass: 100, massFraction: 0.1 },
  {
    id: 7,
    title: 'Объём газа при заданных условиях',
    amount: 0.5,
    molarVolume: 22.4,
    volume: 11.2,
  },
];
export function chemistryScenario(index) {
  const s = SCENARIOS[index];
  return Number.isInteger(index) && s
    ? { ...s, ...(s.atoms ? { atoms: { ...s.atoms } } : {}) }
    : undefined;
}
export function validChemistryValues(values) {
  return (
    Array.isArray(values) &&
    values.length === 2 &&
    Number.isInteger(values[0]) &&
    values[0] >= 0 &&
    values[0] <= 7 &&
    Number.isInteger(values[1]) &&
    values[1] >= 0 &&
    values[1] <= 5
  );
}
const color = {
  H: '#67e8f9',
  O: '#fb9cb0',
  C: '#d9c7ff',
  Ca: '#facc72',
  Zn: '#facc72',
  Cl: '#91e3a9',
};
const escape = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const text = (x, y, content, size = 25, fill = '#f0e9ff', extra = '') =>
  `<text x="${x}" y="${y}" text-anchor="middle" fill="${fill}" font-size="${size}" ${extra}>${escape(content)}</text>`;
const line = (x, y, a, b, fill = '#b09fc9', width = 3, extra = '') =>
  `<path d="M${x} ${y}L${a} ${b}" fill="none" stroke="${fill}" stroke-width="${width}" ${extra}/>`;
const round = (n) => Number(n.toFixed(3));
function arrow(x, y, a, b, p = 1) {
  const end = x + (a - x) * p;
  return (
    line(x, y, end, b, '#b69bff', 4) +
    (p > 0.9
      ? `<path d="M${a - 12} ${b - 8}L${a} ${b}L${a - 12} ${b + 8}" fill="none" stroke="#b69bff" stroke-width="4"/>`
      : '')
  );
}
function atom(element, id, x, y, active) {
  return `<g data-atom-id="${id}" data-element="${element}" transform="translate(${round(x)} ${round(y)})"><circle r="${element === 'H' ? 20 : 24}" fill="${color[element]}" fill-opacity="${active ? 0.28 : 0.13}" stroke="${color[element]}" stroke-width="${active ? 4 : 2}"/>${text(0, 8, element, element.length === 2 ? 23 : 24, color[element])}</g>`;
}
/** Formula tokens keep element symbols/indices separate from the multiplier. */
function formula(x, y, molecule, coefficient, emphasis, scale = 1) {
  const atoms = [...molecule.matchAll(/([A-Z][a-z]?)(\d*)/g)];
  const tokenWidths = atoms.map(
    ([_, element, sub]) => (element.length === 2 ? 42 : 27) + (sub ? 18 : 0),
  );
  const width = tokenWidths.reduce((a, b) => a + b, 0) + (coefficient ? 30 : 0);
  let cursor = -width / 2,
    output = '';
  if (coefficient) {
    output += text(
      cursor + 12,
      0,
      coefficient,
      36,
      '#facc72',
      `data-coefficient="${coefficient}" font-weight="${emphasis === 'coefficient' ? '800' : '600'}"`,
    );
    if (emphasis === 'coefficient') output += line(cursor, -32, cursor + 25, -32, '#facc72', 4);
    cursor += 30;
  }
  for (let i = 0; i < atoms.length; i++) {
    const [, element, sub] = atoms[i],
      elementWidth = element.length === 2 ? 42 : 27;
    output += text(
      cursor + elementWidth / 2,
      0,
      element,
      34,
      color[element],
      `data-formula-element="${element}"`,
    );
    cursor += elementWidth;
    if (sub) {
      output += text(cursor + 7, 10, sub, 21, '#f0e9ff', `data-index="${sub}"`);
      if (emphasis === 'index')
        output += `<rect x="${cursor - 3}" y="-8" width="22" height="25" rx="4" fill="none" stroke="#f0e9ff" stroke-width="2"/>`;
      cursor += 18;
    }
  }
  return `<g transform="translate(${x} ${y}) scale(${scale})">${output}</g>`;
}
function atomModel(scenario, stage, progress) {
  const water = scenario === 0;
  const symbols = water ? ['H', 'H', 'H', 'H', 'O', 'O'] : ['Ca', 'C', 'O', 'O', 'O'];
  const start = water
    ? [
        [135, 164],
        [182, 164],
        [135, 237],
        [182, 237],
        [272, 188],
        [319, 188],
      ]
    : [
        [160, 178],
        [235, 203],
        [232, 143],
        [282, 223],
        [182, 253],
      ];
  const target = water
    ? [
        [536, 146],
        [614, 146],
        [536, 245],
        [614, 245],
        [575, 176],
        [575, 275],
      ]
    : [
        [460, 205],
        [669, 205],
        [507, 205],
        [616, 205],
        [722, 205],
      ];
  const t = stage >= 4 ? 1 : stage === 3 ? progress : 0;
  let body = '';
  if (water) {
    const bondsStart = [
        [0, 1],
        [2, 3],
        [4, 5],
      ],
      bondsEnd = [
        [0, 4],
        [1, 4],
        [2, 5],
        [3, 5],
      ];
    for (const [i, j] of bondsStart)
      body += line(...start[i], ...start[j], '#8f83a3', 4, `opacity="${1 - t}"`);
    for (const [i, j] of bondsEnd)
      body += line(...target[i], ...target[j], '#8f83a3', 4, `opacity="${t}"`);
  }
  // Stable atom identities interpolate only positions. H never becomes O.
  symbols.forEach((el, i) => {
    body += atom(
      el,
      `${water ? 'water' : 'carbonate'}-${el}-${i}`,
      start[i][0] + (target[i][0] - start[i][0]) * t,
      start[i][1] + (target[i][1] - start[i][1]) * t,
      stage === 1 || stage === 3,
    );
  });
  body += arrow(366, 204, water ? 445 : 427, 204);
  if (water) {
    body += text(220, 110, t < 1 ? 'Исходные частицы' : 'Исходная область', 19, '#bdacd5');
    body += text(
      584,
      110,
      t > 0 ? 'Связи перестраиваются' : 'Здесь образуется вода',
      19,
      '#bdacd5',
    );
    body += text(410, 340, 'В каждом кадре: 4 атома H и 2 атома O', 23);
    body += text(
      410,
      370,
      'Цвет — элемент. Число частиц условно, размеры не в масштабе.',
      17,
      '#baabc9',
    );
  } else {
    body += text(
      220,
      105,
      t < 1 ? 'Учёт одной формульной единицы' : 'Исходная область',
      18,
      '#bdacd5',
    );
    body += text(595, 105, t > 0 ? 'CaO и CO₂' : 'Распределяем те же атомы', 19, '#bdacd5');
    if (t > 0)
      body += `<g opacity="${t}">${text(561, 214, '+', 27)}${text(484, 266, 'CaO', 21, color.Ca)}${text(669, 266, 'CO₂', 21, color.C)}</g>`;
    body +=
      text(215, 326, 'Ca: 1 = 1', 23, color.Ca) +
      text(400, 326, 'C: 1 = 1', 23, color.C) +
      text(613, 326, 'O: 3 = 1 + 2', 23, color.O);
    body += text(
      410,
      361,
      'Условный учёт состава; CaCO₃ и CaO не показаны как молекулы.',
      17,
      '#baabc9',
    );
    body += text(410, 387, 'Схема не передаёт строение кристаллических решёток.', 17, '#baabc9');
  }
  return body;
}
function calculation(stage, scenario, progress) {
  const stoich = scenario === 3;
  let body = '';
  if (!stoich) {
    body += text(410, 115, 'Вода: m = 36 г; M = 18 г/моль', 29);
    if (stage === 0) {
      body += text(240, 209, '36 г', 47, '#67e8f9');
      body += arrow(325, 199, 474, 199, progress);
      body += text(583, 209, 'n — ? моль', 36, '#facc72');
      body += text(
        410,
        290,
        'Ищем количество вещества, а не число отдельных молекул.',
        21,
        '#cabbdd',
      );
    } else if (stage < 3) {
      body += text(265, 212, 'n =', 43, '#d7b8ff');
      body += text(440, 174, stage === 1 ? 'm' : '36 г', 36, '#67e8f9', 'data-quantity="mass"');
      body += line(341, 196, 539, 196, '#c9b4e8', 4);
      body += text(
        440,
        237,
        stage === 1 ? 'M' : '18 г/моль',
        34,
        '#facc72',
        'data-quantity="molar-mass"',
      );
      body += text(410, 310, 'Делим массу образца на массу одного моля.', 25);
    } else {
      body += text(410, 197, 'n = 36 / 18 = 2 моль', 39, '#d7b8ff');
      for (const x of [320, 500])
        body +=
          `<rect x="${x - 65}" y="234" width="130" height="75" rx="12" fill="#241638" stroke="#8e70c6"/>` +
          text(x, 267, '1 моль', 24, '#facc72') +
          text(x, 295, '18 г', 20, '#67e8f9');
      body += text(410, 349, 'Две порции по одному молю: вместе 36 г.', 24);
    }
    body += text(
      410,
      405,
      'Прямоугольник — порция вещества, не отдельная молекула.',
      17,
      '#baa9ce',
    );
  } else {
    body +=
      formula(230, 113, 'CaCO3', '', null, 0.9) +
      arrow(358, 101, 434, 101) +
      formula(504, 113, 'CaO', '', null, 0.9) +
      text(580, 111, '+', 30) +
      formula(665, 113, 'CO2', '', null, 0.9);
    const boxes = [
      { x: 142, label: 'Масса CaCO₃', value: '10 г', color: '#67e8f9' },
      {
        x: 320,
        label: 'Количество CaCO₃',
        value: stage >= 1 ? '0,10 моль' : '?',
        color: '#d7b8ff',
      },
      { x: 499, label: 'Количество CaO', value: stage >= 2 ? '0,10 моль' : '?', color: '#d7b8ff' },
      { x: 678, label: 'Масса CaO', value: stage >= 4 ? '5,6 г' : '?', color: '#facc72' },
    ];
    for (const [i, b] of boxes.entries()) {
      body +=
        `<rect x="${b.x - 78}" y="171" width="156" height="93" rx="13" fill="#231735" stroke="${b.color}"/>` +
        text(b.x, 197, b.label, 16, '#cdbedf') +
        text(b.x, 237, b.value, 27, b.color);
      if (i < 3) body += arrow(b.x + 81, 218, b.x + 96, 218, progress);
    }
    const captions = [
      'Чистый CaCO₃ разлагается полностью. Выход продукта — 100%.',
      'n(CaCO₃) = 10 г / (100 г/моль) = 0,10 моль',
      'Коэффициенты 1 : 1 дают n(CaO) = n(CaCO₃).',
      'm(CaO) = n(CaO) · M(CaO) = 0,10 · 56 г',
      'm(CaO) = 5,6 г; m(CO₂) = 4,4 г. Всего: 10 г.',
      'Та же рассчитанная модель. Нового условия на рисунке нет.',
    ];
    body +=
      text(410, 321, captions[stage], 23) +
      text(410, 386, 'Округлённые молярные массы: CaCO₃ — 100; CaO — 56 г/моль.', 18, '#baa9ce');
  }
  return body;
}
function extraReaction(scenario, stage, p) {
  const methane = scenario === 4,
    balanced = stage >= 2,
    emphasis = stage === 0 ? 'index' : stage === 2 ? 'coefficient' : null;
  let body = '';
  if (methane)
    body +=
      formula(135, 79, 'CH4', '', emphasis, 0.8) +
      text(215, 76, '+', 25) +
      formula(292, 79, 'O2', balanced ? '2' : '', emphasis, 0.8) +
      arrow(372, 68, 427, 68) +
      formula(505, 79, 'CO2', '', emphasis, 0.8) +
      text(583, 76, '+', 25) +
      formula(675, 79, 'H2O', balanced ? '2' : '', emphasis, 0.8);
  else
    body +=
      formula(140, 79, 'Zn', '', null, 0.8) +
      text(220, 76, '+', 25) +
      formula(299, 79, 'HCl', balanced ? '2' : '', emphasis, 0.8) +
      arrow(393, 68, 438, 68) +
      formula(535, 79, 'ZnCl2', '', emphasis, 0.8) +
      text(620, 76, '+', 25) +
      formula(687, 79, 'H2', '', emphasis, 0.8);
  const symbols = methane
    ? ['C', 'H', 'H', 'H', 'H', 'O', 'O', 'O', 'O']
    : ['Zn', 'H', 'H', 'Cl', 'Cl'];
  const start = methane
    ? [
        [139, 223],
        [99, 182],
        [179, 182],
        [99, 264],
        [179, 264],
        [268, 166],
        [319, 166],
        [268, 272],
        [319, 272],
      ]
    : [
        [137, 213],
        [244, 168],
        [244, 269],
        [295, 168],
        [295, 269],
      ];
  const target = methane
    ? [
        [565, 155],
        [480, 245],
        [560, 245],
        [620, 245],
        [700, 245],
        [513, 155],
        [617, 155],
        [520, 275],
        [660, 275],
      ]
    : [
        [515, 212],
        [665, 190],
        [710, 190],
        [480, 257],
        [550, 257],
      ];
  const t = stage >= 4 ? 1 : stage === 3 ? p : 0;
  if (methane) {
    for (const [i, j] of [
      [0, 1],
      [0, 2],
      [0, 3],
      [0, 4],
      [5, 6],
      [7, 8],
    ])
      body += line(...start[i], ...start[j], '#8f83a3', 3, `opacity="${1 - t}"`);
    for (const [i, j] of [
      [0, 5],
      [0, 6],
      [1, 7],
      [2, 7],
      [3, 8],
      [4, 8],
    ])
      body += line(...target[i], ...target[j], '#8f83a3', 3, `opacity="${t}"`);
  }
  symbols.forEach(
    (el, i) =>
      (body += atom(
        el,
        `extra-${scenario}-${el}-${i}`,
        start[i][0] + (target[i][0] - start[i][0]) * t,
        start[i][1] + (target[i][1] - start[i][1]) * t,
        stage === 1 || stage === 3,
      )),
  );
  body +=
    arrow(372, 216, 428, 216) +
    text(230, 117, 'Исходный состав', 19, '#bdacd5') +
    text(604, 117, t ? 'Те же атомы в продуктах' : 'Продукты', 19, '#bdacd5');
  if (!methane && t > 0)
    body += `<g opacity="${t}">${text(605, 220, '+', 27)}${text(515, 308, 'ZnCl₂: формульный учёт', 16)}${text(686, 240, 'H₂', 19)}</g>`;
  const totals = methane
    ? [
        ['C', 1],
        ['H', 4],
        ['O', 4],
      ]
    : [
        ['Zn', 1],
        ['H', 2],
        ['Cl', 2],
      ];
  totals.forEach(
    ([el, n], i) => (body += text(220 + i * 190, 348, `${el}: ${n} = ${n}`, 23, color[el])),
  );
  body += text(
    410,
    384,
    methane
      ? 'Полное сгорание; условная перестройка, не механизм реакции.'
      : 'В растворе ZnCl₂ — ионы. Шары только учитывают состав.',
    18,
    '#baa9ce',
  );
  body += text(
    410,
    426,
    balanced
      ? 'Уравнено. Атомы сохраняются; индексы веществ не меняются.'
      : 'Подбираем коэффициенты. Верхняя строка пока неуравненная.',
    18,
    '#c4b5d6',
  );
  return body;
}
function mixture(stage, p) {
  let body =
    text(235, 109, 'Соль: 10 г', 30, '#facc72') + text(550, 109, 'Вода: 90 г', 30, '#67e8f9');
  if (stage < 2) {
    body += text(388, 108, '+', 29) + arrow(410, 143, 510, 143, p);
    body += text(
      410,
      227,
      stage === 0 ? 'Масса всего раствора — ?' : 'Масса раствора: 10 + 90 = 100 г',
      32,
      '#d7b8ff',
    );
    body += text(410, 297, 'Соль полностью растворилась, потери воды нет.', 24);
  } else {
    for (let i = 0; i < 100; i++)
      body += `<rect x="${149 + (i % 10) * 20}" y="${144 + Math.floor(i / 10) * 20}" width="17" height="17" rx="3" fill="${i < 10 ? '#facc72' : '#67e8f9'}" opacity="${i < 10 ? 1 : 0.38}"/>`;
    body += text(248, 378, '100 условных единиц массы', 19, '#baa9ce');
    body += text(572, 193, 'Масса соли / масса раствора', 20);
    body += text(
      572,
      258,
      stage === 2 ? 'w = 10 / 100' : stage === 3 ? 'w = 0,10' : 'w = 0,10 · 100% = 10%',
      stage >= 4 ? 25 : 34,
      '#facc72',
    );
    body += text(572, 319, 'В знаменателе 100 г, не 90 г.', 22, '#cabbdd');
  }
  body += text(
    410,
    426,
    'Сетка — доли массы, не слои соли и воды и не модель молекул.',
    17,
    '#baa9ce',
  );
  return body;
}
function gasVolume(stage, p) {
  let body = text(410, 97, 'Идеальный газ: n = 0,50 моль', 30, '#67e8f9');
  body += text(410, 134, 'Нормальные условия: 0 °C и 101,325 кПа', 23, '#cabbdd');
  if (stage < 4) {
    const lines = ['Объём газа — ?', 'Vₘ ≈ 22,4 л/моль', 'V = n · Vₘ', 'V = 0,50 · 22,4 л'];
    body += text(410, 228, lines[stage], 41, '#facc72');
    body += arrow(281, 277, 539, 277, p);
    body += text(410, 326, 'Умножаем моли на литры в одном моле.', 25);
  } else {
    for (const [x, h, label] of [
      [253, 126, '1 моль → 22,4 л'],
      [563, 63, '0,50 моль → 11,2 л'],
    ]) {
      body += `<rect x="${x - 78}" y="${310 - h}" width="156" height="${h}" rx="5" fill="#67e8f9" fill-opacity=".24" stroke="#67e8f9" stroke-opacity=".45"/>`;
      body += line(x-92,314,x+92,314,'#746385',2);
      body += text(x, 352, label, 25, x < 400 ? '#cabbdd' : '#facc72');
    }
  }
  body += text(
    410,
    407,
    'Высота столбца показывает объём при одинаковых T и p; это не сосуд.',
    17,
    '#baa9ce',
  );
  body += text(
    410,
    432,
    '22,4 л/моль — округление; для других условий значение меняется.',
    17,
    '#baa9ce',
  );
  return body;
}
export function renderChemistryScene(values, progress = 1) {
  if (!validChemistryValues(values)) return null;
  const [scenario, stage] = values,
    p = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 1;
  let body = text(410, 37, SCENARIOS[scenario].title, 26, '#e6d6ff');
  if (scenario === 4 || scenario === 5) body += extraReaction(scenario, stage, p);
  else if (scenario === 6) body += mixture(stage, p);
  else if (scenario === 7) body += gasVolume(stage, p);
  else if (scenario < 2) {
    const isWater = scenario === 0;
    const emphasis = stage === 0 ? 'index' : stage === 2 ? 'coefficient' : null;
    if (isWater)
      body +=
        formula(182, 76, 'H2', stage >= 2 ? '2' : '', emphasis, 0.8) +
        text(281, 75, '+', 24) +
        formula(340, 76, 'O2', '', emphasis, 0.8) +
        arrow(404, 64, 455, 64) +
        formula(583, 76, 'H2O', stage >= 2 ? '2' : '', emphasis, 0.8);
    else
      body +=
        formula(197, 76, 'CaCO3', '', emphasis, 0.8) +
        arrow(366, 64, 443, 64) +
        formula(525, 76, 'CaO', '', emphasis, 0.8) +
        text(585, 75, '+', 24) +
        formula(660, 76, 'CO2', '', emphasis, 0.8);
    body += atomModel(scenario, stage, p);
    const note = isWater
      ? stage < 2
        ? 'Подбираем коэффициенты. Верхняя строка — неуравненная схема веществ.'
        : 'Уравнено. Коэффициент умножает всю формулу; индексы не меняем.'
      : 'Уравнено: CaCO₃ → CaO + CO₂, нагревание. Это не инструкция опыта.';
    body += text(410, 429, note, 17, '#c4b5d6');
  } else body += calculation(stage, scenario, p);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 820 460" role="img" aria-label="${escape(SCENARIOS[scenario].title)}" data-subject-figure="chemistry-reaction" data-chemistry-scenario="${scenario}" data-chemistry-stage="${stage}" font-family="Segoe UI,Arial,sans-serif"><rect x="1" y="1" width="818" height="458" rx="20" fill="#171022" stroke="#443158"/>${body}</svg>`;
}
