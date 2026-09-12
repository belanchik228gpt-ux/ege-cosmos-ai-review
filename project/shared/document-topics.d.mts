export interface AuthoredExample {
  title: string;
  problem: string;
  steps: string[];
  result: string;
}
export interface DocumentTopic {
  title: string;
  subject: string;
  symbol: string;
  explanation: string;
  definition: string;
  tip: string;
  formula: string;
  examples: AuthoredExample[];
}
export const documentTopics: Record<string, DocumentTopic>;
export function authoredTopicMarkdown(id: string): string;
export function topicIllustration(id: string): string;
