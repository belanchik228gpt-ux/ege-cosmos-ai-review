# Live spatial-plane diagrams

Added a bounded shared SVG figure for explanations about points, lines and planes. It is separate from the authored `lesson-lab` catalog.

## Backend contract

Use `kind: "concept"`, `figure: "spatial-plane"`. The existing geometry numeric sanitizer rejects zero values, so `kind: "geometry"` must not be used for this figure.

Every step has `values: [case, stage]`, both integers from 0 to 3. Optional `labels: ["α", "A", "B", "C", "a", "β"]` rename the first plane, three points, line and second plane. Names have at most four letters/digits/prime characters. The prefixes «плоскость », «точка », «прямая » are accepted. Invalid names revert to defaults, repeated point or plane names reset the name set. No HTML, SVG or coordinates are accepted.

| Case | Required geometric assumptions | Stages 0 → 3 |
| --- | --- | --- |
| 0 | a lies in α; A lies on a; B lies in α but not on a | Plane → line → A → B and membership symbols |
| 1 | A, B, C are distinct noncollinear points of α | Plane → points → three segments → full extended line AB |
| 2 | A, B, C are distinct collinear points on a, a lies in α | Plane → line → points → nonuniqueness of plane |
| 3 | Distinct planes α and β intersect along a | First plane → second plane → common line → full-line interpretation |

Select a case only when the student problem supplies its assumptions, or explicitly introduce a new illustrative example. Do not infer relationships from a photographed polygon edge. A parallelogram is a bounded depiction of an infinite plane. The figure cannot reconstruct arbitrary three-dimensional geometry or decide an unspecified noncollinearity condition.

## Verification

- Eight new tests plus 38 existing figure/lesson tests pass (46 total).
- `cleanDrawing` roundtrip explicitly preserves `[0,3]` with `kind: "concept"`.
- Shared player/export SVG identity, invalid codes, malicious/long names, duplicate names, progress clamping and static frames tested.
- TypeScript check passes.
- `scripts/spatial-plane-review.mjs` renders all 16 steps in Chromium; four additional maximum-length-label frames checked for bounds. Zero out-of-bounds text findings.
- All 16 frames visually reviewed through four contact sheets. The second plane was widened after visual review; its final frame was re-rendered and viewed separately.
- Evidence in `docs/verification/spatial-plane/report.json` and adjacent PNG files. This is Chromium renderer evidence, not packaged EXE or a live model call. Root owns backend prompt and native application verification.
