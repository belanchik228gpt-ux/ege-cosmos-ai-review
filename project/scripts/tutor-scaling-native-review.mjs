import { _electron as electron } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const previous = JSON.parse(await fs.readFile('docs/verification/tutor-native-0.3/result.json', 'utf8'));
const out = path.resolve('docs/verification/tutor-native-0.3');
const sha = createHash('sha256').update(await fs.readFile(path.join(path.dirname(previous.exe), 'resources/app.asar'))).digest('hex');
assert.equal(sha, previous.appAsarSha256);
const app = await electron.launch({executablePath:previous.exe, env:{...process.env, COSMOS_USER_DATA:previous.profile, COSMOS_DOCUMENTS_DIR:path.join(previous.profile,'documents'), COSMOS_RUNTIME_DIR:path.join(previous.profile,'no-model')}});
let result;
try {
  const page = await app.firstWindow();
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1));
  await page.locator('.daily-dashboard').waitFor();
  await page.getByRole('button',{name:'Своя задача',exact:true}).click();
  await page.locator('.lesson-toolbox summary').click();
  await page.locator('.own-problem-list > button').filter({hasText:'Площадь прямоугольника'}).click();
  await page.locator('.lesson-toolbox summary').click();
  await app.evaluate(({BrowserWindow})=>{
    const w=BrowserWindow.getAllWindows()[0];
    w.setContentSize(1280,900);
    w.webContents.setZoomFactor(2);
  });
  await page.waitForTimeout(700);
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.evaluate(()=>document.querySelector('.lesson-compass').scrollIntoView({block:'start',behavior:'instant'}));
  await page.waitForTimeout(200);
  const layout = await page.evaluate(()=>({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth}));
  assert(layout.scrollWidth<=layout.width+1);
  const capture = await app.evaluate(async({BrowserWindow})=>{
    const w=BrowserWindow.getAllWindows()[0];
    const bitmap=await w.webContents.capturePage();
    return {base64:bitmap.toPNG().toString('base64'), bitmap:bitmap.getSize(), window:w.getContentSize(), zoom:w.webContents.getZoomFactor()};
  });
  assert(capture.bitmap.width>=capture.window[0]);
  assert(capture.bitmap.height>=capture.window[1]);
  await fs.writeFile(path.join(out,'12-native-capture-200.png'),Buffer.from(capture.base64,'base64'));
  const {base64,...size}=capture;
  result={at:new Date().toISOString(),exe:previous.exe,appAsarSha256:sha,scope:'Actual Electron webContents.capturePage bitmap of the installed EXE at application zoom 200%; not a Windows display-settings change',...size,layout,visualReview:'pending personal inspection'};
} finally {
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0]?.webContents.setZoomFactor(1)).catch(()=>{});
  await app.close();
}
await fs.writeFile(path.join(out,'scaling-result.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify(result));
