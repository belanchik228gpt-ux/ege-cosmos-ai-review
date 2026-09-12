// Real getTutorResponse policy and real llama.cpp; no renderer, fake model or UI window.
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve('vite/package.json'))('esbuild');

const root = path.resolve(import.meta.dirname, '..');
const temporary = path.join(root, 'test-results', `tutor-runtime-${Date.now()}`);
await fs.mkdir(temporary, { recursive: true });
const requestedCase = process.env.COSMOS_TUTOR_CASE;
const reportFile =
  requestedCase && /^[a-z-]+$/.test(requestedCase) ? `case-${requestedCase}.json` : 'result.json';
const previousFile = path.join(root, 'docs/verification/tutor-runtime', reportFile);
const previous = await fs.readFile(previousFile, 'utf8').catch(() => null);
if (previous) {
  const at = JSON.parse(previous).at;
  if (typeof at === 'string' && /^[0-9TZ:.-]+$/.test(at))
    await fs.copyFile(
      previousFile,
      previousFile.replace(/\.json$/, `-${at.replace(/[:.]/g, '-')}.json`),
    );
}
const runner = path.join(temporary, 'runner.cjs');
await build({
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  outfile: runner,
  stdin: {
    resolveDir: root,
    loader: 'ts',
    contents: `
import fs from 'node:fs/promises';
import path from 'node:path';
import { getTutorResponse } from './src/ui/tutor-response';
import { topics } from './src/domain/catalog';
import { parseProblem } from './src/domain/problem-workbench';
const { LocalModel } = require(path.join(process.cwd(), 'desktop/local-model.cjs'));
const root = process.cwd(), profile = path.dirname(__filename);
const out = path.join(root, 'docs/verification/tutor-runtime');
const report = {at:new Date().toISOString(), status:'running', scope:'Actual getTutorResponse + actual local model; no BrowserWindow or installed EXE test', checks:[], diagnostics:[]};
const only = process.env.COSMOS_TUTOR_CASE;
const reportName = only && /^[a-z-]+$/.test(only) ? 'case-'+only+'.json' : 'result.json';
const log = (scope,message) => { report.diagnostics.push({scope,message}); console.log(scope,message); };
const model = new LocalModel({runtimeDir:path.join(root,'runtime'),userData:profile,log});
let current;
const actualFetch = globalThis.fetch;
globalThis.fetch = async (url,options) => {
  const response = await actualFetch(url,options);
  if (String(url).endsWith('/v1/chat/completions') && current) {
    const request = JSON.parse(options.body);
    const raw = await response.clone().json();
    (current.completions ||= []).push({stage:request.response_format?'review':'generation',content:raw.choices?.[0]?.message?.content,finishReason:raw.choices?.[0]?.finish_reason});
  }
  return response;
};
globalThis.window = {cosmos:{
  askModel:async request => { current.request=request; const started=Date.now();const response=await model.ask(request);current.transportMs=Date.now()-started;current.modelResponse=response;return response; },
  recordTutorCheck:async reason=>{log('tutor-check',reason);return true;}
}};
async function main(){
  await fs.mkdir(out,{recursive:true});
  await fs.writeFile(path.join(profile,'model.json'),JSON.stringify({backend:'gpu'}));
  const math=topics.find(t=>t.id==='math-rectangle'), russian=topics.find(t=>t.id==='russian-commas'),social=topics.find(t=>t.id==='social-demand');
  const problem=parseProblem('Найди площадь прямоугольника: длина 7 см, ширина 4 см.');
  if(!problem.verified)throw Error('Fixture rectangle not verified by the actual parser');
  const cases=[
    {id:'rectangle-multiplication',subject:'math',problem,message:'Почему здесь умножение, а не сложение?',fallback:problem.steps[1]?.narration || problem.explanation},
    {id:'russian-current-clause',subject:'russian',topic:russian,task:russian.tasks.find(t=>t.id==='commas-2'),message:'Почему в предложении «Я знаю что ты придёшь» нужна запятая перед что?',fallback:russian.tasks[1].explanation},
    {id:'social-own-price',subject:'social',topic:social,task:social.tasks.find(t=>t.id==='demand-1'),message:'Я написал спрос уменьшится. Почему это не так?',fallback:social.tasks[0].explanation}
  ];
  if(only && !cases.some(item=>item.id===only))throw Error('Unknown COSMOS_TUTOR_CASE');
  for(const item of cases.filter(item=>!only || item.id===only)){
    current={id:item.id};report.checks.push(current);
    try{
      current.result=await getTutorResponse({...item,name:'Ученик проверки',messages:[],allowAnswer:false});
      current.actualModelPassed=current.modelResponse?.ok===true && current.modelResponse?.verification?.status==='supported' && current.result.kind==='model' && current.result.verification?.evidence?.length>0;
    }catch(error){current.error=error.message;current.actualModelPassed=false;}
    console.log(item.id,JSON.stringify(current.result));
    await fs.writeFile(path.join(out,reportName),JSON.stringify(report,null,2));
  }
  report.status=report.checks.every(c=>c.actualModelPassed)?'transport-pass-pedagogy-needs-review':'fail';
}
main().catch(error=>{report.status='fail';report.error=error.message;}).finally(async()=>{
  model.cancel();await model.stopAndWait();report.finishedAt=new Date().toISOString();
  await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,reportName),JSON.stringify(report,null,2));
  process.exitCode=report.status==='fail'?1:0;
});
`,
  },
});
await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [runner], {
    cwd: root,
    windowsHide: true,
    stdio: 'inherit',
  });
  child.once('error', reject);
  child.once('exit', (code) => {
    process.exitCode = code || 0;
    resolve();
  });
});
