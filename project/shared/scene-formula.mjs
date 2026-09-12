/** Formula fields may contain either prose or TeX. Preserve existing delimiters and
 * prose, but render unmistakable TeX commands even in a scientific concept scene. */
export function sceneFormulaMarkdown(kind, value) {
  const formula = String(value || '');
  if (!formula || formula.length > 1200 || /\$\$|\$[^$\n]+\$|\\\(|\\\[/u.test(formula))
    return formula;
  const mathematical =
    ['algebra', 'geometry', 'function', 'number-line'].includes(kind) ||
    /\\[ ,;!:]/u.test(formula) ||
    /\\(?:frac|dfrac|tfrac|sqrt|text|mathrm|operatorname|quad|qquad|cdot|times|land|lor|neg|sum|prod|sin|cos|log|ln|Rightarrow|in|notin|subset|subseteq|supset|supseteq|alpha|beta|gamma|pi|le|ge|ne)\b/u.test(
      formula,
    );
  return mathematical ? `$$\n${formula}\n$$` : formula;
}
