import { _electron as electron } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const exe=path.resolve(process.env.COSMOS_EXE||'release/win-unpacked/EGE Cosmos.exe');
const version=JSON.parse(await fs.readFile('package.json','utf8')).version;
const out=path.resolve(process.env.COSMOS_REVIEW_OUT||('docs/verification/ton618-'+version));
const profile=path.resolve(`test-results/ton618-${Date.now()}`);
await fs.mkdir(out,{recursive:true});
const report={status:'running',exe,profile,variants:[],checks:[],errors:[],screenshots:[],asarSha256:createHash('sha256').update(await fs.readFile(path.join(path.dirname(exe),'resources/app.asar'))).digest('hex')};
let app,page;
const button=name=>page.getByRole('button',{name,exact:true});
const nav=name=>page.locator('.studio-sidebar').getByRole('button',{name,exact:true});
const palette=()=>page.getByLabel('Палитра TON 618',{exact:true});
async function shot(name){const file=path.join(out,name+'.png');await page.screenshot({path:file,fullPage:name==='catalog-1280'});report.screenshots.push(file);}
async function launch(){app=await electron.launch({executablePath:exe,env:{...process.env,COSMOS_USER_DATA:profile},timeout:45000});page=await app.firstWindow();page.setDefaultTimeout(25000);page.on('pageerror',e=>report.errors.push(e.message));await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.setIgnoreMouseEvents(true);w.setContentSize(1280,720);});await page.locator('.cosmos-studio').waitFor();}
try{
 await launch();await page.locator('.welcome-modal input').fill('Проверка TON 618');await button('Начнём знакомство').click();await nav('Главная').click();
 await page.getByLabel('Анимация фона',{exact:true}).check();
 for(const id of ['bronze','warm-gold','deep-blue','violet','red-solar','monochrome']){
  await palette().selectOption(id);const media=page.locator('.ton618-backdrop .ton618-media');await media.locator('img').evaluate(img=>img.decode());
  let video=null;
  {
   await page.waitForFunction(()=>{const v=document.querySelector('.ton618-backdrop video');return v&&v.readyState>=3&&!v.paused&&v.currentTime>.15;});
   video=await media.locator('video').evaluate(v=>({width:v.videoWidth,height:v.videoHeight,duration:v.duration,time:v.currentTime,muted:v.muted,loop:v.loop}));
   assert.equal(video.width,1920);assert.equal(video.height,1080);assert(video.muted&&video.loop);assert(Math.abs(video.duration-16)<.2);
   await media.locator('video').evaluate(v=>{v.currentTime=v.duration-.3;});await page.waitForTimeout(900);
   assert((await media.locator('video').evaluate(v=>v.currentTime))<3,'Video wraps at loop end');
  }
  await shot(id+'-home-1280');report.variants.push({id,video});
 }
 await palette().selectOption('bronze');await page.locator('.ton618-backdrop video').waitFor();
 await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(300);assert.equal(await page.locator('.ton618-backdrop video').count(),0);await shot('reduced-motion');
 await page.emulateMedia({reducedMotion:'no-preference'});await page.locator('.ton618-backdrop video').waitFor();
 await page.getByLabel('Анимация фона',{exact:true}).uncheck();assert.equal(await page.locator('.ton618-backdrop video').count(),0);
 await page.getByLabel('Анимация фона',{exact:true}).check();await page.locator('.ton618-backdrop video').waitFor();
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].minimize());await page.waitForTimeout(500);assert.equal(await page.locator('video').count(),0);
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].restore());await page.locator('.ton618-backdrop video').waitFor();
 await page.locator('.ton618-backdrop video').evaluate(v=>v.dispatchEvent(new Event('error')));await page.waitForTimeout(200);assert.equal(await page.locator('.ton618-backdrop video').count(),0);assert(await page.locator('.ton618-backdrop img').isVisible());
 report.checks.push('All six variants; six real MP4 decodes and loop wrap; reactive OS reduced motion; animation switch; minimize/unload and restore; injected video error retains poster.');
 await nav('Каталог фонов').click();assert.equal(await page.locator('.ton618-variant').count(),6);assert.equal(await page.locator('video').count(),0);await shot('catalog-1280');
 assert.equal(await page.getByText('TON 618 · место для твоей сцены',{exact:true}).count(),0);
 await page.locator('.ton618-variant').filter({has:page.getByRole('heading',{name:'Синий',exact:true})}).getByRole('button').click();
 await page.locator('.school-mode-switch').getByRole('button',{name:'Школа',exact:true}).click();await nav('Сегодня').click();await page.locator('.ton618-backdrop video').waitFor();assert.equal(await palette().inputValue(),'deep-blue');await shot('school-home-1280');
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1920,1080));await page.waitForTimeout(350);await shot('school-home-1920');
 await app.close();app=null;await launch();await nav('Сегодня').click();assert.equal(await palette().inputValue(),'deep-blue');await shot('restored-selection');
 for(const quality of ['Низкое','Статичное']) {
  await nav('Настройки').click();await button('Изображение и звук').click();await button('Учебные сцены').click();
  await page.locator('.quality-options button').filter({has:page.getByText(quality,{exact:true})}).click();
  await nav('Сегодня').click();assert.equal(await page.locator('video').count(),0);await shot(quality==='Низкое'?'low-quality':'static-quality');
 }
 await nav('Настройки').click();await button('Изображение и звук').click();await button('Учебные сцены').click();
 await page.locator('.quality-options button').filter({has:page.getByText('Высокое',{exact:true})}).click();await nav('Сегодня').click();await page.locator('.ton618-backdrop video').waitFor();
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(800,720));await page.waitForTimeout(350);await shot('school-home-800');
 report.checks.push('Catalog selects a palette; school home 1280 and 1920; restart retains selection; low and static quality unload video; high restores playback; narrow 800px screenshot.');
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1280,720));
 await palette().selectOption('violet');
 await button('Смотреть на весь экран').click();
 await page.waitForFunction(()=>!!document.fullscreenElement);
 assert(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isFullScreen()));
 const cinema=page.getByRole('dialog',{name:'TON 618 на весь экран'});
 await page.waitForFunction(()=>{const v=document.querySelector('.ton618-cinema video');return v&&v.readyState>=3&&!v.paused&&getComputedStyle(v).opacity==='1';});
 assert.equal(await page.locator('.ton618-backdrop video').count(),0,'Background video must unload while cinema is open');
 assert(await page.locator('#root').evaluate(root=>root.inert));
 const geometry=await cinema.locator('video').evaluate(v=>{const r=v.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,viewport:[innerWidth,innerHeight]};});
 assert.equal(geometry.x,0);assert.equal(geometry.y,0);assert.equal(geometry.width,geometry.viewport[0]);assert.equal(geometry.height,geometry.viewport[1]);
 await page.mouse.move(400,300);await page.waitForTimeout(3300);await shot('cinema-clean-fullscreen');
 const motion=await cinema.locator('video').evaluate(async v=>{
  const c=document.createElement('canvas');c.width=320;c.height=180;const x=c.getContext('2d');
  const frame=()=>{x.drawImage(v,0,0,320,180);return x.getImageData(0,0,320,180).data;};
  const a=frame();await new Promise(r=>setTimeout(r,2500));const b=frame();let difference=0;
  for(let i=0;i<a.length;i++)if(i%4!==3)difference+=Math.abs(a[i]-b[i]);
  return difference/(320*180*3);
 });assert(motion>1,'Decoded picture must actually change, not only the timer');
 await shot('cinema-moving-frame');
 await page.mouse.move(450,310);await button('Пауза').click();
 const frozen=await cinema.locator('video').evaluate(v=>v.currentTime);await page.waitForTimeout(900);
 assert(Math.abs((await cinema.locator('video').evaluate(v=>v.currentTime))-frozen)<.08);
 assert.equal(await cinema.locator('video').evaluate(v=>getComputedStyle(v).opacity),'1');await shot('cinema-paused');
 await button('Продолжить').click();await button('С начала').click();
 await page.waitForFunction(()=>{const v=document.querySelector('.ton618-cinema video');return v&&v.currentTime>.1&&!v.paused;});
 const loops=await cinema.locator('video').evaluate(v=>new Promise((resolve,reject)=>{
  let last=v.currentTime,loops=0;const started=performance.now();
  const timer=setInterval(()=>{if(v.currentTime<last-.5)loops++;last=v.currentTime;
   if(loops>=2){clearInterval(timer);resolve({loops,elapsedSeconds:(performance.now()-started)/1000});}
   else if(performance.now()-started>38000){clearInterval(timer);reject(new Error('Two natural video loops did not complete'));}
  },100);
 }));
 await page.mouse.move(480,320);await page.getByLabel('Палитра полноэкранного фона').selectOption('monochrome');await page.waitForFunction(()=>{const v=document.querySelector('.ton618-cinema video');return v&&v.readyState>=3&&v.currentTime>.1;});await shot('cinema-monochrome');
 await page.getByLabel('Палитра полноэкранного фона').selectOption('violet');await cinema.locator('video').waitFor();
 await button('Показать целиком').click();assert.equal(await cinema.getAttribute('data-fit'),'true');
 await page.keyboard.press('Escape');await cinema.waitFor({state:'detached'});await page.waitForFunction(()=>!document.fullscreenElement);
 assert.equal(await page.locator('#root').evaluate(root=>root.inert),false);await page.locator('.ton618-backdrop video').waitFor();
 await page.emulateMedia({reducedMotion:'reduce'});await page.locator('.ton618-backdrop video').waitFor({state:'detached'});
 await button('Смотреть на весь экран').click();await page.locator('.ton618-cinema video').waitFor();
 await button('Закрыть полноэкранный фон').click();await page.locator('.ton618-cinema').waitFor({state:'detached'});await page.emulateMedia({reducedMotion:'no-preference'});
 report.cinema={geometry,meanRGBFrameDifference:motion,naturalPlayback:loops};
 report.checks.push('Native fullscreen; exactly one visible video; full viewport coverage; actual changing pixels; auto-hidden controls; pause retains frame; replay; two natural 16-second loops; palette switch; fit; Esc and close button restore UI; explicit cinema playback independent of background reduced-motion preference.');
 assert.deepEqual(report.errors,[]);report.status='pass';
}catch(e){report.status='failed';report.failure=String(e.stack||e);if(page)await shot('failure');process.exitCode=1;}
finally{if(app)await app.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
