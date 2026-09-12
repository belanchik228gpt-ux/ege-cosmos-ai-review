import { curriculumNodes } from '../curriculum-data';
import type { CurriculumNode } from '../curriculum-data';
import type { SubjectId } from '../types';
import type { SchoolGrade, SchoolTopic } from './types';
import { schoolTopicOverlays, schoolSectionOverlay } from './overlays';

const subjectNames: Record<SubjectId, string> = { math: 'Математика', russian: 'Русский язык', history: 'История', social: 'Обществознание' };
const strategies: Record<SubjectId, { goal: string; prerequisites: string[]; method: string }> = {
  math: { goal: 'Выбирать модель и проверять каждый переход в задаче по теме', prerequisites: ['Чтение условия и обозначений', 'Проверка допустимых значений'], method: 'Назови известные величины и искомое. Выбери одно правило, объясни область его применения и только затем выполни первый шаг. После ответа проверь смысл и допустимость результата.' },
  russian: { goal: 'Обосновывать выбор языковой формы или знака по теме', prerequisites: ['Смысл высказывания', 'Определение части речи и грамматической основы'], method: 'Сначала прочитай контекст и установи грамматическую связь. Назови проверяемое правило, выбери вариант и объясни, какое условие правила выполнено. Не заменяй синтаксический разбор только интонацией.' },
  history: { goal: 'Связывать события, участников, причины и последствия по теме', prerequisites: ['Хронология и век', 'Различение факта, причины и оценки'], method: 'Построй короткую цепочку: предпосылка — событие — результат. Отдельно проверь дату, участника и историческую территорию. Для задания с источником привяжи вывод к конкретному свидетельству; официальная программа не является доказательством любой интерпретации.' },
  social: { goal: 'Применять понятия и причинные связи к конкретной ситуации по теме', prerequisites: ['Признак понятия и пример', 'Различение факта и оценки'], method: 'Дай определение через существенные признаки, проверь каждый признак на ситуации и добавь конкретный пример. В экономике уточни, какая величина меняется; в праве действующая норма требует отдельного актуального источника.' },
};
const compact = (text: string) => text.replace(/\s+/gu, ' ').trim();
const recommendedStarts: Record<string, NonNullable<SchoolTopic['recommendedStart']>> = {
  'ege-math-1-7': { lessonTopicId: 'math-absolute', title: 'Модуль числа и расстояние', description: 'Авторский первый шаг к действительным числам: модуль как расстояние, знак и координата. Это предварительная подтема, не официальное название всей позиции 1.7.' },
  'ege-math-1-3': { lessonTopicId: 'math-radicals', title: 'Корни, модуль и знаки выражений', description: 'Начни с квадратного корня из квадрата, модуля и знака выражения; затем переходи к остальным корням натуральной степени из полной позиции 1.3.' },
};
function assessedText(node: CurriculumNode): string {
  let text = node.title;
  for (const excluded of node.notAssessedFragments ?? []) text = text.split(excluded).join('');
  return compact(text.replace(/\(\s*\)/gu, '').replace(/([.;,])\s*([.;,])/gu, '$1'));
}
function fragments(text: string): string[] {
  // Publisher abbreviations and centuries remain together. Lists are navigation, not new claims.
  return [...new Set(text.split(/;\s*|\.\s+(?=[А-ЯЁ])/u).map(compact).filter(Boolean))];
}
function gradeMapping(node: CurriculumNode): { grades: SchoolGrade[]; grade: SchoolGrade; note: string; foundation: boolean } {
  const eligible = [...new Set(node.schoolGrades.filter((g): g is SchoolGrade => [8, 9, 10, 11].includes(g)))];
  // The checked basic senior-school programme explicitly revisits rational equations in grade 10.
  if (node.subject === 'math' && node.code === '2.1') eligible.push(10);
  if (node.subject === 'social' && ['3.1', '3.2', '3.3'].includes(node.code)) eligible.push(10);
  const foundation = node.subject === 'math' && ['1.1', '1.2'].includes(node.code);
  if (!eligible.length) eligible.push(8);
  const socialIntro = node.subject === 'social' && /^(1\.[1-8]|2\.[1-3]|3\.[1-3]|5\.[1-3])$/u.test(node.code);
  if (socialIntro) eligible.push(8, 9);
  const grades = [...new Set(eligible)].sort((a, b) => a - b);
  const grade = node.subject === 'math' && ['1.3', '1.7', '1.8', '2.1'].includes(node.code) ? 10 : grades[0];
  let note = 'Авторская навигация по этапам 8–11 классов для подготовки к ЕГЭ, а не точный календарный план школы. Состав проверяемого материала задаёт кодификатор; порядок зависит от программы и подготовки ученика.';
  if (!node.schoolGrades.some((g) => g >= 8)) note += ' Материал введён раньше 8 класса; здесь он отмечен как повторение для экзамена.';
  if (foundation) note += ' Базовый предварительный навык: доступен по запросу, не включается в обычный старт 10 класса.';
  if (socialIntro) note += ' Для 8 класса это дополнительная подготовка к понятиям кодификатора: с сентября 2026 года обществознание в основной школе обязательно только в 9 классе.';
  if (node.subject === 'social') note += ' В 2026/27 десятиклассники переходят на новую программу, одиннадцатиклассники завершают прежнюю; распределение карточек здесь ориентировочное.';
  return { grades, grade, note, foundation };
}
function programmeSources(node: CurriculumNode, grades: SchoolGrade[]): string[] {
  if (node.subject === 'social') return ['edsoo-social-transition', 'edsoo-social-2026', 'edsoo-social-secondary'];
  return [ ...(grades.some((g) => g <= 9) ? [`edsoo-${node.subject}-lower`] : []), ...(grades.some((g) => g >= 10) ? [`edsoo-${node.subject}-upper`] : []) ];
}
function buildCard(node: CurriculumNode): SchoolTopic {
  const title = assessedText(node), gradeInfo = gradeMapping(node), strategy = strategies[node.subject], overlay = { ...schoolSectionOverlay(node.subject, node.code), ...schoolTopicOverlays[node.id] };
  const subtopics = fragments(title), keyConcepts = overlay?.keyConcepts ?? subtopics.map((part) => part.replace(/\.$/u, ''));
  const lessonTopicIds = [...new Set([...(node.lessonTopicIds ?? []), ...(node.lessonTopicId ? [node.lessonTopicId] : [])])];
  const recommendedStart = recommendedStarts[node.id];
  const sourceIds = [node.sourceId, ...programmeSources(node, gradeInfo.grades), ...(node.id==='ege-math-1-7'?['openstax-absolute-value']:node.id==='ege-math-1-3'?['openstax-roots','openstax-special-products']:[]), 'cosmos-training'];
  const goal = overlay?.goal ?? `${strategy.goal} «${subtopics[0].replace(/\.$/u, '')}».`;
  const prerequisites = overlay?.prerequisites ?? strategy.prerequisites;
  const formulas = overlay?.formulas ?? [];
  const scope = 'Это авторская карта проверяемого содержания и учебных целей. Наличие карточки не означает готового полного урока, банка заданий или подтверждённого освоения. Подробные объяснения модели нужно проверять; просмотр всех карточек не гарантирует экзаменационный балл.';
  const examLevelNote = node.subject === 'math' ? 'Общий кодификатор математики охватывает оба уровня. Эта связь не утверждает, что весь пункт проверяется в базовом ЕГЭ: точные 21 позиции базы показаны отдельно по спецификации, без переноса родительского кода на все подпункты.' : 'Пункт содержится в окончательном кодификаторе ЕГЭ 2026; проекты 2027 сюда не примешаны.';
  const context = [ `${subjectNames[node.subject]}. Тема: ${title}`, `Цель: ${goal}`, `Состав темы: ${subtopics.join('; ')}`, `Опорные понятия: ${keyConcepts.join('; ')}`, `Предварительные навыки: ${prerequisites.join('; ')}`, ...(formulas.length ? [`Формулы и ограничения: ${formulas.join('; ')}`] : []), overlay?.explanation ?? strategy.method, `Происхождение состава: ФИПИ, кодификатор ${node.editionYear}, код ${node.code}, физическая страница PDF ${node.page}. Источник программы не подтверждает автоматически каждое модельное объяснение.`, gradeInfo.note, examLevelNote, scope ].join('\n');
  return { id: `school-${node.subject}-${node.code.replaceAll('.', '-')}`, subject: node.subject, grade: gradeInfo.grade, grades: gradeInfo.grades, section: node.section, title, goal, keyConcepts, formulas, prerequisites, subtopics, curriculumNodeIds: [node.id], curriculumCodes: [node.code], sourceIds, sourceReferences: [{ sourceId: node.sourceId, documentId: node.sourceDocumentId, page: node.page, editionYear: node.editionYear }], gradeBasis: 'approximate', gradeNote: gradeInfo.note, materialStatus: 'authored-guide', examRelevance: 'assessed-content', lessonTopicIds, ...(recommendedStart?{recommendedStart}:{}), availability: lessonTopicIds.length ? 'practice' : 'guide', foundation: gradeInfo.foundation, exclusionNotes: [...(node.notAssessedFragments ?? [])], examLevels: [...(node.examLevels ?? [])], examLevelNote, context };
}

/** Every assessed final-edition leaf, including the assessed remainder of partly excluded nodes. */
export const schoolTopics: SchoolTopic[] = curriculumNodes.filter((node) => node.editionStatus === 'final' && node.editionYear === 2026 && node.assessmentStatus === 'assessed').map(buildCard);
export const schoolTopicsBySubjectCounts: Record<SubjectId, number> = Object.fromEntries(Object.keys(subjectNames).map((subject) => [subject, schoolTopics.filter((topic) => topic.subject === subject).length])) as Record<SubjectId, number>;
export const schoolCatalogMetadata = {
  version: '2026.09.08.1', checkedAt: '2026-09-08', editionYear: 2026, editionStatus: 'final' as const,
  totalSourceNodes: curriculumNodes.length,
  sectionCount: curriculumNodes.filter((node) => node.assessmentStatus === 'section').length,
  excludedLeafCount: curriculumNodes.filter((node) => node.assessmentStatus === 'not-assessed-in-edition').length,
  topicCount: schoolTopics.length,
  scope: 'Все проверяемые конечные коды четырёх кодификаторов 2026; авторские карты содержания с ориентировочными классами, не полный готовый курс.',
  targetNote: '80+ — целевой результат для предметов со стобалльной шкалой, а не обещание. Базовая математика оценивается по пятибалльной системе; её цель формулируется как отметка 5. Готовность проверяется самостоятельными заданиями и пробными вариантами.',
};
