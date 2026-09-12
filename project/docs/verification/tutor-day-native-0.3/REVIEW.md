# Native day and PDF review — final 0.3.0 build

Reviewed on 2026-09-08. This is evidence for the installed executable whose app.asar SHA-256 is `c85b403b4f0664e0d8cc21f9942690be03575200ebb7d6fbb57fa3120a12afc1` (30,969,652 bytes). The hash was asserted before launch. The earlier B4A6 review and all its artifacts were preserved separately in `test-results/tutor-day-native-b4a6-reviewed-archive`; they are not counted as final-build evidence.

## Checked through the real installed application

`scripts/tutor-day-native-review.mjs` completed 10/10 checks. It used a separate profile and an empty runtime directory. All learning actions originated in UI controls; the model was unavailable throughout and no model message or GPU inference was produced.

- A 10th-grade/basic-mathematics profile selected a 120-minute plan and added a school request about absolute values. Four study blocks and three breaks fit exactly in the selected budget: mathematics 30 minutes, Russian 25, social studies 25, history 25 and three five-minute breaks. The duplicate absolute-value lesson from the earlier build is no longer present.
- Starting the day displayed the current task and block progress. Pausing held measured activity at 5 seconds during a 5.6-second observation; resuming increased it to 10 seconds. Answer, hint and scene controls were disabled while paused.
- Four real attempts were stored: one incorrect, two correct with assistance and one correct independently. The next task displayed 3/8 tasks completed and five remaining. These are task counts, not topic mastery.
- Manual completion of the partly practised mathematics block advanced to a real five-minute break. The screen displayed one of four completed study blocks, three remaining and 90 minutes left in the plan. The mathematics topic remained in the `learning` state.
- Finishing early during that break reported one completed block and three unfinished blocks, one independent correct answer, two assisted correct answers, one error and 10 seconds of measured activity. No break was marked completed. The 30 planned minutes allocated to the completed block are explicitly distinguished from actual activity.
- The PDF button created a real file; restarting retained the report, four attempts and the same PDF hash. No page error occurred. The application closed normally.

## Personal image review

All 16 newly captured native PNG images were personally inspected: viewport and full-page images for plan, active task, pause, attempts, the break after the completed block, early report, exported report and restarted home. The viewport was 1280×720. Navigation, task progression, disabled pause controls, the break card, report figures, the multiline note and the export action were legible. No horizontal page overflow or clipped composer was visible.

The earlier Russian-message inner-scroll observation does not apply to image 05 in this run: image 05 now shows the scheduled break. This test ends early there and does not newly verify the Russian conversation or upward history scrolling. The compact layout uses normal page scrolling to reach the full scene and composer; the entire lesson is not claimed to fit above the fold at 720 pixels high.

The actual exported PDF was rendered with `scripts/render-export-review.py`. Both new pages were personally inspected. The dark landscape pages have readable contrast, intact Cyrillic and mathematical symbols, aligned columns and correct page numbers. No text overlaps, clipped source URL or missing rendered content were observed. Page 1 contains the same numerical outcome, the actual absolute-value error and the two-line note; page 2 preserves the mathematics source URL, source version/check date and the limitations of the material. The FIPI reference identifies the exam programme/format, and the document does not claim that every authored example is an official task. The second page has open space after the shorter source section; no content was invented to fill it. The PDF reports the count of three unfinished blocks; their individual titles are visible in the UI report rather than enumerated in this PDF text.

## Artifact

- Actual export: `C:\new cosmos\test-results\tutor-day-native-1788880779351\documents\all\2026-09-08\Итог занятия · 8 сентября-182001-19e8.pdf`
- Review copy: `early-study-report.pdf`
- Size: 52,247 bytes; 2 pages.
- SHA-256: `0a42553847aee89111254026dabd9a78184679268bb0f7960c80ebee21a7c650`.
- Rendered pages: `pdf-pages/page-01.png`, `pdf-pages/page-02.png`.
- Machine-readable data: `result.json`, `pdf-pages/render.json`.

## Scope limits

This is a short UI regression with a 120-minute budget, not a two-hour endurance session. It proves local structured learning, persistence and this PDF export on the recorded build. It does not test live tutor quality, photo recognition, every document format, every subject lesson or other display sizes. Unit tests, file presence and DOM text were supplemented by the actual native captures and personal review; none of them alone is treated as visual acceptance.
