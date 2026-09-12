export function normalizeCoordinateDrawing<T>(drawing: T): T;
export function labelCoordinates(labels: unknown): number[] | undefined;
export function numberLineMarkers(step: {
  values?: number[];
  labels?: string[];
}): Array<{ value: number; label: string }> | undefined;
