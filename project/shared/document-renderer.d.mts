export interface DocumentRenderInput {
  title: string;
  content: string;
  topicId?: string;
  documentType?: string;
  style?: 'cosmos' | 'paper';
  scale?: 'comfortable' | 'large';
  drawings?: unknown[];
}
export function escapeHtml(value: unknown): string;
export function renderDocument(input: DocumentRenderInput): string;
export function extractTeachingSpread(
  content: string,
  topicId?: string,
  scale?: string,
): {
  explanation: string;
  fields: Record<string, string>;
  examples: Array<{ title: string; text: string }>;
  remaining: string;
} | null;
export function paginateText(
  content: string,
  scale?: string,
): Array<Array<Array<{ type: string; text: string }>>>;
