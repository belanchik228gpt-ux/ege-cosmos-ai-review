import type { AnswerReview as Review } from '../domain/answer-review';
export function AnswerReview({ review }: { review?: Review }) {
  if (!review) return null;
  const matched = review.checks.filter((c) => c.status === 'matched').length;
  return (
    <details className="answer-review" data-review-status={review.status}>
      <summary>
        {review.status === 'conflict'
          ? 'Сверка: обнаружена неточность'
          : matched
            ? `Быстрая сверка · точных проверок: ${matched}`
            : 'Быстрая сверка · пределы проверки'}
      </summary>
      <p>{review.scope}</p>
      {review.status === 'no-claim-coverage' && (
        <p>
          В этом ответе нет утверждений, которые умеет подтвердить точная локальная проверка. Это
          объяснение нейросети.
        </p>
      )}
      {review.checks.slice(0, 8).map((c, i) => (
        <p key={i}>
          {c.status === 'conflict' ? c.correction : c.expression}
          {c.sourceUrl && (
            <>
              {' '}
              ·{' '}
              <a href={c.sourceUrl} target="_blank" rel="noreferrer">
                Источник даты
              </a>
            </>
          )}
        </p>
      ))}
      {review.references.length > 0 && <strong>Опорные определения для сравнения</strong>}
      {review.references.map((r) => (
        <p key={r.title + r.url}>
          <b>{r.title}:</b> {r.text}{' '}
          <a href={r.url} target="_blank" rel="noreferrer">
            Источник
          </a>
        </p>
      ))}
      <small>
        Локальная сверка: {review.durationMs < 1 ? 'менее 1' : Math.round(review.durationMs)} мс.
        Это время проверки, без ожидания ответа OpenAI.
      </small>
    </details>
  );
}
