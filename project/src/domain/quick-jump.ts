import { subjects, topics } from './catalog';
import { listSchoolTopics } from './school-catalog';
import type { SubjectId } from './types';

export interface QuickJumpTopicResult {
  id:string;
  kind:'school'|'practice';
  subject:SubjectId;
  title:string;
  detail:string;
  pinned:boolean;
  curriculumNodeId?:string;
}
const normalized=(value:string)=>value.toLocaleLowerCase('ru').replaceAll('ё','е').replace(/[^\p{L}\p{N}.]+/gu,' ').trim();

/** The exam catalogue is the primary search target; existing local exercises remain explicitly separate. */
export function searchQuickJumpTopics(query:string, bookmarks:readonly string[]=[], limit=14):QuickJumpTopicResult[] {
  const normalizedQuery=normalized(query);
  if (!normalizedQuery) return [];
  const practiceOnly=/локальн[а-я]*\s+практик[а-я]*/u.test(normalizedQuery);
  const q=normalizedQuery.replace(/локальн[а-я]*\s+практик[а-я]*/gu,'').trim();
  const words=q.split(/\s+/u).filter(Boolean), pinned=new Set(bookmarks);
  const school=practiceOnly?[]:listSchoolTopics({query:q}).map(topic=>({
    topic,
    pinned:pinned.has(topic.id)||topic.lessonTopicIds.some(id=>pinned.has(id)),
    score:(normalized(topic.title).startsWith(q)?40:0)+(normalized(topic.recommendedStart?.title??'').startsWith(q)?60:0)+(topic.curriculumCodes.includes(q)?100:0),
  })).sort((a,b)=>Number(b.pinned)-Number(a.pinned)||b.score-a.score||a.topic.subject.localeCompare(b.topic.subject)||a.topic.curriculumCodes[0].localeCompare(b.topic.curriculumCodes[0],'ru',{numeric:true})).map(({topic,pinned}):QuickJumpTopicResult=>({
    id:topic.id,kind:'school',subject:topic.subject,title:topic.title,pinned,curriculumNodeId:topic.curriculumNodeIds[0],
    detail:`${subjects.find(subject=>subject.id===topic.subject)!.title} · ЕГЭ · код ${topic.curriculumCodes.join(', ')} · карта темы${topic.recommendedStart?` · начнём: ${topic.recommendedStart.title}`:''}`,
  }));
  const local=topics.filter(topic=>{
    const haystack=normalized(`${topic.title} ${subjects.find(subject=>subject.id===topic.subject)!.title}`);
    return words.every(word=>haystack.includes(word));
  }).sort((a,b)=>Number(pinned.has(b.id))-Number(pinned.has(a.id))).map((topic):QuickJumpTopicResult=>({
    id:topic.id,kind:'practice',subject:topic.subject,title:topic.title,pinned:pinned.has(topic.id),
    detail:`Локальная практика · ${subjects.find(subject=>subject.id===topic.subject)!.title} · ${topic.durationMinutes} мин`,
  }));
  return [...school,...local].slice(0,Number.isFinite(limit)?Math.max(1,Math.min(30,Math.floor(limit))):14);
}
