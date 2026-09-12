import {LocalModel} from '../desktop/local-model.cjs';
import fs from 'node:fs/promises';
import path from 'node:path';
const profile=path.resolve('test-results/evidence-runtime-'+Date.now());await fs.mkdir(profile,{recursive:true});
const events=[];
const runtime=new LocalModel({runtimeDir:path.resolve('runtime'),userData:profile,log:(scope,message)=>{events.push({at:new Date().toISOString(),scope,message});console.log(scope,message);}});
const results=[];
try{
 for(const input of [
  {subject:'math',topic:'Площадь прямоугольника',message:'Почему площадь измеряют в квадратных сантиметрах? Объясни один маленький шаг.',evidence:[{id:'math-area-proof',text:'Площадь показывает, сколько единичных квадратов помещается внутри фигуры. Квадрат со стороной 1 см имеет площадь 1 см². В прямоугольнике 7 клеток в одном ряду и 3 ряда. Площадь прямоугольника равна произведению длины и ширины: S = a · b.',sourceIds:['cosmos-training']}]},
  {subject:'history',topic:'Крещение Руси',message:'Я забыл дату. Дай подсказку, не называя год целиком.',evidence:[{id:'history-baptism-proof',text:'Традиционная дата Крещения Руси — 988 год, конец X века. Событие связывают с князем Владимиром Святославичем. Христианизация была длительным процессом, а не мгновенным изменением всей страны.',sourceIds:['cosmos-training']}]}
 ]){const started=Date.now();const result=await runtime.ask(input);results.push({input,result,elapsedMs:Date.now()-started});console.log(JSON.stringify(results.at(-1)));}
}finally{runtime.stop();await fs.mkdir('docs/verification',{recursive:true});await fs.writeFile('docs/verification/evidence-runtime-check.json',JSON.stringify({at:new Date().toISOString(),scope:'Real local runtime with explicit test evidence; not packaged UI or full knowledge acceptance',results,events},null,2));}
if(results.some(({result})=>!result.ok||result.verification?.status!=='supported'))process.exitCode=1;
