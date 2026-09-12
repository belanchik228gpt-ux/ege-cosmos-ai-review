import { retrieveKnowledge, getKnowledgeForTopic } from './knowledge';
import { sources, examMaterialStatus } from './sources';
import type { SubjectId, Topic } from './types';

/** Exam criteria come from the reviewed publisher registry, never from a model's invented URL. */
export function isExamReferenceQuery(query: string) {
  return /фипи|(?:^|[^\p{L}])ким(?:$|[^\p{L}])|кодификатор|демоверси|спецификаци|официальн.{0,30}(задани|экзамен|материал)|критери.{0,25}(оцен|егэ|сочинен)|балл.{0,20}(егэ|экзамен|задани)|сколько.{0,25}задани.{0,20}(егэ|экзамен)|структур.{0,20}(егэ|экзамен)/iu.test(
    query,
  );
}
export function prepareGrounding(subject: SubjectId, query: string, topic: Topic) {
  let cards = retrieveKnowledge(subject, query, topic.id, 1);
  if (!cards.length) cards = getKnowledgeForTopic(topic.id, subject).slice(0, 1);
  const sourceIds = [...new Set(cards.flatMap((card) => card.sourceIds))].filter((id) =>
    sources.some((s) => s.id === id && s.subjects.includes(subject)),
  );
  const fragments = cards
    .map((card) => `${card.title}: ${card.explanation.slice(0, 2).join(' ')}`)
    .join('\n')
    .slice(0, 1700);
  return { cards, sourceIds, knowledgeIds: cards.map((card) => card.id), context: fragments };
}

export interface TutorResponseReview {
  /** Only means that none of these limited contradiction rules matched. */
  accepted: boolean;
  replacementText: string | null;
  reason: string | null;
  sourceIds: string[];
  knowledgeIds: string[];
  scope: 'limited-rules';
}

export interface ProblemExplanationReview {
  /** Passing only means these two known fraction misconceptions were not detected. */
  accepted: boolean;
  reason: string | null;
  scope: 'limited-rules';
}

function normalized(text: string): string {
  return text
    .normalize('NFKC')
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
    .trim();
}

const romanValues: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };
const centuryWords: [RegExp, number][] = [
  [/^девятнадцат/, 19],
  [/^восемнадцат/, 18],
  [/^семнадцат/, 17],
  [/^шестнадцат/, 16],
  [/^пятнадцат/, 15],
  [/^четырнадцат/, 14],
  [/^тринадцат/, 13],
  [/^двенадцат/, 12],
  [/^одиннадцат/, 11],
  [/^десят/, 10],
  [/^двадцат/, 20],
  [/^девят/, 9],
  [/^восьм/, 8],
];

function centuryNumber(token: string): number | null {
  if (/^\d{1,2}$/.test(token)) return Number(token);
  for (const [pattern, century] of centuryWords) if (pattern.test(token)) return century;
  const roman = token.replace(/х/g, 'x').replace(/і/g, 'i');
  if (!/^[ivxlcdm]+$/.test(roman)) return null;
  let total = 0;
  for (let i = 0; i < roman.length; i++) {
    const current = romanValues[roman[i]!]!;
    total += current < (romanValues[roman[i + 1]!] ?? 0) ? -current : current;
  }
  return total >= 1 && total <= 30 ? total : null;
}

interface HistoryRule {
  topicId: string;
  expected: number;
  event: RegExp;
  otherEvent: RegExp;
  reason: string;
  text: string;
  hint: string;
}

const historyRules: HistoryRule[] = [
  {
    topicId: 'history-baptism',
    expected: 10,
    event:
      /крещени[еяю]\s+(?:(?:киевской|древней)\s+)?руси|приняти[ея]\s+христианства\s+на\s+руси|владимир[^.!?]{0,45}христиан/u,
    otherEvent:
      /петр|екатерин|александр|франц|северн.{0,10}войн|куликов|отмен.{0,20}крепостн|реформ.{0,12}1861/u,
    reason: 'baptism-century-contradiction',
    text: 'Традиционная дата Крещения Руси — 988 год, конец X века. Событие связывают с князем Владимиром Святославичем. Что из этой связки попробуешь вспомнить самостоятельно?',
    hint: 'Вспомни конец X века, незадолго до 1000 года. Попробуешь назвать год?',
  },
  {
    topicId: 'history-reform',
    expected: 19,
    event: /отмен[аыуе]\s+крепостного\s+права|крестьянск[а-я]*\s+реформ[а-я]*|реформ[а-я]*\s+1861/u,
    otherEvent: /петр|екатерин|франц|северн.{0,10}войн|куликов|крещени|владимир/u,
    reason: 'reform-century-contradiction',
    text: 'Отмена крепостного права в России связана с реформой 1861 года при Александре II. Это XIX век. Чем личная свобода отличается от получения земли?',
    hint: 'Ориентир — XIX век, его вторая половина. Попробуешь вспомнить год реформы?',
  },
];

function hasCenturyContradiction(query: string, response: string, rule: HistoryRule): boolean {
  const queryNamesEvent = rule.event.test(query);
  const asksDifferentTarget =
    rule.otherEvent.test(query) ||
    /(?:^|[^\p{L}])(?:жил[аи]?|родил[а-я]*|умер[а-я]*|правил[аи]?)(?:$|[^\p{L}])/u.test(query) ||
    (!queryNamesEvent &&
      /крещени[еяю]\s+(?!(?:руси|киевской|древней|произошло|состоялось)(?:\s|$))\p{L}+|христианств/u.test(
        query,
      ));
  const queryReferencesTopic =
    !asksDifferentTarget &&
    (queryNamesEvent || /дат|век|столети|(?:каком|какой|вспомнить)\s+год/u.test(query));
  // Separate comparisons so another event's correct century is not attributed to this topic.
  const clauses = response.split(
    /[!?;\n]|(?<!в)\.(?:\s|$)|,\s+(?:а|но|тогда\s+как|в\s+то\s+время\s+как)\s+/u,
  );
  for (const sentence of clauses) {
    const eventIndex = sentence.search(rule.event);
    const hasEvent = eventIndex >= 0;
    const deictic =
      /^\s*(?:(?:это|оно|событие|дата|подсказка|ориентир|вспомни)(?:\s|[—–:-])|(?:988|1861)(?:\s|[—–:-])|крещение\s+(?:произошло|состоялось|пришлось)|реформа\s+(?:произошла|состоялась|пришлась)|(?:начало|конец|середина)\s+|в\s+(?:начале|конце|середине|[ivx\d])|(?:[ivxlcdmхі]+|\d{1,2}|[а-я]+)\s+(?:век|столет))/u.test(
        sentence,
      );
    if (!hasEvent && !(queryReferencesTopic && deictic && !rule.otherEvent.test(sentence)))
      continue;
    const centuryPattern =
      /(?<![\p{L}\p{N}])([ivxlcdmхі]+|\d{1,2}|[а-я]+)(?:[-‑–]?(?:го|й|ом|му|ый))?\s*(?:век[а-я]*|столет[а-я]*|в\.)(?!\p{L})/gu;
    for (const match of sentence.matchAll(centuryPattern)) {
      const value = centuryNumber(match[1]!);
      if (value === null || value === rule.expected) continue;
      const position = match.index!;
      const before = sentence.slice(0, position);
      const after = sentence.slice(position + match[0].length, position + match[0].length + 65);
      // A correction or explicitly rejected claim must not itself trigger rejection.
      if (
        /(?:^|[^\p{L}])не\s+(?:(?:в|к|начале|конце|середине|первой|второй|половине|это)\s+){0,4}$/u.test(
          before,
        ) ||
        /(?:ошибочно|неверно|неправильно|нельзя|не\s+нужно\s+путать)[^;.!?]*$/u.test(before)
      )
        continue;
      if (/^\s*(?:[—–-]\s*)?(?:неверн|ошибочн|неправильн|ошибка)/u.test(after)) continue;
      if (
        hasEvent &&
        position > eventIndex &&
        rule.otherEvent.test(sentence.slice(eventIndex, position))
      )
        continue;
      if (
        hasEvent &&
        position < eventIndex &&
        rule.otherEvent.test(sentence.slice(position, eventIndex))
      )
        continue;
      return true;
    }
  }
  return false;
}

function wantsDateHint(query: string): boolean {
  return /подсказ|не\s+помню|забыл|не\s+знаю|не\s+называ[йят]|не\s+говори/u.test(query);
}

function initialSubordinateContradiction(
  topicId: string,
  query: string,
  response: string,
): boolean {
  if (!['russian-commas', 'russian-syntax'].includes(topicId)) return false;
  const quotedExamples = [...query.matchAll(/[«“"]([^»”"]+)[»”"]/gu)].map((match) =>
    match[1]!.trim(),
  );
  const hasKnownExample = quotedExamples.some((example) =>
    /^когда\s+наступила\s+весна\s*,\s*птицы\s+вернулись(?:\s+домой)?[.!?]?$/u.test(example),
  );
  // A different explicitly quoted sentence is outside this narrowly checked example.
  const explicitOtherExample = quotedExamples.length > 0 && !hasKnownExample;
  if (
    explicitOtherExample ||
    (!hasKnownExample && !/запят|этими\s+частями|этой\s+фраз|этом\s+предложени/u.test(query))
  )
    return false;
  for (const sentence of response.split(/[.!?;\n]/u)) {
    if (/если|когда\s+придаточн|в\s+другом\s+предложени|при\s+другом\s+порядке/u.test(sentence))
      continue;
    if (
      /не\s+(?:показывает|обозначает|открывает|начинается|начинает)|ошибочн|неверн|неправильн/u.test(
        sentence,
      )
    )
      continue;
    if (
      /запятая[^.!?]{0,70}(?:начинается\s+(?:эта\s+)?придаточн|начал[а-я]*\s+придаточн|открывает\s+(?:эту\s+)?придаточн)/u.test(
        sentence,
      ) ||
      /придаточн[^.!?]{0,35}(?:начинается|идет|стоит)[^.!?]{0,20}после\s+запят/u.test(sentence) ||
      /после\s+запят[^.!?]{0,25}(?:начинается|идет|стоит)\s+придаточн/u.test(sentence)
    )
      return true;
  }
  return false;
}

// Narrow rule for the observed own-price/quantity confusion. It does not grade
// economics generally and excludes explicitly discussed related-good prices.
function ownPriceDemandConfusion(query: string, response: string): boolean {
  const otherFactor =
    /доход|заменител|субститут|дополняющ|сопряжен|другого\s+товара|предпочтени|вкус[а-я]*\s+покупател|ожидани|числ[ао]\s+покупател/u;
  const priceChange =
    /(?:повышени[еяи]|понижени[еяи]|изменени[еяи]|рост[ае]?|снижени[еяи]|увеличени[еяи]|падени[еяи])\s+цен[а-я]*|цен[аыя]\s+(?:(?:самого|этого|данного)\s+)?(?:товара\s+)?(?:раст[а-я]*|вырос[а-я]*|повыш[а-я]*|сниж[а-я]*|увелич[а-я]*|уменьш[а-я]*)|измени[а-я]*\s+(?:только\s+)?цен[а-я]*|изменени[еяи]\s+(?:только\s+)?цен[а-я]*\s+самого\s+товара/u;
  // The UI supplies the actual task after this marker. A short reply can omit its premise.
  const activeCondition = query.split('текущее условие:').at(-1) ?? query;
  const ownPriceContext = priceChange.test(activeCondition) && !otherFactor.test(activeCondition);
  for (const sentence of response.split(/[.!?;\n]/u)) {
    if (/нельзя|некоррект|неверн|ошибоч|неточн/u.test(sentence)) continue;
    let previousDemand = false;
    for (const clause of sentence.split(/,\s*(?=(?:а|но|однако)\s)/u)) {
      const namesDemand = /(?:^|[^\p{L}])(?:спрос[а-я]*|крив[а-я]*)(?!\p{L})/u.test(clause);
      const demandContext = namesDemand || previousDemand;
      previousDemand = namesDemand || (previousDemand && /^\s*(?:а|но|однако)\s/u.test(clause));
      if (
        otherFactor.test(clause) ||
        !demandContext ||
        !(ownPriceContext || priceChange.test(clause))
      )
        continue;
      for (const match of clause.matchAll(/сдвиг[а-я]*|сдвин[а-я]*|смещ[а-я]*|смест[а-я]*/gu)) {
        const before = clause.slice(0, match.index),
          after = clause.slice(match.index! + match[0].length);
        // Keep negated shifts, comparisons and explicitly rejected statements usable.
        if (
          /(?:^|\s)не(?:\s+[\p{L}-]+){0,3}\s*$/u.test(before) ||
          /^\s*(?:(?:(?:крив[а-я]*(?:\s+спрос[а-я]*)?|спрос[а-я]*)\s+)?(?:не\s+(?:происход|наблюда|возника|будет)|отсутств)|(?:[—–-]\s*)?(?:неверн|ошибоч)|ли(?:\s|$))/u.test(
            after,
          )
        )
          continue;
        return true;
      }
    }
    if (otherFactor.test(sentence)) continue;
    const priceChanges = priceChange.test(sentence);
    const bareDemandChanges =
      /(?:^|[^\p{L}])спрос\s+(?:на\s+[^,;:.!?]{1,45}\s+)?(?:(?:обычно|часто|тогда|как\s+правило)\s+)?(?:(?:уменьш|сниж|сниз|пад|раст|возраст|увелич|сокращ|пониж|повыш|измен|меня)[а-я]*|становится\s+(?:меньше|больше))/u.test(
        sentence,
      );
    if (priceChanges && bareDemandChanges) return true;
  }
  return false;
}

/**
 * Two bounded rules for explanations of fraction addition in a pupil's own problem.
 * A rejected reply needs a separately labelled authored fallback at the call site.
 * This is not symbolic verification, a general fact checker, or a teaching-quality score.
 */
export function reviewProblemExplanation(
  query: string,
  response: string,
): ProblemExplanationReview {
  const q = normalized(query);
  const fractionAddition =
    /\d+\s*[/⁄]\s*\d+\s*\+\s*\d+\s*[/⁄]\s*\d+/u.test(q) ||
    (/дроб|знаменател|дол[яией]/u.test(q) && /сложени|складыва|сложить|сумм/u.test(q));
  const result = (reason: string | null): ProblemExplanationReview => ({
    accepted: reason === null,
    reason,
    scope: 'limited-rules',
  });
  if (!fractionAddition) return result(null);

  // Remove explicitly refuted quotations before sentence splitting: their punctuation
  // must not turn a quoted misconception into an apparently asserted statement.
  const text = normalized(response).replace(
    /[«“"]([^»”"]*)[»”"]\s*(?:[—–-]\s*)?(?:это\s+)?(?:неверн|ошибоч|ошибк|неправил|неточн)[^.!?;]*/gu,
    '',
  );
  let convertedPreviously = false;
  for (const sentence of text.split(/[.!?;\n]/u)) {
    const common = sentence.search(/(?:общ[а-я]*|одинаков[а-я]*)\s+знаменател/u);
    const explicitlyRefutes =
      /(?:неверно|ошибочно|неправильно|неточно|нельзя)\s+(?:говорить|утверждать|считать|думать)|не\s+(?:значит|означает|следует),?\s+что/u.test(
        sentence,
      );
    if (explicitlyRefutes) {
      convertedPreviously = false;
      continue;
    }
    const namesAddition = /сложени[еяю]|сложить|складыва/u.test(sentence);
    const namesFractions = /дроб[а-я]*/u.test(sentence);
    const qualifiedAlgorithm =
      /напрямую|непосредственно|сразу|без\s+(?:предварительного\s+)?(?:приведения|преобразования)|числител/u.test(
        sentence,
      );
    const onlyEqualDenominators =
      /только\s+(?:(?:при|с|для|если)\s+)?(?:одинаков[а-я]*|равн[а-я]*|общ[а-я]*)\s+знаменател|только\s+дроб[а-я]*\s+с\s+(?:одинаков[а-я]*|равн[а-я]*|общ[а-я]*)\s+знаменател/u.test(
        sentence,
      );
    const prohibitsDifferentDenominators =
      /(?:разн[а-я]*|неодинаков[а-я]*)\s+знаменател/u.test(sentence) &&
      /невозмож|нельзя|недопустим|не\s+могут\s+(?:быть\s+)?сложен/u.test(sentence);
    if (
      namesAddition &&
      namesFractions &&
      !qualifiedAlgorithm &&
      !/не\s+только/u.test(sentence) &&
      (onlyEqualDenominators || prohibitsDifferentDenominators)
    )
      return result('fraction-addition-forbidden-with-different-denominators');

    const unequalParts =
      /(?:дол[яией]+|част[а-я]*)[^.!?;]{0,45}(?:(?:разн[а-я]*|неодинаков[а-я]*|неравн[а-я]*)\s+(?:по\s+)?(?:размер|величин)|(?:остаются|стали|становятся)\s+(?:разн[а-я]*|неодинаков[а-я]*|неравн[а-я]*))|(?:разн[а-я]*|неодинаков[а-я]*|неравн[а-я]*)\s+(?:по\s+размеру\s+)?(?:дол[яией]+|част[а-я]*)/u.exec(
        sentence,
      );
    if (unequalParts) {
      const position = unequalParts.index;
      const before = sentence.slice(0, position);
      const comparisonOrNegation =
        /(?:не|вместо)\s*$/u.test(before) ||
        /не\s+(?:разн[а-я]*|неодинаков[а-я]*|неравн[а-я]*)/u.test(unequalParts[0]);
      const convertsUnequalIntoEqual =
        /привест|привод|преобраз|перепис/u.test(before) &&
        /(?:к|в)\s+(?:одинаков|равн)/u.test(sentence.slice(position + unequalParts[0].length));
      // Initial unequal portions are a legitimate motivation for conversion. Reject
      // an asserted unequal size only after the common-denominator step or in its result.
      const afterConversion =
        (common >= 0 && common < position) ||
        (convertedPreviously && /^\s*(?:теперь|после\s+этого|значит|получились)/u.test(sentence));
      if (afterConversion && !comparisonOrNegation && !convertsUnequalIntoEqual)
        return result('fraction-common-denominator-unequal-parts');
    }
    convertedPreviously = common >= 0 && /привел|привед|получ|перепис/u.test(sentence);
  }
  return result(null);
}

/**
 * Limited factual contradiction check, not a general fact checker or a teaching grade.
 * Rejected output is replaced by authored material; callers MUST NOT label it as a model reply.
 */
export function reviewTutorResponse(
  subject: SubjectId,
  topicId: string,
  query: string,
  response: string,
): TutorResponseReview {
  const q = normalized(query),
    r = normalized(response);
  let reason: string | null = null,
    replacementText: string | null = null;
  if (subject === 'history') {
    const rule = historyRules.find((candidate) => candidate.topicId === topicId);
    if (rule && hasCenturyContradiction(q, r, rule)) {
      reason = rule.reason;
      replacementText = wantsDateHint(q) ? rule.hint : rule.text;
    }
  }
  if (subject === 'russian' && initialSubordinateContradiction(topicId, q, r)) {
    reason = 'initial-subordinate-boundary-contradiction';
    replacementText =
      'В примере «Когда наступила весна, птицы вернулись» придаточная стоит первой. Запятая закрывает эту часть. Какое слово стоит перед запятой?';
  }
  if (subject === 'social' && topicId === 'social-demand' && ownPriceDemandConfusion(q, r)) {
    reason = 'own-price-demand-quantity-confusion';
    replacementText =
      'При прочих равных рост цены самого товара обычно уменьшает величину спроса — количество, которое готовы и могут купить по этой цене. Сама кривая спроса из-за этого не сдвигается. Представь, что на яблоки у тебя прежний бюджет: как рост цены повлияет на доступное количество?';
  }
  const sourceTopic =
    reason === 'initial-subordinate-boundary-contradiction' ? 'russian-commas' : topicId;
  const cards = reason ? getKnowledgeForTopic(sourceTopic, subject).slice(0, 1) : [];
  return {
    accepted: reason === null,
    replacementText,
    reason,
    sourceIds: [...new Set(cards.flatMap((card) => card.sourceIds))],
    knowledgeIds: cards.map((card) => card.id),
    scope: 'limited-rules',
  };
}
export function examReferenceReply(subject: SubjectId, query = '') {
  const references = sources.filter(
    (source) => {
      if (source.status !== 'official-reference' || !source.subjects.includes(subject)) return false;
      // Official school programmes explain the curriculum, but only FIPI publishes these KIM requirements.
      try {
        const url = new URL(source.url);
        return url.protocol === 'https:' && /(^|\.)fipi\.ru$/u.test(url.hostname);
      } catch {
        return false;
      }
    },
  );
  const ids = references
    .filter((source) =>
      /2027|2026|демоверси|кодификатор|банк/i.test(source.title + ' ' + source.version),
    )
    .map((source) => source.id);
  return {
    text: `Структуру экзамена, критерии и официальные задания сверяем с ФИПИ. В локальном комплекте ЕГЭ-${examMaterialStatus.finalYear} — утверждённые материалы, а ЕГЭ-${examMaterialStatus.draftYear} — проекты; статус проверен ${new Date(examMaterialStatus.checkedAt).toLocaleDateString('ru-RU')}. Спецификации и кодификаторы можно открыть под этим сообщением, в том числе без интернета. ${/20\d{2}/.test(query) ? 'Какую часть требований разберём?' : 'К какому году экзамена готовишься?'}`,
    sourceIds: ids.length ? ids : references.map((s) => s.id),
  };
}
