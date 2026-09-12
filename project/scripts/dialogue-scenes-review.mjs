import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { compareScenePixels } from './scene-pixel-metrics.mjs';

const root = process.cwd(),
  out = path.join(root, 'docs/verification/dialogue-scenes-browser-0.5'),
  harness = path.join(root, 'test-results/dialogue-scenes-qa-0.5');
const fixtures = [
  {
    id: 'number-line',
    kind: 'number-line',
    title: 'Вычитаем 5 из 3',
    steps: [
      { caption: 'Начинаем в точке 3.', values: [3, 3], labels: ['Начало движения: 3'] },
      {
        caption: 'Вычесть 5 — пройти влево пять единиц.',
        values: [3, -2],
        labels: ['Движение влево'],
      },
      { caption: 'Приходим в точку −2.', values: [3, -2], formula: '3-5=-2' },
    ],
  },
  {
    id: 'rectangle',
    kind: 'geometry',
    title: 'Площадь прямоугольника 7 × 4',
    steps: [
      {
        caption: 'Длина равна 7, ширина — 4.',
        values: [7, 4],
        labels: ['Длина a = 7', 'Ширина b = 4'],
      },
      { caption: 'В четырёх рядах по семь единичных клеток.', values: [7, 4] },
      { caption: 'Умножаем длину на ширину.', values: [7, 4], formula: 'S=7\\cdot4=28' },
    ],
  },
  {
    id: 'triangle',
    kind: 'geometry',
    title: 'Площадь треугольника',
    steps: [
      { caption: 'Основание a = 6, перпендикулярная высота h = 4.', values: [6, 4] },
      {
        caption: 'Высота образует прямой угол с основанием.',
        values: [6, 4],
        labels: ['Основание', 'Высота'],
      },
      {
        caption: 'Площадь равна половине произведения.',
        values: [6, 4],
        formula: 'S=\\frac{6\\cdot4}{2}=12',
      },
    ],
  },
  {
    id: 'circle',
    kind: 'geometry',
    title: 'Окружность и радиус',
    steps: [
      { caption: 'Отрезок от центра до окружности — радиус.', values: [3] },
      { caption: 'Радиус этого круга равен 3.', values: [3], labels: ['Радиус r = 3'] },
      {
        caption: 'Квадрат радиуса входит в формулу площади круга.',
        values: [3],
        formula: 'S=\\pi r^2=9\\pi',
      },
    ],
  },
  {
    id: 'function',
    kind: 'function',
    title: 'Три заданные точки',
    steps: [
      { caption: 'Отмечаем точки с данными координатами.', values: [-2, 4, 0, 0, 2, 4] },
      {
        caption: 'Соединяем соседние точки отрезками, не достраивая неизвестную кривую.',
        values: [-2, 4, 0, 0, 2, 4],
      },
      {
        caption: 'Для кривой между точками потребуется дополнительное правило.',
        values: [-2, 4, 0, 0, 2, 4],
        labels: ['Координаты', 'Отрезки между точками'],
      },
    ],
  },
  {
    id: 'algebra',
    kind: 'algebra',
    title: 'Корень из квадрата выражения',
    steps: [
      {
        caption: 'Квадратный корень возвращает неотрицательное значение.',
        formula: '\\sqrt{(x-4)^2}=|x-4|',
      },
      { caption: 'При x < 4 выражение x − 4 отрицательно.', formula: '|x-4|=-(x-4),\\quad x<4' },
      { caption: 'Минус перед скобками меняет оба знака.', formula: '-(x-4)=-x+4' },
    ],
  },
  {
    id: 'syntax',
    kind: 'syntax',
    title: 'Находим грамматическую основу',
    steps: [
      { caption: 'Читаем предложение целиком.', labels: ['Тихий', 'дождь', 'начался', 'утром'] },
      {
        caption: 'О чём говорится и что произошло?',
        labels: ['Тихий', 'подлежащее: дождь', 'сказуемое: начался', 'утром'],
      },
      {
        caption: 'Слова дождь и начался образуют основу.',
        labels: ['подлежащее: дождь', 'сказуемое: начался'],
        formula: '**Дождь начался** — грамматическая основа.',
      },
    ],
  },
  {
    id: 'commas',
    kind: 'syntax',
    title: 'Граница частей сложного предложения',
    steps: [
      {
        caption: 'Находим две грамматические основы.',
        labels: ['Когда наступила весна', 'птицы вернулись домой'],
      },
      {
        caption: 'Придаточная часть заканчивается словом весна.',
        labels: ['придаточное: Когда наступила весна', 'главное: птицы вернулись домой'],
      },
      {
        caption: 'Теперь ставим запятую на границе частей.',
        labels: ['Когда наступила весна', ',', 'птицы вернулись домой'],
        formula: 'Когда наступила весна, птицы вернулись домой.',
      },
    ],
  },
  {
    id: 'history-reform',
    kind: 'history',
    title: 'Отмена крепостного права',
    steps: [
      { caption: 'Реформа связана с правлением Александра II.', labels: ['Александр II'] },
      {
        caption: 'Манифест 1861 года изменил положение крепостных крестьян.',
        labels: ['Манифест', '1861'],
      },
      {
        caption: 'Личная свобода и земельные условия реформы — разные стороны изменения.',
        labels: ['Личная свобода', 'Земельные условия', 'Переходный порядок'],
      },
    ],
  },
  {
    id: 'history-city',
    kind: 'history',
    title: 'Князь, город и документ',
    steps: [
      {
        caption: 'На схеме показываем участников и объекты из условия.',
        labels: ['Город', 'Князь', 'Документ'],
      },
      {
        caption: 'Сравниваем действия правителя и содержание документа.',
        labels: ['Князь', 'Документ'],
      },
      { caption: 'Точная карта и дата здесь не заданы.', labels: ['Город', 'Князь', 'Документ'] },
    ],
  },
  {
    id: 'history-army',
    kind: 'history',
    title: 'Войско и крепость',
    steps: [
      { caption: 'Условная сцена показывает войско у крепости.', labels: ['Войско', 'Крепость'] },
      {
        caption: 'Для разбора исхода нужны факты из условия.',
        labels: ['Силы сторон', 'Условия местности'],
      },
      {
        caption: 'Не делаем вывод об исходе без данных.',
        labels: ['Войско', 'Крепость', 'Исход не задан'],
      },
    ],
  },
  {
    id: 'market',
    kind: 'concept',
    title: 'Покупатель, продавец и обмен',
    steps: [
      {
        caption: 'На рынке встречаются покупатели и продавцы.',
        labels: ['Покупатели', 'Продавцы'],
      },
      { caption: 'Товар и оплата движутся навстречу.', labels: ['Товар', 'Оплата'] },
      {
        caption: 'Цена согласуется участниками обмена.',
        labels: ['Покупатели', 'Продавцы', 'Цена'],
      },
    ],
  },
  {
    id: 'law',
    kind: 'concept',
    title: 'Государство и граждане',
    steps: [
      { caption: 'Показываем участников отношений.', labels: ['Государство', 'Граждане'] },
      { caption: 'Связи определяются правами и обязанностями.', labels: ['Права', 'Обязанности'] },
      {
        caption: 'Уточняем правило для конкретного случая.',
        labels: ['Государство', 'Граждане', 'Правило'],
      },
    ],
  },
  {
    id: 'groups',
    kind: 'concept',
    title: 'Социальные группы',
    steps: [
      { caption: 'Участники объединяются по общим признакам.', labels: ['Группа A', 'Группа Б'] },
      {
        caption: 'Один человек может входить в несколько групп.',
        labels: ['Семья', 'Учебная группа'],
      },
      {
        caption: 'Для сравнения выбираем общий признак.',
        labels: ['Участники', 'Общий признак', 'Взаимодействие'],
      },
    ],
  },
];
await fs.mkdir(out, { recursive: true });
await fs.mkdir(harness, { recursive: true });
await fs.writeFile(
  path.join(harness, 'index.html'),
  '<html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><div id="root"></div><script type="module" src="./main.tsx"></script><style>body{margin:0;overflow:auto}main.qa{max-width:1000px;margin:20px auto;padding:0 18px}nav.qa{display:flex;gap:14px;align-items:center;margin-bottom:20px;flex-wrap:wrap}nav.qa button,nav.qa select{font:inherit;padding:8px}nav.qa label{display:flex;align-items:center;gap:8px}</style></html>',
);
await fs.writeFile(
  path.join(harness, 'main.tsx'),
  `import React,{useState}from'react';import{createRoot}from'react-dom/client';import'/src/ui/styles.css';import'/src/ui/appearance.css';import'/src/ui/preferences.css';import'/src/ui/motion.css';import{DialogueScene}from'/src/scenes/DialogueScene';import'/src/ui/studio-theme.css';const fixtures=${JSON.stringify(fixtures)};document.documentElement.dataset.palette='cosmos';function QA(){const[i,setI]=useState(0),[quality,setQuality]=useState('high'),[reduced,setReduced]=useState(false),[active,setActive]=useState(true),[generation,setGeneration]=useState(0);const drawing=fixtures[i];return <main className="qa cosmos-studio"><nav className="qa"><select aria-label="Сценарий" value={i} onChange={e=>{setI(Number(e.target.value));setGeneration(v=>v+1)}}>{fixtures.map((v,i)=><option key={v.id} value={i}>{v.id}</option>)}</select><select aria-label="Качество" value={quality} onChange={e=>setQuality(e.target.value)}>{['high','medium','low','static'].map(v=><option key={v}>{v}</option>)}</select><label><input type="checkbox" checked={reduced} onChange={e=>setReduced(e.target.checked)}/>Без движения</label><label><input type="checkbox" checked={!active} onChange={e=>setActive(!e.target.checked)}/>Пауза занятия</label></nav><DialogueScene key={drawing.id+generation} drawing={drawing} id={'qa-'+drawing.id+generation} subject="math" active={active} settings={{quality,reducedMotion:reduced,sceneAutoplay:true,sceneSpeed:1}} /></main>};createRoot(document.getElementById('root')).render(<QA/>);`,
);
const report = {
  at: new Date().toISOString(),
  scope:
    'Actual DialogueScene and styles in headless Chrome; typed authored QA fixtures. Not installed EXE, integrated cloud responses, or model accuracy.',
  hashes: {},
  cases: [],
  errors: [],
  passed: false,
};
for (const file of [
  'src/scenes/DialogueScene.tsx',
  'src/scenes/DialogueArt.tsx',
  'src/scenes/dialogue-scene.css',
  'src/ui/studio-theme.css',
])
  report.hashes[file] = crypto
    .createHash('sha256')
    .update(await fs.readFile(file))
    .digest('hex');
const geometry = (el) =>
  [...el.querySelectorAll('*')].map((node) => ({
    tag: node.tagName,
    attributes: [...node.attributes].map((a) => [a.name, a.value]),
    box: JSON.stringify(node.getBoundingClientRect().toJSON()),
  }));
const assert = (value, message) => {
  if (!value) throw Error(message);
};
let server, browser, page;
try {
  server = await createServer({
    root,
    server: { port: 5177, host: '127.0.0.1', strictPort: true },
    logLevel: 'error',
  });
  await server.listen();
  browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
  });
  page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
    reducedMotion: 'no-preference',
  });
  page.on('pageerror', (error) => report.errors.push(String(error)));
  await page.goto('http://127.0.0.1:5177/test-results/dialogue-scenes-qa-0.5/index.html');
  const scene = page.locator('.dialogue-scene'),
    body = scene.locator('.dialogue-scene-body');
  for (let i = 0; i < fixtures.length; i++) {
    const { id } = fixtures[i];
    await page.getByLabel('Сценарий').selectOption(String(i));
    assert((await scene.getAttribute('data-playing')) === 'true', `${id}: autoplay not started`);
    await page.waitForTimeout(220);
    const opening = await body.screenshot({ path: path.join(out, `${id}-opening.png`) });
    await page.waitForTimeout(330);
    await scene.getByRole('button', { name: 'Пауза', exact: true }).click();
    const ga = await body.evaluate(geometry),
      a = await body.screenshot({ path: path.join(out, `${id}-pause-a.png`) });
    await page.waitForTimeout(350);
    const gb = await body.evaluate(geometry),
      b = await body.screenshot({ path: path.join(out, `${id}-pause-b.png`) });
    const pixel = compareScenePixels(a, b);
    assert(
      pixel.maxChannelDelta === 0 && JSON.stringify(ga) === JSON.stringify(gb),
      `${id}: pixel/geometry pause changed`,
    );
    assert(!opening.equals(a), `${id}: no visible motion before pause`);
    await scene.getByRole('button', { name: 'Следующий кадр', exact: true }).click();
    assert((await scene.getAttribute('data-step')) === '1', `${id}: next failed`);
    await scene.getByRole('button', { name: 'Предыдущий кадр', exact: true }).click();
    assert((await scene.getAttribute('data-step')) === '0', `${id}: back failed`);
    await scene.getByRole('button', { name: 'Кадр 3', exact: true }).click();
    await scene.screenshot({ path: path.join(out, `${id}-final.png`) });
    if (id === 'rectangle')
      assert((await body.innerText()).includes('28'), 'rectangle 7×4 result mismatch');
    if (id === 'function')
      assert(
        (await body.innerText()).includes('отрезками'),
        'function interpolation boundary missing',
      );
    await scene.getByRole('button', { name: 'Повторить рисунок', exact: true }).click();
    assert(
      (await scene.getAttribute('data-step')) === '0' &&
        (await scene.getAttribute('data-playing')) === 'true',
      `${id}: replay failed`,
    );
    await scene.getByRole('button', { name: 'Пауза', exact: true }).click();
    report.cases.push({
      id,
      pixel,
      pausedGeometryStable: true,
      visibleMotion: true,
      next: true,
      back: true,
      replay: true,
    });
  }
  await page.getByLabel('Сценарий').selectOption('0');
  await scene.getByLabel('Скорость рисунка').selectOption('2');
  await page.waitForTimeout(2300);
  assert((await scene.getAttribute('data-step')) === '1', 'double speed did not advance');
  await scene.getByRole('button', { name: 'Повторить рисунок', exact: true }).click();
  await scene.getByLabel('Скорость рисунка').selectOption('0.5');
  await page.waitForTimeout(2200);
  assert((await scene.getAttribute('data-step')) === '0', 'half speed advanced too soon');
  await scene.focus();
  await page.keyboard.press('Space');
  assert((await scene.getAttribute('data-playing')) === 'false', 'keyboard pause failed');
  await page.keyboard.press('ArrowRight');
  assert((await scene.getAttribute('data-step')) === '1', 'keyboard next failed');
  await page.getByLabel('Качество', { exact: true }).selectOption('static');
  assert(
    await scene.getByRole('button', { name: 'Воспроизвести', exact: true }).isDisabled(),
    'static allows autoplay',
  );
  await scene.getByRole('button', { name: 'Кадр 3', exact: true }).click();
  await scene.screenshot({ path: path.join(out, 'number-line-static.png') });
  await page.getByLabel('Качество', { exact: true }).selectOption('low');
  await page.getByLabel('Без движения', { exact: true }).check();
  assert(
    await scene.getByRole('button', { name: 'Воспроизвести', exact: true }).isDisabled(),
    'reduced allows play',
  );
  await scene.screenshot({ path: path.join(out, 'number-line-low-reduced.png') });
  await page.getByLabel('Без движения', { exact: true }).uncheck();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForFunction(
    () => document.querySelector('.dialogue-scene')?.dataset.motion === 'off',
  );
  assert(
    await scene.getByRole('button', { name: 'Воспроизвести', exact: true }).isDisabled(),
    'system reduced allows play',
  );
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.getByLabel('Пауза занятия', { exact: true }).check();
  assert(
    (await scene.locator('button:not(:disabled),select:not(:disabled)').count()) === 0,
    'external pause controls active',
  );
  await page.getByLabel('Пауза занятия', { exact: true }).uncheck();
  await page.setViewportSize({ width: 390, height: 844 });
  report.narrow = [];
  for (const i of [1, 4, 5, 7, 9, 10, 11]) {
    await page.getByLabel('Сценарий').selectOption(String(i));
    await scene.getByRole('button', { name: 'Кадр 3', exact: true }).click();
    await page.screenshot({ path: path.join(out, `${fixtures[i].id}-narrow.png`), fullPage: true });
    const size = await page.evaluate(() => ({
      width: innerWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    assert(size.width >= size.scroll, `${fixtures[i].id}: narrow horizontal overflow`);
    report.narrow.push({ id: fixtures[i].id, ...size });
  }
  report.controls = {
    doubleSpeedAdvance: true,
    halfSpeedSlower: true,
    keyboard: true,
    static: true,
    reduced: true,
    systemReduced: true,
    externalPause: true,
  };
  report.passed = report.errors.length === 0;
} catch (error) {
  report.failure = String(error);
  process.exitCode = 1;
  if (page)
    await page.screenshot({ path: path.join(out, 'failure.png'), fullPage: true }).catch(() => {});
} finally {
  await browser?.close();
  await server?.close();
  await fs.writeFile(path.join(out, 'results.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
