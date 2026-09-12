# Final installed build — PDF acceptance by exact comparison

**PASS: final file identity verified, both HTML files byte-identical, and all 10 PDF pages pixel-identical and text-identical to the previously personally inspected exports.** No differing page required an additional visual inspection.

Reviewed on 2026-09-09. This report belongs to the final installed app.asar SHA-256:

`c6b16a9d970c941e507f04eb57ca05b49476ca7b1b403235da498d708e21ce0c`

The actual installed `resources/app.asar` was independently hashed and matched this value. The original `report.json` records a fresh UI export of both HTML/PDF documents, followed by a real process restart and restoration. This review did not launch the EXE, any model, or mouse automation; it read the reported exported files and produced comparison artifacts only.

## Independent integrity checks

For all four artifacts, the actual byte count and SHA-256 match the new native report. Each artifact is byte-identical to its actual original export path recorded in that report. Both PDF files have a `%PDF-` signature and EOF marker, so a stale HTML export path was not accepted as a PDF.

| Subject / format | Bytes | New SHA-256 |
| --- | ---: | --- |
| Mathematics HTML | 414181 | `9e5d6fa683881e13749fe67b9b9dd5d5117ce13be7d872001a09201a00141a9b` |
| Mathematics PDF | 407399 | `a0c81344b562446d7008f2ad12a8b9ec43fd7f5512269708ab7d8633daf3a493` |
| Russian HTML | 17742 | `7ff6bdd75a3483fe3dea557d694e308ffc40c8c46ac95171b0361ce379f6218a` |
| Russian PDF | 250253 | `039b764251aac6ed3ecb4b1ee6cb91f1a466cb08557121022fd1c48f632fc8ae` |

The PDF byte hashes differ from the earlier exports. The metadata comparison identifies changed creation/modification timestamps. No claim of identical PDF bytes is made: visual identity and text identity were checked independently, page by page.

## Exact comparison with the personally inspected baseline

The baseline is `../installed-documents-0.5.1/PDF_REVIEW.md`, with its separately recorded ASAR `a4038d686288079442478a698195b0f84b1ef69e79887db27333f6640b91a01f`. All six mathematics pages and all four Russian pages from that baseline had already been personally viewed and accepted. The baseline PDF hashes were rechecked before comparison. Its report and files were not overwritten.

The new PDFs were freshly rendered with Poppler at **115 DPI**, using the same settings as the baseline. Each new PNG was decoded to RGB and compared with the corresponding baseline PNG: equal dimensions, zero differing pixels, and no difference bounding box. pypdf extraction also confirmed **exact text equality on each page**, with no whitespace normalization used to hide a difference. Both HTML files are byte-for-byte equal to their baseline files.

| Document | Page | Pixel equality | Extracted text equality | Previously inspected content retained |
| --- | ---: | --- | --- | --- |
| Mathematics | 1 | Exact | Exact | Two number-line frames, temperatures 1 and 8, formula 8 − 1 = 7 |
| Mathematics | 2 | Exact | Exact | Two tariff-comparison frames and mathematical formulas |
| Mathematics | 3 | Exact | Exact | Complete temperature grid: six times directly above −3, 1, 5, 8, 4, −1 |
| Mathematics | 4 | Exact | Exact | Complete tariff grid: А 180/100, Б 210/0, В 160/150 |
| Mathematics | 5 | Exact | Exact | Complete calculations, checks, and the final comparison |
| Mathematics | 6 | Exact | Exact | Honest hints assessment, practice recommendation, sources and authored-material status |
| Russian | 1 | Exact | Exact | First two syntax frames and corrected document header |
| Russian | 2 | Exact | Exact | Third syntax frame, full explanation and labels |
| Russian | 3 | Exact | Exact | Corrected full title, complete dialogue and assessment |
| Russian | 4 | Exact | Exact | Complete summary, next steps and source text |

The Russian PDF title also exactly matches the new export title: **“Сложноподчинённое предложение: главная и придаточная части”**. The full title and its rendered placement are identical to the accepted renamed sample.

## Stored evidence and boundaries

- `pdf-review-metadata.json` records the new and baseline build hashes, actual export paths, byte/hash checks, metadata differences, per-page text hashes, per-page PNG hashes, image dimensions, and pixel/text comparisons.
- `math-pages/` and `russian-pages/` contain all **10 newly rendered PNGs**, PDF information, and extracted text.
- `compare_review.py` reproduces the file-only comparison; it never recreates or changes the source PDF bytes.
- The final CSS-build export is accepted through new provenance plus exact visual/text comparison, rather than by assigning the old ASAR report to a new build.
- The acceptance remains bounded to these two actual lessons and documents. It does not establish full course coverage, general model correctness, or preservation of original handwritten PNGs inside PDFs. Those handwriting artifacts remain separate from these exports.

No new PDF content or layout defect was found. The previously corrected tables, formulas, seven source drawing frames, full text, and Russian title are demonstrably unchanged in the final installed-build exports.
