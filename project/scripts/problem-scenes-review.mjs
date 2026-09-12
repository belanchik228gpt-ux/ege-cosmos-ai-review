import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { compareScenePixels, readSceneVisualState } from './scene-pixel-metrics.mjs';
const root = process.cwd(),
  output = path.join(root, 'docs/problem-review/browser');
await fs.mkdir(output, { recursive: true });
const harness = path.join(root, 'test-results/problem-workbench-qa');
await fs.mkdir(harness, { recursive: true });
await fs.writeFile(
  path.join(harness, 'index.html'),
  '<html lang="ru"><meta charset="utf-8"><div id="root"></div><script type="module" src="./main.tsx"></script></html>',
);
await fs.writeFile(
  path.join(harness, 'main.tsx'),
  `import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{ProblemScene}from'/src/scenes/ProblemScene';import{parseProblem}from'/src/domain/problem-workbench';
function QA(){const[text,setText]=useState('Площадь прямоугольника со сторонами 7 и 4 см');const[p,setP]=useState(()=>parseProblem(text));const[reveal,setReveal]=useState(true);const[quality,setQuality]=useState('high');const[reduced,setReduced]=useState(false);return <main><h1>Проверка сцены по условию</h1><label>Условие<textarea value={text} onChange={e=>setText(e.target.value)}/></label><button onClick={()=>setP(parseProblem(text))}>Разобрать</button><label><input type="checkbox" checked={reveal} onChange={e=>setReveal(e.target.checked)}/>Показать решение</label><label>Качество<select aria-label="Качество проверки" value={quality} onChange={e=>setQuality(e.target.value)}>{['high','low','static'].map(v=><option key={v}>{v}</option>)}</select></label><label><input type="checkbox" checked={reduced} onChange={e=>setReduced(e.target.checked)}/>Без движения</label><ProblemScene problem={p} quality={quality} reducedMotion={reduced} revealAnswer={reveal} autoplay={true}/></main>};createRoot(document.getElementById('root')).render(<QA/>);`,
);
await fs.appendFile(
  path.join(harness, 'index.html'),
  '<style>body{margin:0;background:#100d18;color:#f4efff;font:15px Segoe UI,sans-serif;--accent:#bba4ff}main{max-width:1180px;margin:25px auto;padding:0 20px}h1{font-size:23px}textarea{display:block;box-sizing:border-box;width:100%;height:55px;background:#20182e;color:#f4efff;border:1px solid #5c4278;border-radius:9px;font:inherit;padding:10px}main>button,main>label{margin-bottom:14px}main>label{display:inline-block;margin-right:18px}main>label:first-of-type{display:block;margin-right:0}main>button{margin-right:20px;padding:10px 22px}main>label select{margin-left:10px}</style>',
);
const report = {
  at: new Date().toISOString(),
  kind: 'Headless Chrome rendering actual ProblemScene source; component harness, not full app or EXE',
  cases: [],
  errors: [],
  passed: false,
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
    viewport: { width: 1280, height: 850 },
    reducedMotion: 'no-preference',
  });
  page.on('pageerror', (e) => report.errors.push(String(e)));
  await page.goto('http://127.0.0.1:5177/test-results/problem-workbench-qa/index.html');
  const scene = page.locator('.problem-scene'),
    svg = scene.locator('svg').first();
  const scenarios = [
    ['rectangle-28', 'Площадь прямоугольника со сторонами 7 и 4 см'],
    ['rectangle-21', 'В прямоугольнике 7 клеток в каждом ряду и 3 ряда. Сколько всего клеток?'],
    ['triangle', 'Основание треугольника 6 см, высота к нему 4 см. Найди площадь в см².'],
    ['multiply', '7*4'],
    ['fraction', '3/8'],
    ['arithmetic', '(2+3)*4-1/2'],
    ['percent', '20% от 150'],
    ['absolute', '|x-2|=3'],
    ['linear', '2x+3=11'],
    ['quadratic', 'x^2-5x+6=0'],
  ];
  for (const [id, text] of scenarios) {
    await page.locator('textarea').fill(text);
    await page.getByRole('button', { name: 'Разобрать', exact: true }).click();
    await scene.locator('.ps-body').waitFor();
    await page.waitForFunction(
      () => document.querySelector('.ps-step-select select')?.value === '1',
      { timeout: 12000 },
    );
    await page.waitForTimeout(180);
    await scene.getByRole('button', { name: 'Пауза', exact: true }).click();
    const beforeState = await scene.locator('.ps-body').evaluate(readSceneVisualState),
      before = await svg.screenshot({ path: path.join(output, `${id}-paused-a.png`) });
    await page.waitForTimeout(550);
    const afterState = await scene.locator('.ps-body').evaluate(readSceneVisualState),
      after = await svg.screenshot({ path: path.join(output, `${id}-paused-b.png`) });
    const pixels = compareScenePixels(before, after),
      stable = JSON.stringify(beforeState) === JSON.stringify(afterState);
    if (pixels.maxChannelDelta > 1 || !stable)
      throw Error(`${id}: pause changed pixels or animation state`);
    const options = await scene.locator('.ps-step-select option').count();
    await scene.getByLabel('Шаг решения задачи').selectOption(String(options - 1));
    await page.waitForTimeout(100);
    await scene.screenshot({ path: path.join(output, `${id}-final.png`) });
    await scene.getByRole('button', { name: 'Повторить разбор задачи' }).click();
    if ((await scene.getByLabel('Шаг решения задачи').inputValue()) !== '0')
      throw Error(`${id}: replay did not reset`);
    await scene.getByRole('button', { name: 'Пауза', exact: true }).click();
    report.cases.push({ id, text, steps: options, pixels, stateStable: stable, replay: true });
  }
  await page.locator('textarea').fill('Площадь прямоугольника со сторонами 7 и 4 см');
  await page.getByRole('button', { name: 'Разобрать', exact: true }).click();
  await page.getByLabel('Показать решение').uncheck();
  const options = await scene.locator('.ps-step-select option').count();
  await scene.getByLabel('Шаг решения задачи').selectOption(String(options - 1));
  await page.waitForTimeout(120);
  if ((await scene.innerText()).includes('28')) throw Error('practice leaked expected answer 28');
  await scene.screenshot({ path: path.join(output, 'practice-no-answer.png') });
  report.practiceNoAnswer = true;
  await page.setViewportSize({ width: 390, height: 844 });
  await scene.screenshot({ path: path.join(output, 'practice-narrow.png') });
  report.narrow = await page.evaluate(() => ({
    width: innerWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  if (report.narrow.scroll > 390) throw Error('narrow overflow');
  await page.getByLabel('Качество проверки').selectOption('low');
  await scene.screenshot({ path: path.join(output, 'practice-low.png') });
  await page.getByLabel('Качество проверки').selectOption('static');
  await scene.screenshot({ path: path.join(output, 'practice-static.png') });
  if (!(await scene.getByRole('button', { name: 'Смотреть', exact: true }).isDisabled()))
    throw Error('static autoplay enabled');
  report.passed = report.errors.length === 0;
} catch (error) {
  report.failure = String(error);
  if (page)
    await page
      .screenshot({ path: path.join(output, 'failure.png'), fullPage: true })
      .catch(() => {});
  process.exitCode = 1;
} finally {
  await browser?.close();
  await server?.close();
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
