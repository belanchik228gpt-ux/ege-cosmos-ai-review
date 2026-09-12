# Markdown table fix — source PDF review

2026-09-09. **PASS for the bounded source renderer check. Final installed EXE export remains a separate acceptance step.**

The preceding native exports exposed a real defect: the temperature table's header and values split across columns as raw Markdown. That evidence is preserved, including its FAIL, in `../exam-series-live-0.5.1/PDF_REVIEW.md` and the byte-identical `*-actual.pdf` files. None of those previous PDFs or their extracted content were replaced by this fix.

## Implemented

Only `shared/document-renderer.mjs` was changed in the product. Markdown tables now render as semantic HTML tables with a shaded header, cell borders, aligned columns, and complete rows. The header and rows are a single pagination unit when the table fits a column. Longer tables split into complete row groups, each carrying the original header. A descriptive first column can be wider so that the temperature label remains readable.

The parser protects escaped `\|`, TeX expressions such as `$|x|=3$`, and code spans containing pipes. All cell text uses the existing escaped text / bounded, non-trusting KaTeX renderer. Raw HTML, script markup, event attributes, and executable TeX links remain inert. Malformed rows stay in the document as ordinary text; their values are not silently shifted into different columns. A table row too large for a readable column, or a table wider than ten columns, becomes a vertical record with the original column names and every value/formula retained. This is an explicit readability fallback, not a claim that arbitrary huge grids fit on one page.

## Verification performed

- `node node_modules/vitest/vitest.mjs run tests/document-tables.test.ts tests/document-renderer.test.ts tests/document-math.test.ts tests/document-scenes.test.ts` — **48 tests passed in 4 files**, including 9 new table checks. The table cases cover both text scales, real temperature/tariff values, 55-row repeated headers, escaped pipes, module bars in TeX, fractions, malicious text, malformed rows, very long cell content, and fenced examples.
- `node node_modules/typescript/bin/tsc --noEmit` — passed after final formatting.
- `git diff --check` for the changed renderer, new test, and QA script — passed.
- `node scripts/document-tables-review.mjs` — shared source renderer → headless Chromium PDF → Poppler PNG. It reads only `learning-state.v1.json` from the isolated `test-results/exam-series-live-1788903437246` profile. No Cosmos EXE, model, credentials, or user learning profile was opened or changed.
- The same saved mathematics and Russian document content and drawings were supplied without rewriting model text. `report.json` records their content SHA-256, source learning file SHA-256, and exact renderer source hashes.
- All **20 final page PNGs** were personally inspected. Geometry checks found no footer collision, clipped table cell, horizontal overflow, or missing tail. Text extraction was a secondary check and did not replace visual review.

## Every output and page

| Output | Pages | Personal review |
| --- | ---: | --- |
| `math-series.pdf` | 6 | Pages 1–2 retain all four diagram frames and mathematical formulas. Page 3 now has the entire temperature grid in the right column: all six times are directly above their six values, with the row label readable. Page 4 contains the complete tariff grid with A/Б/В and 180/100, 210/0, 160/150. Pages 5–6 retain all checks, final summary, honest assessment of prior hints, recommendations, and source text. No raw table separators remain. |
| `russian-lesson.pdf` | 4 | Pages 1–2 retain all three syntax cards and full captions. Pages 3–4 retain the whole dialogue, assessment, and source text without new layout changes or clipping. The inherited phonetics title still does not match the syntax conversation; source data was deliberately left unchanged. Root is separately checking title editing and re-export through the app. |
| `math-series-large.pdf` | 7 | Pages 1–2 preserve all frames. Page 3 has the temperature grid at large size; values remain under the correct times and the temperature label wraps only before the unit. Page 4 preserves the first check and second prompt. Page 5 has all three tariff rows together, followed by the task and complete calculations. Pages 6–7 preserve the final review, hints distinction, recommendations, and source text. |
| `long-table-large-fixture.pdf` | 3 | Authored layout fixture, not student work. Page 1 contains rows 1–10 with a header. Page 2 repeats that header above rows 11–20 and again above rows 21–25; every value occurs exactly once. The separate formula table displays the fraction 6/24 = 1/4 and the module expression without splitting their cells. Page 3 retains the explicit end marker. The conservative pagination leaves substantial unused space on pages 1 and 3; this is a known spacing limitation, not lost data. |

The repeated headers make the table intelligible when continued in the next column or on a later page. The previous defect of separating a short table's header from its only data row is resolved in both comfortable and large source exports.

## File identity

Product source SHA-256:

- `shared/document-renderer.mjs`: `a8e57ac8c8866bc27c4f2412705603ad011c3e439fcdf0defe837e7e8c159ff7`
- `shared/document-scenes.mjs` (unchanged): `dc82fef9c7a67ee1fdaf5a99128b9a67d71190c306cc05e8d94e148f8ee89232`

| PDF | Bytes | SHA-256 |
| --- | ---: | --- |
| `math-series.pdf` | 407514 | `06d5ddc6f9a06aa45659ccae80daf6a0dfdc45018eb9fc47eaed2f1e227228cb` |
| `russian-lesson.pdf` | 250464 | `cabb40585dd736d385623bae1be6a4e6640626bfe3372500c6470cb5ca3fe1d0` |
| `math-series-large.pdf` | 410215 | `cc644859c5521bbf06c84c74bfe115da8c0c722199a316d1d873e602e66035f2` |
| `long-table-large-fixture.pdf` | 61581 | `c340be19b1c1aa6874562a7b7ea78547cba4756f28212850a2c019234864b87d` |

The source renderer is frozen. Final acceptance must export the saved mathematics and renamed Russian document through the newly installed application, wait for the real `.pdf` path, validate its `%PDF-` signature, record its build/file hashes, and inspect the resulting pages. This report does not apply a native PASS in advance.
