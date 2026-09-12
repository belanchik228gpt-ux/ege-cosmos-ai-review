export interface HistoryAtlasStage {
  title: string;
  date: string;
  caption: string;
  heading: string;
  explanation: string;
  highlight: string[];
}
export interface HistoryAtlasMap {
  index: number;
  id: string;
  title: string;
  period: string;
  bounds: [number, number, number, number];
  aliases: string[];
  geographyNote: string;
  places: Array<{
    id: string;
    label: string;
    coordinates: [number, number];
    offset: [number, number];
    anchor: string;
    faction?: string;
  }>;
  waterLabels: Array<{ text: string; coordinates: [number, number] }>;
  landLabels: Array<{ text: string; coordinates: [number, number] }>;
  participants: Array<{ label: string; color: string }>;
  routes: Array<{
    id: string;
    stage: number;
    color: string;
    label: string;
    points: [number, number][];
    kind: string;
  }>;
  stages: HistoryAtlasStage[];
  sources: Array<{ id: string; title: string; url: string; checkedAt: string }>;
  land: [number, number][][][];
  coastlines: [number, number][][];
  rivers: [number, number][][];
}
export const historyAtlas: {
  version: number;
  checkedAt: string;
  status: string;
  legend: string;
  geography: Record<string, string>;
  maps: HistoryAtlasMap[];
};
export function getHistoryAtlas(index: unknown): HistoryAtlasMap | undefined;
export function validHistoryAtlasValues(values: unknown): values is [number, number];
export function historyStageContent(values: unknown): { caption: string; labels: string[]; formula: string } | undefined;
export function historyAtlasProjection(
  map: HistoryAtlasMap,
): (point: [number, number]) => [number, number];
export function renderHistoryAtlas(values: unknown, progress?: number): string | null;
