import type { LearningStep } from '../domain/cloud-learning';
import { TutorMarkdown } from './TutorMarkdown';
import './learning-plan.css';
import { useEffect, useState } from 'react';

export function LearningPlan({ step }: { step: LearningStep }) {
  const index = step.plan.findIndex((item) => item.id === step.currentPlanId);
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [step.task, step.instruction]);
  return (
    <details
      className="learning-plan"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        <span className="learning-plan-label">
          ПЛАН РЕШЕНИЯ · ШАГ {index + 1} ИЗ {step.plan.length}
        </span>
        <div className="learning-plan-title">
          <TutorMarkdown text={step.plan[index].title} />
        </div>
        <span className="learning-plan-track" aria-label="Пункты плана">
          {step.plan.map((item) => (
            <i key={item.id} className={item.status} title={item.title} />
          ))}
        </span>
        <span className="learning-plan-expand">Условие и весь план</span>
      </summary>
      <div className="learning-plan-body">
        <div>
          <small>СЕЙЧАС РАЗБИРАЕМ</small>
          <TutorMarkdown text={step.task} />
          <small>ТВОЁ СЛЕДУЮЩЕЕ ДЕЙСТВИЕ</small>
          <TutorMarkdown text={step.instruction} />
          <small>ЗАЧЕМ ЭТО НУЖНО</small>
          <TutorMarkdown text={step.why} />
        </div>
        <div>
          <ol>
            {step.plan.map((item) => (
              <li className={item.status} key={item.id}>
                <span>{item.status === 'done' ? '✓' : item.status === 'current' ? '→' : '○'}</span>{' '}
                <TutorMarkdown text={item.title} />
              </li>
            ))}
          </ol>
          {step.recap.length > 0 && (
            <>
              <small>УЖЕ РАЗОБРАЛИ</small>
              <ul>
                {step.recap.map((text, i) => (
                  <li key={i}>
                    <TutorMarkdown text={text} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </details>
  );
}
