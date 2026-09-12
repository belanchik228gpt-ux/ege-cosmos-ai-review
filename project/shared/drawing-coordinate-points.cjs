// Structural repair only. Coordinates come from explicit labels / validated
// supplied endpoints; this module never solves arbitrary model expressions.
const bound = 1e8;
function labelCoordinates(labels) {
  if (!Array.isArray(labels) || !labels.length || labels.length > 16) return;
  const result = [];
  for (const label of labels) {
    if (typeof label !== 'string' || label.length > 2000) return;
    const plain = label
      .normalize('NFKC')
      .replace(/\\[()[\]]|\$/g, '')
      .trim();
    const match = plain.match(/^([+\-−–]?\s*(?:\d+(?:[.,]\d+)?|[.,]\d+))(?=$|\s|[—–:;])/u);
    if (!match) return;
    const value = Number(match[1].replace(/[−–]/g, '-').replace(/\s/g, '').replace(',', '.'));
    // Do not reinterpret fractions, scientific notation or a partially parsed
    // arithmetic expression as a coordinate merely because it starts with one.
    const rest = plain.slice(match[0].length).trim();
    if (/^[+*/=^]|^-\s*\d/u.test(rest) || !Number.isFinite(value) || Math.abs(value) > bound)
      return;
    result.push(value);
  }
  return result;
}
function simpleAbsoluteEquation(formula) {
  if (typeof formula !== 'string' || formula.length > 1200) return;
  const plain = formula
    .replace(/\\(?:left|right)/g, '')
    .replace(/\\(?:lvert|rvert|vert)/g, '|')
    .replace(/\\[()[\]]|\$|\s/g, '')
    .replace(/[−–]/g, '-')
    .replace(/,/g, '.');
  const number = '(?:\\d+(?:\\.\\d+)?|\\.\\d+)';
  const match = plain.match(new RegExp(`^\\|x(?:([+-])(${number}))?\\|=([+-]?${number})$`));
  if (!match) return;
  const offset = match[2] ? (match[1] === '-' ? -1 : 1) * Number(match[2]) : 0;
  const right = Number(match[3]);
  if (
    !Number.isFinite(offset) ||
    !Number.isFinite(right) ||
    right < 0 ||
    Math.abs(offset) > bound ||
    Math.abs(right) > bound
  )
    return;
  return (x) =>
    Math.abs(Math.abs(x + offset) - right) <=
    Number.EPSILON * 8 * Math.max(1, Math.abs(x), Math.abs(offset), Math.abs(right));
}
function repairStep(drawing, step) {
  const labelled = labelCoordinates(step.labels);
  if (labelled && labelled.length > 2) return { ...step, values: labelled };
  const values = Array.isArray(step.values) ? step.values : [];
  const equation = simpleAbsoluteEquation(step.formula);
  const solution =
    values.length === 5 &&
    values[4] === 1 &&
    equation &&
    /решени|корн/iu.test(
      `${drawing.title || ''} ${step.caption || ''} ${(step.labels || []).join(' ')}`,
    );
  if (!solution) return;
  const candidates = labelled || values.slice(0, 2);
  const points = candidates.flatMap((value, index) => {
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      Math.abs(value) > bound ||
      !equation(value)
    )
      return [];
    const label = labelled
      ? step.labels[index]
      : `${value} — ${step.labels?.[index] || 'решение уравнения'}`;
    return [{ value, label }];
  });
  return { ...step, values: points.map((p) => p.value), labels: points.map((p) => p.label) };
}
function normalizeCoordinateDrawing(drawing) {
  if (
    !drawing ||
    drawing.figure !== 'interval' ||
    !Array.isArray(drawing.steps) ||
    drawing.steps.length > 8 ||
    drawing.steps.some((step) => !step || typeof step !== 'object' || Array.isArray(step))
  )
    return drawing;
  const repaired = drawing.steps.map((step) => step && repairStep(drawing, step));
  if (!repaired.some(Boolean)) return drawing;
  const { figure: _figure, ...plain } = drawing;
  return {
    ...plain,
    kind: 'number-line',
    steps: drawing.steps.map((step, index) => {
      if (repaired[index]) return repaired[index];
      const labelled = labelCoordinates(step.labels);
      if (labelled) return { ...step, values: labelled };
      // Interval flag slots must never become numeric coordinates after changing
      // the drawing kind. Other frames retain only their supplied endpoints.
      const values = (step.values || []).slice(0, 2);
      return {
        ...step,
        values,
        labels: values.map(
          (value, i) => `${value}${step.labels?.[i] ? ` — ${step.labels[i]}` : ''}`,
        ),
      };
    }),
  };
}
function numberLineMarkers(step) {
  const coordinates = labelCoordinates(step?.labels);
  if (
    !coordinates ||
    !Array.isArray(step.values) ||
    coordinates.length !== step.values.length ||
    !coordinates.every((n, i) => n === step.values[i])
  )
    return;
  return coordinates.map((value, index) => ({ value, label: step.labels[index] }));
}
module.exports = { normalizeCoordinateDrawing, labelCoordinates, numberLineMarkers };
