export type ChemistryScenario = {
  id: number;
  title: string;
  equation?: string;
  atoms?: Record<string, number>;
  mass?: number;
  molarMass?: number;
  amount?: number;
  productMolarMass?: number;
  productMass?: number;
  solutionMass?: number;
  massFraction?: number;
  molarVolume?: number;
  volume?: number;
};
export function chemistryScenario(index: number): ChemistryScenario | undefined;
export function validChemistryValues(values: unknown): values is [number, number];
export function formulaAtomCounts(formula: unknown): Record<string, number> | null;
export function renderChemistryScene(values: unknown, progress?: number): string | null;
