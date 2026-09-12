const { performance } = require('node:perf_hooks');
const { checkArithmetic } = require('../shared/arithmetic-review.cjs');
const { formulaAtomCounts } = require('../shared/chemistry-atoms.cjs');
function reactionCheck(formula) {
  const plain = String(formula || '')
    .replace(/\\(?:mathrm|text)\{([^{}]*)\}/g, '$1')
    .replace(/\\mathrm\s*/g, '')
    .replace(/_\{(\d+)\}|_(\d+)/g, (_, a, b) => a || b)
    .replace(/\\(?:longrightarrow|rightarrow)/g, '→')
    .replace(/[{}$]/g, '')
    .trim();
  const sides = plain.split(/→|->/);
  if (sides.length !== 2 || plain.length > 300) return;
  const counts = sides.map((side) => {
    const total = {},
      parts = side.split('+');
    if (parts.length > 8) return null;
    for (const part of parts) {
      const atoms = formulaAtomCounts(part.trim());
      if (!atoms) return null;
      for (const [key, n] of Object.entries(atoms)) total[key] = (total[key] || 0) + n;
    }
    return total;
  });
  if (counts.some((c) => !c)) return;
  const balanced = [...new Set([...Object.keys(counts[0]), ...Object.keys(counts[1])])].every(
    (e) => counts[0][e] === counts[1][e],
  );
  return {
    kind: 'atom-balance',
    expression: plain,
    status: balanced ? 'matched' : 'conflict',
    correction: balanced
      ? undefined
      : 'В этом уравнении число атомов слева и справа различается. Подбирать нужно коэффициенты перед формулами, сохраняя индексы веществ.',
  };
}

// A mandatory, bounded check of explicit claims. It is deliberately NOT a second
// model opinion or a claim that every sentence has been proved by a textbook.
const dates = [
  {
    name: 'Крымская война',
    stem: 'Крымск[а-я]+\\s+войн[а-я]+',
    start: 1853,
    end: 1856,
    url: 'https://www.prlib.ru/history/619634',
  },
  {
    name: 'Северная война',
    stem: 'Северн[а-я]+\\s+войн[а-я]+',
    start: 1700,
    end: 1721,
    url: 'https://www.prlib.ru/section/1336967',
  },
];
const normalize = (s) =>
  String(s || '')
    .replace(/\\(?:left|right|displaystyle)/g, '')
    .replace(/\\(?:cdot|times)/g, '·')
    .replace(/\\(?:div)/g, '/')
    .replace(/\\[,;! ]/g, ' ')
    .replace(/\{,\}/g, ',')
    .replace(/\\(?:text|mathrm)\{([^{}]*)\}/g, '$1')
    .replace(/\\frac\{([\d.,+*/() -]+)\}\{([\d.,+*/() -]+)\}/g, '(($1)/($2))');
const quotedOrExercise = (s) =>
  /[?？]|(?:неверн|ошибочн|ошибк|ложн|нельзя|ученик\s+(?:написал|получил)|проверь\s+равенство|верно\s+ли|уравнено\s+ли)/iu.test(
    s,
  );

function claimLines(text, context = '') {
  if (quotedOrExercise(context)) return [];
  const mask = (s) => s.replace(/[^\n]/g, ' ');
  const source = normalize(
    String(text || '')
      .slice(0, 16000)
      .replace(/```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)/g, mask)
      .replace(/`[^`]*`|«[^»]*»|“[^”]*”|„[^“]*“|"[^"\n]*"|'[^'\n]*'/g, mask)
      .replace(/^\s*>.*$/gm, mask),
  ).replace(/\$\$|\\\[|\\\]/g, '');
  const joined = [];
  for (const raw of source.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const previous = joined.at(-1);
    if (previous && (/[=+*/·(−–^√-]\s*$/.test(previous) || /^[=+*/·)^]/.test(line)))
      joined[joined.length - 1] += ' ' + line;
    else joined.push(line);
  }
  let exerciseNext = false;
  return joined
    .flatMap((line) => line.split(/(?<=[.!])\s+(?=[А-ЯA-Z])/u))
    .filter((line) => {
      const exercise = quotedOrExercise(line);
      if (exerciseNext) {
        exerciseNext = false;
        return false;
      }
      if (
        exercise &&
        (/[:]\s*$/.test(line) ||
          /(?:равенств|выражен|ошиб|ученик|уравнен).*?[?？]\s*$/iu.test(line))
      )
        exerciseNext = true;
      return !exercise;
    });
}
const claimedBalanced = (s) =>
  !quotedOrExercise(s) &&
  !/неуравнен|(?:^|\s)не\s+(?:уравнен|сбалансирован)|баланс\s+(?:атомов\s+)?не\s+соблюд/iu.test(
    s,
  ) &&
  /(?:уравнен[оаы]|уравненное|баланс\s+(?:соблюд|атомов\s+соблюд))/iu.test(s);
const termMentioned = (corpus, term) =>
  [term.term, ...(term.topicAliases || [])].some((phrase) => {
    const value = phrase.toLocaleLowerCase('ru').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|[^\\p{L}])${value}(?=$|[^\\p{L}])`, 'u').test(corpus);
  });

function dateChecks(line, push) {
  for (const fact of dates) {
    const name = new RegExp(fact.stem, 'giu');
    for (const match of line.matchAll(name)) {
      const tail = line.slice(match.index + match[0].length).replace(/^\s*[,—:–-]?\s*/, '');
      const range = tail.match(/^[(:]?\s*(\d{4})\s*[–—-]\s*(\d{4})(?!\d)/u);
      const check = (expression, correct) =>
        push({
          kind: 'date',
          expression,
          status: correct ? 'matched' : 'conflict',
          correction: `${fact.name}: ${fact.start}–${fact.end} гг.`,
          sourceUrl: fact.url,
        });
      if (range)
        check(match[0] + ' ' + range[0], +range[1] === fact.start && +range[2] === fact.end);
      const verbPattern =
        /^(началась|начало|завершилась|закончилась|окончание)\s+(?:в\s+)?(\d{4})(?!\d)/iu;
      let rest = tail;
      // A second directly coordinated verb still refers to the same war. Never
      // reach through an intervening event such as an attack or a siege.
      for (let count = 0; count < 2; count++) {
        const claim = rest.match(verbPattern);
        if (!claim) break;
        check(
          match[0] + ' ' + claim[0],
          +claim[2] === (/^нач/iu.test(claim[1]) ? fact.start : fact.end),
        );
        const separator = rest
          .slice(claim[0].length)
          .match(/^\s*(?:году|года|год|г\.)?\s*(?:,?\s*и\s+|,\s*)/iu);
        if (!separator) break;
        rest = rest.slice(claim[0].length + separator[0].length);
      }
    }
  }
}
function reviewAnswer(result, request = {}) {
  const started = performance.now(),
    checks = [],
    references = [];
  // The checkpoint is visible in the lesson and is also sent above the writing
  // sheet. Its explicit assertions require the same review as the chat text.
  // The task may intentionally contain a mistake to investigate; inherit its
  // instruction so that an exercise is not mistaken for an asserted equality.
  // memory is a provenance summary containing student beliefs and tentative
  // attempts, not an independent mathematical assertion by the teacher.
  const learningEntries = result.learningStep
    ? [
        { text: result.learningStep.task, context: result.learningStep.instruction },
        { text: result.learningStep.instruction },
        { text: result.learningStep.why },
        { text: result.learningStep.stage },
        ...(result.learningStep.recap || []).slice(0, 6).map((text) => ({ text })),
        ...(result.learningStep.plan || []).slice(0, 8).map((item) => ({ text: item.title })),
      ]
    : [];
  const blocks = [
    result.text,
    result.summary,
    ...learningEntries.map((e) => e.text),
    ...(result.scene?.steps || []).flatMap((s) => [s.caption, s.formula, ...(s.labels || [])]),
  ]
    .filter((s) => typeof s === 'string')
    .slice(0, 180);
  const entries = [
    { text: result.text },
    { text: result.summary },
    ...learningEntries,
    ...(result.scene?.steps || []).flatMap((s) => [
      { text: s.caption },
      { text: s.formula, context: s.caption },
      ...(s.labels || []).map((text) => ({ text, context: s.caption })),
    ]),
  ]
    .filter((e) => typeof e.text === 'string')
    .slice(0, 180);
  for (const block of entries) {
    for (const line of claimLines(block.text, block.context)) {
      if (checks.length >= 64) break;
      checkArithmetic(line, (c) => checks.push({ kind: 'arithmetic', ...c }));
      if (request.subject !== 'history') continue;
      dateChecks(line, (c) => checks.push(c));
    }
  }
  // Definitions are offered as a trusted reference, not treated as proof merely
  // because the model used the same keyword or cited a curriculum.
  if (request.subject === 'social') {
    const corpus = blocks.join('\n').toLocaleLowerCase('ru');
    try {
      const registry = require('../shared/civics-terms.json');
      for (const term of registry.terms || []) {
        if (!termMentioned(corpus, term)) continue;
        for (const source of registry.sources.filter((s) => term.sourceIds.includes(s.id)))
          if (references.length < 6)
            references.push({ title: term.term, text: term.formalDefinition, url: source.url });
      }
    } catch {
      /* An absent optional reference must never become false verification. */
    }
  }
  if (request.subject === 'chemistry')
    for (const step of result.scene?.steps || []) {
      // An unbalanced exercise or the first draft is pedagogically legitimate.
      // Check only a formula explicitly claimed to be balanced in its caption.
      if (claimedBalanced(step.caption)) {
        const c = reactionCheck(step.formula);
        if (c) checks.push(c);
      }
    }
  if (request.subject === 'chemistry')
    for (const block of [
      { text: result.text },
      { text: result.summary },
      ...learningEntries,
    ].filter((e) => typeof e.text === 'string')) {
      let balanceNext = claimedBalanced(block.context || '');
      for (const line of claimLines(block.text, block.context)) {
        const asserted = claimedBalanced(line);
        if (asserted || balanceNext) {
          const c = reactionCheck(line.replace(/^.*?:\s*/, ''));
          if (c) checks.push(c);
        }
        balanceNext = asserted && !/(?:→|->|\\rightarrow|\\longrightarrow)/u.test(line);
      }
    }
  const conflicts = checks.filter((c) => c.status === 'conflict');
  const verification = {
    version: 1,
    status: conflicts.length ? 'conflict' : checks.length ? 'scoped-checks' : 'no-claim-coverage',
    durationMs: Math.round((performance.now() - started) * 100) / 100,
    checks: checks.slice(0, 64),
    references,
    scope:
      'Проверяются явные числовые равенства, отдельные даты и баланс атомов в простых формулах, названных уравненными. Свободное объяснение, возможность реакции, единицы измерения и все факты целиком этой проверкой не подтверждаются.',
  };
  if (!conflicts.length) return { ...result, verification };
  const corrections = [...new Set(conflicts.map((c) => c.correction).filter(Boolean))].slice(0, 3);
  // The wrong answer/scene/summary/checkpoint never reaches the conversation,
  // writing sheet, learning memory or progress.
  return {
    text: `При сверке я обнаружил неточность в своём объяснении и убрал этот вариант.\n\n${corrections.join('\n\n')}\n\nДавай продолжим с этого уточнения: можно попросить объяснить шаг иначе или задать свой вопрос.`,
    phase: 'explain',
    verification,
  };
}
module.exports = { reviewAnswer, normalize, reactionCheck };
function reviewContext(request) {
  const query = `${request.instructions || ''}\n${request.messages?.at(-1)?.content || ''}`
    .toLocaleLowerCase('ru')
    .slice(0, 40000);
  const fragments = [];
  if (request.subject === 'history')
    for (const d of dates)
      if (new RegExp(d.stem, 'iu').test(query))
        fragments.push(`${d.name}: ${d.start}–${d.end} гг. Источник: ${d.url}`);
  if (request.subject === 'social')
    try {
      const registry = require('../shared/civics-terms.json');
      for (const term of registry.terms || [])
        if (termMentioned(query, term) && fragments.length < 4) {
          const sources = registry.sources.filter((s) => term.sourceIds.includes(s.id));
          if (sources.length)
            fragments.push(
              `${term.term}: ${term.formalDefinition}\nГраница понятия: ${term.boundary}\nИсточники: ${sources.map((s) => s.url).join(' · ')}`,
            );
        }
    } catch {
      /* No invented reference when the registry is unavailable. */
    }
  return (
    '\nПеред отправкой кратко сверь рассуждение, вычисления и данные рисунка между собой. Не называй свою внутреннюю проверку проверкой в интернете. Внешняя локальная сверка ограничена: она не подтверждает автоматически весь ответ. Не меняй фазу на завершение без основания.' +
    (fragments.length
      ? '\nОпорные сведения из локальной проверенной подборки (не ответы ученика):\n' +
        fragments.join('\n\n')
      : '')
  );
}
module.exports.reviewContext = reviewContext;
