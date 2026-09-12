import { cleanLearningStep, type CloudMessage, type LearningStep } from './cloud-learning';

export function currentLearningPosition(messages: CloudMessage[]) {
  for (const message of [...messages].reverse()) {
    if (message.role !== 'assistant' || message.verification?.status === 'conflict') continue;
    const step = cleanLearningStep(message.learningStep);
    if (step) return { messageId: message.id, step };
  }
}

export function stepSheetKey(lessonId: string, step: LearningStep) {
  // A clarification of the same action keeps its ink; a different task gets its own sheet.
  const source = [step.currentPlanId, step.task, step.instruction]
    .join('\n')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();
  let hash = 2166136261;
  for (const c of source) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  return `${lessonId}:step:${(hash >>> 0).toString(36)}`;
}

export function learningSheets(lessonId: string, messages: CloudMessage[]) {
  const sheets = new Map<string, { id: string; title: string; text: string }>();
  for (const message of messages) {
    if (message.role !== 'assistant' || message.verification?.status === 'conflict') continue;
    const step = cleanLearningStep(message.learningStep);
    if (step) {
      const id = stepSheetKey(lessonId, step);
      sheets.delete(id);
      sheets.set(id, {
        id,
        title: step.stage,
        text: `${step.task}\n\nСейчас: ${step.instruction}`,
      });
    }
  }
  return [...sheets.values()];
}
