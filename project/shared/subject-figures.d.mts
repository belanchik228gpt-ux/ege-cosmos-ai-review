export type SubjectFigure =
  | 'right-triangle'
  | 'circuit'
  | 'wave'
  | 'particles'
  | 'food-chain'
  | 'earth-layers'
  | 'timeline'
  | 'cycle'
  | 'tree'
  | 'interval'
  | 'history-map'
  | 'chemistry-reaction'
  | 'lesson-lab'
  | 'spatial-plane';
export const subjectFigures: readonly SubjectFigure[];
export function cleanFigure(value: unknown): SubjectFigure | undefined;
export function drawingGraphBounds(drawing: { steps: Array<{ values?: number[] }> }): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};
export function renderSubjectFigure(
  drawing: {
    figure?: string;
    title?: string;
    steps?: Array<{ values?: number[]; labels?: string[] }>;
  },
  index?: number,
  progress?: number,
): string | null;
