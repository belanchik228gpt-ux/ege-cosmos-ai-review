export interface DocumentDrawingStep {
  caption: string;
  formula: string;
  labels: string[];
  values: number[];
}
export interface DocumentDrawing {
  figure?: import('./subject-figures.mjs').SubjectFigure;
  kind: string;
  title: string;
  steps: DocumentDrawingStep[];
}
export interface DocumentDrawingPage {
  kind?: string;
  body?: string;
  title?: string;
  content?: string;
}
export function documentDrawings(input: unknown): DocumentDrawing[];
export function drawingPages(
  input: unknown,
  inline: (value: string) => string,
  paragraphs?: (value: string) => string,
  options?: { scale?: string },
): DocumentDrawingPage[];
export const drawingPrintCss: string;
