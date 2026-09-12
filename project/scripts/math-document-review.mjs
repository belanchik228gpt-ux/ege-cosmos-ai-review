// Actual desktop exporter with invisible Electron print windows; no pupil data or local model.
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
const root = path.resolve(import.meta.dirname, '..');
const profile = path.join(root, 'test-results', `math-export-${Date.now()}`);
const out = path.join(root, 'docs', 'verification', 'math-export-0.5');
await fs.mkdir(profile, { recursive: true });
await fs.mkdir(out, { recursive: true });
const document = {
  title: 'Дроби, корни и уравнения',
  subject: 'math',
  type: 'Пользовательский документ',
  content: String.raw`# Дроби, корни и уравнения
## Проверка математического экспорта
Это авторский образец оформления, а не результаты ученика. Все формулы ниже набраны локальным KaTeX, шрифты встроены в документ.
## Смысл дроби
В дроби $\frac{3}{8}$ знаменатель показывает восемь равных частей целого, числитель — три взятые части.
$$\frac{3}{8}\cdot\frac{2}{3}=\frac{6}{24}=\frac{1}{4}$$
При умножении дробей перемножаем числители и знаменатели, затем сокращаем общий множитель.
## Квадратный корень
Запись \(\sqrt{25}=5\) означает неотрицательное число, квадрат которого равен 25.
\[
\sqrt{x^2}=|x|,\qquad \sqrt{(-5)^2}=5
\]
Модуль сохраняется, потому что результат арифметического квадратного корня неотрицателен.
## Решение уравнения
Выполняем одинаковую операцию над обеими частями равенства:
\[
\begin{aligned}
x+3&=7\\
x+3-3&=7-3\\
x&=4
\end{aligned}
\]
Проверка: подставляем $x=4$ в исходное равенство и получаем $4+3=7$.
## Формула корней
Для уравнения $ax^2+bx+c=0$, где $a\ne0$, сначала вычисляем дискриминант.
$$D=b^2-4ac,\qquad x_{1,2}=\frac{-b\pm\sqrt{D}}{2a}$$
Если $D<0$, действительных корней нет. При $D=0$ один действительный корень, при $D>0$ — два.
## Геометрия
Площадь треугольника — половина произведения основания на соответствующую ему высоту.
\[S=\frac{a\cdot h}{2}=\frac{7\cdot4}{2}=14\ \text{см}^2\]
Формула использует высоту к выбранному основанию, а не произвольную другую сторону.
## Моя заметка
Обычный текст и HTML остаются безопасным текстом: <script>alert(1)</script> и <img src=x> не выполняются.
## Источники и статус
Авторский тест оформления Cosmos. Не официальный вариант ФИПИ, не подтверждение освоения темы. Последняя контрольная строка сохранена.
`,
};
await fs.writeFile(path.join(profile, 'document.json'), JSON.stringify(document, null, 2));
await fs.writeFile(path.join(out, 'editable-content.md'), document.content);
const sourceHashes = {};
for (const file of [
  'shared/document-math.mjs',
  'shared/katex-export-assets.mjs',
  'shared/document-renderer.mjs',
  'desktop/documents.cjs',
])
  sourceHashes[file] = createHash('sha256')
    .update(await fs.readFile(path.join(root, file)))
    .digest('hex');
const runner = path.join(profile, 'export.cjs');
await fs.writeFile(
  runner,
  `
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const root=${JSON.stringify(root)}, profile=__dirname, out=${JSON.stringify(out)};
const {exportDocument}=require(path.join(root,'desktop/documents.cjs'));
app.setPath('userData',path.join(profile,'electron'));
app.disableHardwareAcceleration();
app.on('window-all-closed',()=>{});
const result={at:new Date().toISOString(),scope:'Actual desktop exportDocument with source modules and hidden Electron windows, not installed EXE/UI acceptance',sourceHashes:${JSON.stringify(sourceHashes)},outputs:[]};
const timer=setTimeout(()=>{app.exit(1);},90000);
app.whenReady().then(async()=>{
 const document=JSON.parse(await fs.readFile(path.join(profile,'document.json'),'utf8'));
 for(const scale of ['comfortable','large']){
  const exported=await exportDocument({...document,documentType:document.type,format:'pdf',style:scale==='large'?'paper':'cosmos',scale},{documentsDir:path.join(profile,'documents'),BrowserWindow});
  const bytes=await fs.readFile(exported.path);
  if(!bytes.subarray(0,5).equals(Buffer.from('%PDF-')))throw Error('Missing actual PDF signature');
  const copied=path.join(out,'math-export-'+scale+'.pdf');await fs.copyFile(exported.path,copied);
  result.outputs.push({format:'pdf',scale,path:copied,actualExportPath:exported.path,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
 }
 result.status='exported-needs-visual-review';
}).catch(error=>{result.status='fail';result.error=error.message;}).finally(async()=>{
 clearTimeout(timer);result.remainingWindows=BrowserWindow.getAllWindows().length;
 await fs.writeFile(path.join(out,'result.json'),JSON.stringify(result,null,2));
 for(const item of result.outputs)await fs.writeFile(path.join(out,'exports-'+item.scale+'.json'),JSON.stringify([item],null,2));
 console.log(JSON.stringify(result));app.exit(result.status==='fail'?1:0);
});
`,
);
await new Promise((resolve, reject) => {
  const child = spawn(path.join(root, 'node_modules/electron/dist/electron.exe'), [runner], {
    cwd: root,
    windowsHide: true,
    stdio: 'inherit',
  });
  const timeout = setTimeout(() => child.kill(), 105000);
  child.on('error', reject);
  child.on('exit', (code) => {
    clearTimeout(timeout);
    code === 0 ? resolve() : reject(Error(`Desktop export process exited ${code}`));
  });
});
