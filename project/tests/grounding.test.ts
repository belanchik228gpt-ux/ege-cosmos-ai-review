import { describe, expect, it } from 'vitest';
import { topics, subjects } from '../src/domain';
import { sources } from '../src/domain/sources';
import {
  examReferenceReply,
  isExamReferenceQuery,
  prepareGrounding,
  reviewTutorResponse,
  reviewProblemExplanation,
} from '../src/domain/grounding';

describe('limited fraction-addition explanation checks for own problems', () => {
  const query = 'Почему нужен общий знаменатель? Текущее условие: 3/8 + 1/4.';
  it('blocks the exact self-review-approved mistake seen in installed photo QA', () => {
    const reply =
      'Потому что сложение дробей возможно только при одинаковых знаменателях. Общий знаменатель позволяет сравнить и сложить доли, разного размера.';
    expect(reviewProblemExplanation(query, reply)).toMatchObject({
      accepted: false,
      reason: 'fraction-addition-forbidden-with-different-denominators',
      scope: 'limited-rules',
    });
  });
  it('catches an absolute prohibition without banning the direct same-denominator algorithm', () => {
    for (const reply of [
      'Дроби с разными знаменателями складывать нельзя.',
      'Сложение дробей с разными знаменателями невозможно.',
      'Складывать можно только дроби с одинаковыми знаменателями.',
      'Сложить дроби можно только с равными знаменателями.',
    ])
      expect(reviewProblemExplanation(query, reply).accepted, reply).toBe(false);
    for (const reply of [
      'Сразу складывать дроби по правилу для одинаковых знаменателей нельзя без приведения к общему знаменателю.',
      'При одинаковых знаменателях складываем числители, а знаменатель оставляем.',
      'Дроби с разными знаменателями можно сложить: сначала перепишем их с общим знаменателем.',
      'Сложение дробей возможно не только при одинаковых знаменателях: сначала приведём их к общему.',
    ])
      expect(reviewProblemExplanation(query, reply).accepted, reply).toBe(true);
  });
  it('rejects claiming unequal unit portions after conversion, including the observed stray comma', () => {
    for (const reply of [
      'Общий знаменатель позволяет сравнить и сложить доли, разного размера.',
      'После приведения к общему знаменателю складываем доли разного размера.',
      'Общий знаменатель делает части неодинаковыми по величине.',
      'Привели дроби к общему знаменателю. Теперь складываем неодинаковые доли.',
    ])
      expect(reviewProblemExplanation(query, reply), reply).toMatchObject({
        accepted: false,
        reason: 'fraction-common-denominator-unequal-parts',
      });
  });
  it('allows initially unequal portions and correctly qualified contrasts', () => {
    for (const reply of [
      'Чтобы сложить доли разного размера, приведём их к общему знаменателю.',
      'Общий знаменатель позволяет привести доли разного размера к одинаковым долям.',
      'В исходных дробях доли разного размера. Общий знаменатель задаёт одинаковый размер долей.',
      'Общий знаменатель нужен, чтобы доли были не разного размера, а одинакового.',
      'Общий знаменатель задаёт равные доли. Теперь складываем количество этих долей.',
      'После приведения к общему знаменателю числители могут оставаться разными.',
      'Привели дроби к общему знаменателю. В другом примере доли разного размера.',
    ])
      expect(reviewProblemExplanation(query, reply).accepted, reply).toBe(true);
  });
  it('does not treat explicitly refuted quotations as asserted facts', () => {
    for (const reply of [
      '«Сложение дробей возможно только при одинаковых знаменателях» — неверно. Можно сначала привести их к общему знаменателю.',
      'Неверно говорить, что дроби с разными знаменателями нельзя складывать.',
      'Нельзя утверждать: «Сложение дробей с разными знаменателями невозможно».',
      '«Общий знаменатель позволяет сложить доли разного размера» — это ошибка. После приведения размер долей одинаковый.',
      'Общий знаменатель не означает, что доли разного размера.',
    ])
      expect(reviewProblemExplanation(query, reply).accepted, reply).toBe(true);
  });
  it('keeps the rule scoped to fraction addition and does not claim to verify other facts', () => {
    const reply = 'Сложение дробей возможно только при одинаковых знаменателях.';
    expect(reviewProblemExplanation('Площадь прямоугольника 7 на 4', reply).accepted).toBe(true);
    expect(reviewProblemExplanation('Вычисли 3/8 × 1/4', reply).accepted).toBe(true);
    expect(reviewProblemExplanation('Объясни сложение дробей', reply).accepted).toBe(false);
    expect(reviewProblemExplanation('Вычисли ⅜ + ¼', reply).accepted).toBe(false);
    expect(reviewProblemExplanation(query, 'Произвольное утверждение.')).toEqual({
      accepted: true,
      reason: null,
      scope: 'limited-rules',
    });
  });
});

describe('grounded local references', () => {
  it('rejects an asserted shift under the actual own-price task even when the reply omits price', () => {
    for (const taskId of ['demand-1', 'demand-3']) {
      const task = topics
        .find((topic) => topic.id === 'social-demand')!
        .tasks.find((task) => task.id === taskId)!;
      const query = `Почему?\nТекущее условие: «${task.prompt}»`;
      for (const reply of [
        'Спрос не уменьшается, а сдвигается.',
        'Кривая спроса сдвигается влево.',
        'Спрос сместится влево.',
        'Кривая будет сдвигаться вправо.',
        'Происходит сдвиг кривой спроса.',
        'Спрос не падает, но кривая сдвинулась.',
        'Повышение цены приводит к сдвигу кривой спроса.',
      ]) {
        const checked = reviewTutorResponse('social', 'social-demand', query, reply);
        expect(checked.accepted, `${taskId}: ${reply}`).toBe(false);
        expect(checked.reason).toBe('own-price-demand-quantity-confusion');
      }
    }
  });
  it('allows denial of shifts and distinct non-price examples within an own-price lesson', () => {
    const task = topics.find((topic) => topic.id === 'social-demand')!.tasks[0];
    const query = `Объясни.\nТекущее условие: «${task.prompt}»`;
    for (const reply of [
      'Кривая спроса не сдвигается. Меняется величина спроса.',
      'Спрос не будет сдвигаться: движется точка по кривой.',
      'Сдвиг кривой спроса не происходит.',
      'Сдвига кривой спроса не будет.',
      'Сдвиг кривой отсутствует.',
      'Происходит не сдвиг спроса, а движение по кривой.',
      'Это движение по кривой спроса, а не её сдвиг.',
      'Неверно говорить, что кривая спроса сдвигается от цены самого товара.',
      'При росте доходов кривая спроса на нормальный товар сдвигается вправо.',
      'При изменении цены товара-заменителя кривая спроса может сдвигаться.',
      'Кривая не сдвигается от цены самого товара, а при росте доходов спрос на нормальный товар увеличивается.',
      'Сдвигается ли кривая спроса?',
    ])
      expect(reviewTutorResponse('social', 'social-demand', query, reply).accepted, reply).toBe(
        true,
      );
    expect(
      reviewTutorResponse(
        'social',
        'social-demand',
        'Как действует рост доходов?',
        'Кривая спроса сдвигается вправо.',
      ).accepted,
    ).toBe(true);
  });
  it('blocks the observed own-price demand confusion even in a teacher question', () => {
    for (const text of [
      'Почему при повышении цены спрос на товар обычно уменьшается?',
      'Цена растёт, и спрос падает.',
      'Почему при повышении цены спрос сокращается?',
      'При повышении цены спрос уменьшится.',
      'При снижении цены спрос становится больше.',
    ]) {
      const result = reviewTutorResponse(
        'social',
        'social-demand',
        'Почему покупают меньше?',
        text,
      );
      expect(result.accepted, text).toBe(false);
      expect(result.reason).toBe('own-price-demand-quantity-confusion');
      expect(result.replacementText).toContain('При прочих равных');
      expect(result.replacementText).toContain('величину спроса');
      expect(result.knowledgeIds.length).toBeGreaterThan(0);
    }
  });
  it('keeps quantity, non-price shifts, related goods and explicit corrections outside that narrow rule', () => {
    for (const text of [
      'При повышении цены величина спроса обычно уменьшается.',
      'При росте доходов спрос на нормальный товар увеличивается.',
      'При повышении цены товара-заменителя спрос на данный товар увеличивается.',
      'Неверно говорить: при повышении цены спрос уменьшается.',
    ])
      expect(
        reviewTutorResponse('social', 'social-demand', 'Объясни различие.', text).accepted,
        text,
      ).toBe(true);
  });
  it('routes official exam questions while keeping ordinary mathematics in the lesson', () => {
    for (const query of [
      'Где ФИПИ?',
      'Покажи КИМ 2027',
      'Сколько заданий в ЕГЭ по математике?',
      'Какие критерии оценивания сочинения?',
      'Официальные задания для тренировки',
    ])
      expect(isExamReferenceQuery(query), query).toBe(true);
    for (const query of [
      'Таким способом можно решить?',
      'Объясни критерии равенства треугольников',
      'Сколько клеток в прямоугольнике?',
    ])
      expect(isExamReferenceQuery(query), query).toBe(false);
  });
  it('attaches only registered FIPI references appropriate to the current subject', () => {
    expect(sources.some((source) => source.status === 'official-reference' && new URL(source.url).hostname === 'edsoo.ru')).toBe(true);
    for (const subject of subjects) {
      const reply = examReferenceReply(subject.id);
      expect(reply.sourceIds.length).toBeGreaterThan(0);
      expect(reply.text).toContain('проекты');
      for (const id of reply.sourceIds) {
        const source = sources.find((s) => s.id === id)!;
        expect(source.status).toBe('official-reference');
        expect(source.subjects).toContain(subject.id);
        expect(new URL(source.url).hostname).toMatch(/(^|\.)fipi\.ru$/);
      }
    }
  });
  it('limits context size and keeps knowledge from other subject rooms out', () => {
    for (const topic of topics) {
      const bundle = prepareGrounding(topic.subject, topic.title, topic);
      expect(bundle.cards.length).toBeGreaterThan(0);
      expect(bundle.cards.length).toBeLessThanOrEqual(1);
      expect(bundle.cards.every((card) => card.subject === topic.subject)).toBe(true);
      expect(bundle.context.length).toBeLessThanOrEqual(1700);
      expect(
        bundle.sourceIds.every((id) =>
          sources.some((s) => s.id === id && s.subjects.includes(topic.subject)),
        ),
      ).toBe(true);
    }
  });
  it('grounds the actual lesson questions in one pertinent card without filling a second slot', () => {
    const cases = [
      [
        'math-rectangle',
        'У прямоугольника стороны 7 и 3. Я сложил их и получил площадь 10. В чём ошибка? Дай одну подсказку и короткий вопрос.',
        'knowledge-math-area',
      ],
      [
        'math-rectangle',
        'Не знаю, почему единицы площади квадратные. Начни с одного простого шага.',
        'knowledge-math-area',
      ],
      [
        'russian-commas',
        'В предложении «Когда наступила весна, птицы вернулись» где грамматические основы? Помоги найти одну.',
        'knowledge-russian-commas',
      ],
      [
        'russian-commas',
        'Не знаю, зачем нужна запятая между этими частями. Объясни один шаг и задай короткий вопрос.',
        'knowledge-russian-commas',
      ],
      [
        'history-baptism',
        'Почему князь Владимир принял христианство? Назови одну причину и задай короткий вопрос.',
        'knowledge-history-baptism',
      ],
      [
        'history-baptism',
        'Я не помню дату Крещения Руси. Дай маленькую подсказку, не называя дату целиком.',
        'knowledge-history-baptism',
      ],
      [
        'social-demand',
        'Почему при повышении цены покупатели обычно покупают меньше товара? Объясни на одном простом примере.',
        'knowledge-social-demand',
      ],
      [
        'social-demand',
        'Я думаю, что спрос и величина спроса — одно и то же. Помоги найти различие и задай один вопрос.',
        'knowledge-social-demand',
      ],
    ];
    for (const [id, query, expected] of cases) {
      const topic = topics.find((candidate) => candidate.id === id)!;
      const result = prepareGrounding(topic.subject, query!, topic);
      expect(result.knowledgeIds, query).toEqual([expected]);
      expect(result.context).not.toContain('Версаль');
    }
  });
  it('follows an explicit new topic and falls back to the current topic only without a match', () => {
    const topic = topics.find((candidate) => candidate.id === 'math-rectangle')!;
    expect(
      prepareGrounding('math', 'Объясни дискриминант квадратного уравнения', topic).knowledgeIds,
    ).toEqual(['knowledge-math-quadratic']);
    expect(prepareGrounding('math', 'квантовая хромодинамика', topic).knowledgeIds).toEqual([
      'knowledge-math-area',
    ]);
  });
});

describe('limited tutor contradiction checks', () => {
  const dateHint = 'Я не помню дату Крещения Руси. Дай подсказку, не называя год целиком.';
  it('rejects wrong baptism centuries written in several natural forms without revealing the date', () => {
    const responses = [
      'Крещение Руси произошло в начале XI века.',
      'Крещение Руси относится к 11-му веку.',
      'Крещение Руси — событие одиннадцатого столетия.',
      'Крещение Руси состоялось в начале Ⅺ века.',
      'Принятие христианства на Руси произошло в IX веке.',
      'Это начало XI века. Попробуй вспомнить год.',
      'Подсказка — одиннадцатый век.',
      'Крещение произошло в 11 веке.',
      '988 год относится к XI веку.',
      'Крещение Руси — начало XI в.',
      'Начало XI века. Назовёшь год?',
      'XI век.',
    ];
    for (const response of responses) {
      const review = reviewTutorResponse('history', 'history-baptism', dateHint, response);
      expect(review.accepted, response).toBe(false);
      expect(review.reason).toBe('baptism-century-contradiction');
      expect(review.replacementText).toContain('конец X века');
      expect(review.replacementText).not.toContain('988');
      expect(review.knowledgeIds).toEqual(['knowledge-history-baptism']);
      expect(
        review.sourceIds.some((id) =>
          sources.some((source) => source.id === id && source.role === 'fact'),
        ),
      ).toBe(true);
    }
  });
  it('rejects wrong reform centuries but uses the XIX-century hint only when a hint was requested', () => {
    for (const response of [
      'Отмена крепостного права произошла в XVIII веке.',
      'Крестьянская реформа — событие 18-го века.',
      'Реформа 1861 года произошла в двадцатом веке.',
      'Это восемнадцатый век.',
    ]) {
      const review = reviewTutorResponse(
        'history',
        'history-reform',
        'Не помню дату реформы',
        response,
      );
      expect(review.accepted, response).toBe(false);
      expect(review.replacementText).toContain('XIX век');
      expect(review.replacementText).not.toContain('1861');
    }
    const full = reviewTutorResponse(
      'history',
      'history-reform',
      'К какому веку относится отмена крепостного права?',
      'Отмена крепостного права — XVIII век.',
    );
    expect(full.replacementText).toContain('1861');
  });
  it('allows correct dates, explicit corrections and other historical events in the same room', () => {
    const cases = [
      [dateHint, 'Вспомни конец X века, незадолго до 1000 года.'],
      [dateHint, 'Крещение Руси произошло в 988 году, в X веке.'],
      [dateHint, 'Крещение Руси произошло не в XI веке, а в X.'],
      [dateHint, 'Ошибочно относить Крещение Руси к XI веку. Это конец X века.'],
      [dateHint, 'Крещение Руси — XI век — неверно. Правильно: X век.'],
      [dateHint, 'Крещение Руси — конец X века, а Пётр I жил и в XVIII веке.'],
      [dateHint, 'Пётр I жил в XVIII веке, а Крещение Руси произошло в X веке.'],
      ['В каком веке шла Северная война при Петре?', 'Это XVIII век.'],
      ['Когда крестилась Норвегия?', 'Крещение Норвегии происходило и в XI веке.'],
      ['В каком веке была Французская революция?', 'Это конец XVIII века.'],
      ['В каком веке жил Владимир Мономах?', 'Это XI век.'],
      ['В каком веке произошло Крещение Норвегии?', 'Это XI век.'],
      ['После Крещения Руси в каком веке началась Северная война?', 'Это XVIII век.'],
    ];
    for (const [query, response] of cases) {
      const review = reviewTutorResponse('history', 'history-baptism', query!, response!);
      expect(review.accepted, `${query}: ${response}`).toBe(true);
      expect(review.replacementText).toBeNull();
      expect(review.sourceIds).toEqual([]);
      expect(review.scope).toBe('limited-rules');
    }
    expect(
      reviewTutorResponse(
        'history',
        'history-reform',
        'Когда прошла реформа?',
        'Отмена крепостного права в России — 1861 год, XIX век.',
      ).accepted,
    ).toBe(true);
  });
  it('rejects reversal of the initial subordinate clause boundary in the known example', () => {
    const query = 'Не знаю, зачем нужна запятая между этими частями.';
    for (const response of [
      'Запятая между частями предложения показывает, где начинается придаточная часть.',
      'Запятая обозначает начало придаточной части.',
      'Здесь придаточная часть начинается после запятой.',
      'После запятой стоит придаточная часть.',
      'В нашем предложении запятая открывает придаточную часть.',
    ]) {
      const review = reviewTutorResponse('russian', 'russian-commas', query, response);
      expect(review.accepted, response).toBe(false);
      expect(review.replacementText).toContain('Запятая закрывает эту часть');
      expect(review.knowledgeIds).toEqual(['knowledge-russian-commas']);
    }
    expect(
      reviewTutorResponse(
        'russian',
        'russian-syntax',
        'В предложении «Когда наступила весна, птицы вернулись» где запятая?',
        'Запятая обозначает начало придаточной части.',
      ).knowledgeIds,
    ).toEqual(['knowledge-russian-commas']);
  });
  it('allows correct clause explanations, conditional comparison and a different explicit example', () => {
    for (const response of [
      'Запятая отделяет первую придаточную часть от главной.',
      'Запятая показывает начало главной части, а придаточная часть стоит первой.',
      'Запятая не показывает начало придаточной части. Она завершает её.',
      'Если придаточная часть стоит после главной, запятая показывает, где начинается придаточная часть.',
    ])
      expect(
        reviewTutorResponse('russian', 'russian-commas', 'Зачем нужна запятая?', response).accepted,
        response,
      ).toBe(true);
    expect(
      reviewTutorResponse(
        'russian',
        'russian-commas',
        'В предложении «Птицы вернулись, когда наступила весна» зачем запятая?',
        'После запятой начинается придаточная часть.',
      ).accepted,
    ).toBe(true);
    expect(
      reviewTutorResponse(
        'math',
        'math-rectangle',
        'Зачем запятая?',
        'Запятая показывает начало придаточной.',
      ).accepted,
    ).toBe(true);
    // Passing means only these scoped rules did not match, not that unknown claims are verified.
    expect(
      reviewTutorResponse(
        'history',
        'history-baptism',
        'Расскажи о князе',
        'Неизвестный исторический факт.',
      ).accepted,
    ).toBe(true);
  });
});
