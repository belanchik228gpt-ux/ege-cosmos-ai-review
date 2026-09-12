import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const require=createRequire(import.meta.url),cp=require('node:child_process');
const originalSpawn=cp.spawn,stderr=[];
cp.spawn=function(...args){
  if(process.env.COSMOS_DIAG_BATCH)args[1].push('-b',process.env.COSMOS_DIAG_BATCH,'-ub',process.env.COSMOS_DIAG_BATCH);
  args[1].push('-lv','4');
  args[2]={...args[2],stdio:['ignore','pipe','pipe']};
  const child=originalSpawn(...args);child.stderr?.on('data',chunk=>stderr.push(chunk.toString()));child.stdout?.on('data',chunk=>stderr.push(chunk.toString()));return child;
};
const {LocalModel}=require('../desktop/local-model.cjs');
const qa=resolve('runtime/qa/diagnose');await mkdir(qa,{recursive:true});
const model=new LocalModel({runtimeDir:process.env.COSMOS_RUNTIME_DIR||resolve('runtime'),userData:qa,log:(scope,message)=>console.log(scope,message)});
if(process.env.COSMOS_DIAG_BACKEND==='cpu')model.startInternal=async function(){const c=await this.config();await this.launch(c.cpuExe,c.modelPath,'cpu');};
const originalFetch=globalThis.fetch,requests=[];
globalThis.fetch=async(url,options)=>{
  if(String(url).endsWith('/v1/chat/completions')){
    const payload=JSON.parse(options.body),combined=payload.messages.map(m=>m.content).join('\n');
    const tokenResult=await originalFetch(String(url).replace('/v1/chat/completions','/tokenize'),{method:'POST',headers:options.headers,body:JSON.stringify({content:combined}),signal:AbortSignal.timeout(5000)}).then(r=>r.json());
    const record={characters:combined.length,tokens:tokenResult.tokens?.length,payload};requests.push(record);console.log('request',record.characters,record.tokens);
    // One diagnostic-only extended deadline captures server completion and throughput.
    const response=await originalFetch(url,{...options,signal:AbortSignal.timeout(100000)});
    const clone=await response.clone().json();record.response=clone;return response;
  }
  return originalFetch(url,options);
};
const profile=process.argv[2];
const state=profile?JSON.parse(await readFile(resolve(profile,'learning-state.v1.json'),'utf8')):{profile:{name:'Тестовый ученик'},sessions:{fixture:{messages:[{role:'cosmos',text:'Сегодня разберём тему «Площадь прямоугольника». Площадь показывает, сколько единичных квадратов помещается внутри фигуры. Посмотрим, как один ряд превращается в целый прямоугольник. Будем двигаться небольшими шагами.'},{role:'cosmos',text:'Для начала — короткая самостоятельная попытка. В прямоугольнике 7 клеток в каждом ряду и 3 ряда. Сколько всего клеток?'}]}}};
const session=Object.values(state.sessions)[0],recent=session.messages.slice(0,2).map(m=>`${m.role}: ${m.text}`).join('\n');
const input={subject:'math',topic:'Площадь прямоугольника',message:'Я забыл, что такое площадь. Объясни один первый шаг и задай мне вопрос.',context:`Ученик: ${state.profile.name}. Предпочтения: . Учебный материал: Площадь показывает, сколько единичных квадратов помещается внутри фигуры. Посмотрим, как один ряд превращается в целый прямоугольник.. История этого занятия: ${recent}. Дай только один небольшой шаг или уточняющий вопрос. Не решай за ученика.`};
const started=Date.now();let result;
try{result=await model.ask(input);console.log(JSON.stringify({elapsedTotalMs:Date.now()-started,result}));}
finally{model.stop();await writeFile(resolve(qa,'stderr.log'),stderr.join(''));await writeFile(resolve(qa,'result.json'),JSON.stringify({at:new Date().toISOString(),elapsedTotalMs:Date.now()-started,result,requests},null,2));}
