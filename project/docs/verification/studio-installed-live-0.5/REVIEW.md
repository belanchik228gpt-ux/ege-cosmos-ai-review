# Installed Cosmos 0.5: actual OpenAI and document review

8 September 2026. This review applies to the installed application `C:\new cosmos\test-results\installed-app\EGE Cosmos.exe`, ASAR SHA-256 `d75fb7d4e00fae1ec67e8c4bb5261ed6da91f5f3b481b890ecfbcf744ca67cfe`.

## Method and results

- Actual NSIS installation completed before this run. The existing Cosmos sign-in was reused through the configured OpenAI runtime; credentials were never read, copied or injected. Learning data belongs to an isolated QA profile.
- Two actual GPT-6-Astra replies were received through the installed application. First visible text arrived after 12,325 ms and 13,099 ms; full validated replies after 47,835 ms and 47,659 ms. This is one measured session, not a performance guarantee.
- The first reply remembered the structured drawings saved in the preceding conversation. It explicitly did not assume the pupil had viewed them. A new number-line example used the point −5 and left its distance as a question. The text distinguished the training example from an official FIPI task.
- The official completion button requested and saved the second reply. Its summary distinguished an explanation restated in the pupil's own words from unanswered independent examples. It corrected the earlier candidate's erroneous claim that drawings were absent.
- Partial streamed text did not enter permanent learning state. Four screenshots were captured from real windows; no model-response or learning-state injection was used.
- After a real process restart, the conversation and authenticated account status were restored. This does not test multi-day token expiration or revocation.
- The script reported three groups PASS and no page errors. See `report.json` for exact prompts, times, limits and paths.

## Visual inspection

The root agent personally inspected `02-complete-explanation.png` and `06-installed-restart.png`. The wide conversation, current-topic column, stage bar, local mathematical rendering and saved-summary controls are readable. These screenshots are scrolled to the newest reply; they do not alone demonstrate every viewport or scroll position. The final native day and general UI suites cover the separate 1280×720 and narrow-screen checks.

The actual saved conversation was exported through the installed desktop bridge to `actual-chat-note.html` and `actual-chat-note.pdf`. The PDF is 86,014 bytes, six A4 landscape pages. All six pages were rendered with Poppler at 1500 px and personally inspected (`note-page-1.png` through `note-page-6.png`). Dark colors, column spacing, Russian glyphs and delimited mathematical formulas remain readable without observed clipping or overlaps.

This export retains the historical QA conversation, including the earlier candidate's statement about missing drawings on page 4 and its explicit correction on page 5. Historical messages were not rewritten. The latest summary at the beginning correctly states that drawing data is saved and viewing is unconfirmed.

## Remaining limitations

- Animated drawings are present in the application but are not yet embedded in this conversation export.
- Markdown links may remain readable literal Markdown in the PDF, and un-delimited mathematical shorthand in generated summary metadata remains plain text. The six-page export is not accepted as a completed illustrated lesson book.
- One printed image, a small sample of four-subject conversations on earlier candidates, and these two final responses do not establish correctness on every topic, handwriting recognition, or an exam-score guarantee.
- The lesson stage bar indicates conversation phase; independent mastery requires separate checked attempts.
