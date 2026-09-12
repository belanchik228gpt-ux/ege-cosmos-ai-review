# Installed EXE document acceptance — 0.5.1

**PASS within the two-document PDF acceptance scope.** Reviewed on 2026-09-09 after actual UI exports from the installed application. All **10 pages** were rendered with Poppler at 115 DPI and personally inspected. The short-table split defect is resolved, and the Russian document has the corrected topic title.

This acceptance applies to app.asar SHA-256 **`a4038d686288079442478a698195b0f84b1ef69e79887db27333f6640b91a01f`**. The hash of the actual installed `resources/app.asar` was read and matched during this review. A later build, including any subsequent fullscreen CSS build, is not silently covered by this report.

## Provenance and file integrity

`report.json` records actual UI editing, HTML and PDF exports, and process-restart restoration from an isolated QA learning profile. This review independently checked each PDF artifact against both its reported byte count/hash and its original exported file. Both are genuine `%PDF-` files with an EOF marker; no HTML was accepted under a PDF extension. The source PDFs were not regenerated or edited by this review.

| PDF | Pages | Bytes | SHA-256 |
| --- | ---: | ---: | --- |
| `math-lesson.pdf` | 6 | 407399 | `39b8f46fdf1b3fc2e13e34927ec8c7ea7c0f97f5c43626301fcc490ef934294c` |
| `russian-lesson.pdf` | 4 | 250253 | `b266d72d2e70aff4d7f8a4997a5cdad59ac3cc3a12be25c8c8f30174af5abf34` |

Both documents are landscape A4, approximately 841.92 × 594.96 points per page. The rendered page images, PDF metadata, extracted text, actual export paths, and integrity checks are stored in `pdf-review-metadata.json`, `math-pages/`, and `russian-pages/`. `render_review.py` is the repeatable read-only Poppler procedure. The original native report remains unchanged.

## Mathematics — all six pages inspected

| Page | Result |
| --- | --- |
| 1 | Both number-line frames are complete. The source values 1 and 8, time labels 9:00 and 15:00, captions, direction from 1 to 8, and the formula **8 − 1 = 7** are readable without clipping. The start point has no separate tick numeral 1, but the title and full values explicitly identify it; this minor labelling limitation is unchanged. |
| 2 | Both tariff-comparison frames are complete. **640 − 630 = 10** and **min(640, 630, 630) = 630** render as readable formulas, with complete explanations and labels. |
| 3 | The full temperature table occupies one intact grid. The times **6:00, 9:00, 12:00, 15:00, 18:00, 21:00** align directly above **−3, 1, 5, 8, 4, −1**. The row label “Температура, °C” is readable and no header/data split or raw Markdown separator remains. The surrounding prompt, hints, and student checking request are complete. |
| 4 | The complete tariff table stays together. **А: 180/100, Б: 210/0, В: 160/150** align under the hourly-rental and one-time-helmet headings. All headings are readable, including the wrapped helmet heading. The task and surrounding dialogue remain complete. |
| 5 | All three handwritten-work transcriptions and calculations are present: **180·3+100=640**, **210·3=630**, **160·3+150=630**, and the reverse check **630−150=480=160·3**. The final comparison and answer **630** are retained. No clipped mathematical glyphs or overlapping paragraphs were observed. |
| 6 | The complete assessment distinguishes prior hints from fully independent work, retains the next-practice recommendation, and includes the FIPI format/source URL, check date, and the explicit authored-material status. The final text continues into the right column without truncation. |

The four drawing frames, two intact data tables, complete model/student conversation, formulas, summary, and source text are retained. No new mathematical values were introduced by the exporter.

## Russian — all four pages inspected

| Page | Result |
| --- | --- |
| 1 | Two syntax frames are complete, with the sentence “Я знаю, что ты придёшь”, grammar-base labels, main/subordinate descriptions, and original punctuation. The corrected document title appears in the header. |
| 2 | The third syntax frame and full conjunction/comma explanation are readable. The corrected document title remains visible. The unused lower portion reflects the three actual source frames; no extra frame is invented. |
| 3 | The main heading is now **“Сложноподчинённое предложение: главная и придаточная части”**, matching the actual lesson. It fits without clipping or collision with the body. The complete dialogue and assessment remain readable. |
| 4 | The complete final review, explicit acknowledgement of earlier help, next-practice advice, FIPI source text, and EDSOO school-programme URL are retained. The corrected header title is preserved. |

The corrected title also matches the PDF metadata title. The previous inherited phonetics title is no longer the title of this exported sample. The syntax artwork uses sentence cards and explanations, rather than colour-marking each grammatical member; this is the renderer's current visual style, not lost content.

## Scope and remaining limits

- This is acceptance of these two actual installed-app exports, not a claim of complete exam or subject coverage, or of independent fact-checking for every possible model statement.
- The documents preserve the model's transcription and discussion of handwritten work. The original handwriting PNGs remain separate native QA artifacts; this review does not claim they are embedded in these PDFs.
- The local-library source entry in the Russian document has a name without a URL. It is not treated here as evidence of external retrieval.
- Earlier failed evidence and the old split-table PDF remain preserved in `../exam-series-live-0.5.1/PDF_REVIEW.md`. The separate source fix review remains in `../document-tables-source-0.5.1/REVIEW.md`; neither was substituted for this installed-file inspection.
- No source file, EXE, model, system cursor, or user learning profile was modified or launched for this review. Only PDF rendering and review artifacts were created.

No blocking PDF layout or content-preservation defect was found in the inspected documents. If the application is rebuilt, the replacement build must retain its own export provenance and file hashes; this ASAR-specific result is not automatically reassigned to it.
