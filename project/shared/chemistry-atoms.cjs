/** Bounded atom counting for simple formulas; unsupported syntax is never "balanced". */
function formulaAtomCounts(formula) {
  if (typeof formula !== 'string' || !formula.trim() || formula.length > 80) return null;
  const normal = formula
    .replace(/[₀-₉]/g, (c) => String('₀₁₂₃₄₅₆₇₈₉'.indexOf(c)))
    .replace(/\s+/g, '');
  const match = normal.match(/^(\d{1,2})?((?:[A-Z][a-z]?\d{0,2})+)$/);
  if (!match || match[1]?.startsWith('0')) return null;
  const coefficient = Number(match[1] || 1),
    counts = {};
  if (coefficient < 1 || coefficient > 99) return null;
  const allowed = new Set([
    'H',
    'O',
    'C',
    'Ca',
    'Na',
    'Cl',
    'Mg',
    'N',
    'S',
    'Fe',
    'Cu',
    'Zn',
    'Al',
    'K',
    'P',
  ]);
  for (const [, element, subscript] of match[2].matchAll(/([A-Z][a-z]?)(\d*)/g)) {
    const amount = Number(subscript || 1);
    if (!allowed.has(element) || subscript.startsWith('0') || amount < 1 || amount > 99)
      return null;
    counts[element] = (counts[element] || 0) + coefficient * amount;
    if (counts[element] > 10000) return null;
  }
  return counts;
}
module.exports = { formulaAtomCounts };
