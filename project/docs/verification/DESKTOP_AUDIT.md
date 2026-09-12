# Desktop audit after documents/reference integration

Date: 2026-09-08. Scope: `desktop/main.cjs`, `preload.cjs`, `references.cjs`, `documents.cjs`, `local-model.cjs`, renderer grounding call site and state save coordinator. This pass was read-only for product files; no additional material defect was identified.

## Findings

- IPC checks the owning application webContents and its main frame. The PDF preview has no preload/Node/Cosmos bridge and cannot invoke these application operations.
- Reference input is a manifest identifier, not a caller-supplied path. Relative and canonical paths are confined to the resource directory. Metadata is restricted to known subject/status/kind values. PDF bytes are checked against size, magic and SHA-256 before each open. The renderer receives metadata without filesystem paths.
- Reference rendering uses a separate session with denied permissions and external requests. Opening another reference reuses one viewer. Preview loading has a finite 15-second deadline and closes the failed window. Missing or invalid resources return an empty library or a readable failure; the lesson shell does not wait for them.
- State reads and writes share one queue. Temporary-file replacement keeps the previous valid snapshot intact and retries transient Windows file locks for a bounded period. Existing backup/journal recovery remains in place. The prior native five-export regression completed with the latest DOCX path persisted, not merely a file on disk.
- Document file names are normalized inside the selected document directory. Preview HTML escapes content and disallows scripts/network resources. Temporary PDF windows are destroyed in `finally`. Native print footers were visually checked on all three pages of a real session document.
- Local inference uses a hidden child process, loopback-only server and a per-process random key. One request is accepted at a time. GPU/CPU startup and answer generation have finite deadlines. Failure releases the busy flag and terminates the owned runtime child. Application quit stops the runtime. No changes to GPU selection, model or deadlines were made during this audit.

This does not establish that a local model's educational answers are correct. The earlier pedagogical limitations still apply. Attaching retrieved source IDs proves which context the application supplied; it does not independently verify every generated statement.

## Prepared evaluation, not executed in this pass

`scripts/grounded-model-ui.mjs` requires `COSMOS_EXE` pointing to an installed packaged EXE. It removes development/runtime/reference path overrides, uses a new test profile and asks eight questions through the UI: two each in mathematics, Russian, history and social studies.

For each question it records the exact saved response, its `kind`, `sourceIds`, `knowledgeIds`, displayed recognized source links, runtime completion timing and scene responsiveness. A fallback marked `material`, absent runtime inference completion, or missing persisted reference metadata causes transport failure. Each room checks that both responses persist without creating independent exercise attempts or copying messages to another room.

The per-question deadline is 145 seconds; the run has a 12-minute work budget plus bounded UI/cleanup operations. If a teacher reply does not arrive, the script stops instead of sending another concurrent request. Four actual application screenshots and `answers.json` go to `docs/verification/grounded-model-ui` by default. Model output is always marked `pending-manual-review`; successful transport is never renamed pedagogical PASS.

Only syntax and `--describe` were run while packaging was in progress. The model was not started by this audit.
