export const DOCUMENT_MATH_LIMITS: Readonly<{
  expression: number;
  expressions: number;
  total: number;
}>;
export type DocumentMathToken =
  | { type: 'text'; raw: string }
  | { type: 'code'; raw: string; text: string }
  | { type: 'math'; raw: string; formula: string; display: boolean };
export function tokenizeDocumentMath(value: string): DocumentMathToken[];
export function withoutDocumentEmphasis(value: string): string;
export function createDocumentMathRenderer(): { inline(value: string): string; hasMath(): boolean };
export function chunkMathParagraph(value: string, limit?: number): string[];
