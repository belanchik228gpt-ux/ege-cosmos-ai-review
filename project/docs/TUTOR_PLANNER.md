# Local semantic selection of a teaching step

The new `window.cosmos.planTutorTurn` bridge asks the installed Qwen model to select one item from a bounded set of permitted teaching steps. It makes one inference request. It does not generate a new question, solution, visual program or mastery decision. Returned explanatory text is copied from the selected domain-approved step and is explicitly marked `explanationOrigin: 'approved-material'`, with `method: 'local-model-step-selection'`.

## Contract

```ts
planTutorTurn({
  subject: 'math' | 'russian' | 'history' | 'social',
  message: string,
  currentStepId: string,
  stateKey: string,
  steps: Array<{
    id: string;
    title: string;
    explanation: string;
    question: string;
    purpose?: string;
    action: 'stay' | 'focus-step';
    sourceIds: string[];
  }>,
});
```

Successful result: `{ok: true, method, selectedStepId, action, explanation, explanationOrigin, sourceIds, stateKey, model, elapsedMs}`. An unsuccessful result contains only `{ok: false, method, error}`; it never includes a rejected model output. Technical reasons go to diagnostics.

- One to eight unique steps. The current step must be present.
- Message ≤3,000 characters; state key ≤240; step ID ≤96 ASCII letters/digits plus `_.:-`.
- Step title ≤160; explanation ≤500; question ≤360; optional purpose ≤240 characters.
- Combined step title/explanation/question/purpose text ≤5,000 characters.
- One to twelve syntactically valid source IDs per step; duplicate source IDs are removed.
- The native handler is restricted to the main window's main frame. It validates shape and bounds. The domain layer is responsible for selecting genuine allowed material and registered sources; native IPC does not establish the factual accuracy of arbitrary supplied prose.

The model sees subject, pupil message, current step ID and the projected permitted teaching material. Extra fields such as `answer`, `expectedAnswer` and `fullSolution` are not included. Do not place those secrets inside the allowed explanation or question fields. The exact model output schema has one required field, `selectedStepId`, whose enum is constructed from the actual permitted IDs. No arbitrary action argument, HTML, CSS, code or tool is accepted. The native handler derives the action and material from the selected step instead of accepting separately generated values that could disagree.

`stateKey` is returned from the original request, not model output. The UI must compare it with the current session/task/step revision before applying the result. The UI owns the assessment target, permitted transitions, scene playback and final-answer reveal permission. Only the question associated with the accepted selected step may become the next assessed input.

## Grounding and answer visibility

Selection is checked mechanically against the domain-approved candidate set. Canonical material is not relabelled as generated model prose and does not need a second model factual review: no new factual wording is returned by the selector. A model can still select a pedagogically unhelpful permitted step; enum validity does not establish pedagogical quality.

If the UI subsequently asks for a natural paraphrase, that is a separate model operation. Its evidence must contain only the chosen step's permitted explanation, not the full original solution or unrevealed expected answer. The existing mandatory generated-answer review remains in place. Calling the selector and then the current two-pass `getTutorResponse` requires three inference requests in total; the new selector alone is one. Clear correct answers and explicit local controls need no model selection. Whether to invoke selection for an ambiguous question is an orchestration decision, not an excuse to hide a failed model response.

The initial audit found that `activeTaskEvidence` included the full answer/explanation and `problemEvidence` included every solution step. A free-text prompt saying “do not reveal” cannot guarantee privacy of the final answer when that answer is supplied as evidence and the reviewer checks only factual support. Structured IDs isolate what the selector may cause the UI to display. Any separately generated free prose still needs validation and cannot be advertised as a universal mathematical or semantic guarantee.

## Runtime and cancellation

Selection uses the existing Qwen3-8B Q4_K_M worker, 4,096-token context, batch/ubatch 128 and disabled thinking. It does not allocate another model alongside text or vision. Shared busy/configuration/image ownership prevents concurrent inference. `cancelAskModel()` cancels a pending selection and stops only the owned child. There is a 20-second inference deadline and a 120-second total deadline including the existing bounded GPU-to-CPU startup sequence.

Invalid bounded decisions preserve a healthy worker. Transport errors and timeouts stop the owned worker; busy/controller state is cleared for the next operation. The new method does not alter the timeouts or mandatory review of `askModel`.

## Schema support and verification

The local artifact manifest pins llama.cpp `b10850`. Its [server documentation](https://github.com/ggml-org/llama.cpp/blob/b10850/tools/server/README.md) supports schema-constrained `response_format: {type: 'json_object', schema: ...}`. The existing evidence reviewer and image reader already use that interface. The pinned [schema converter](https://github.com/ggml-org/llama.cpp/blob/b10850/common/json-schema-to-grammar.cpp) implements enum and const. The [grammar documentation](https://github.com/ggml-org/llama.cpp/blob/b10850/grammars/README.md) warns that only a subset of JSON Schema is supported and that the schema is not inserted into the prompt automatically. The selector therefore uses a small flat schema, describes the expected format in the trusted prompt and independently validates the received object.

`tests/tutor-planner.test.ts`: 15 tests pass without launching inference. They cover projection of permitted material, hostile extra output, exact ID binding, canonical provenance, bounds, single-call transport, repeated send, shared busy ownership, cancellation, truncated output and both deadlines. Together with existing model-backend and evidence-review tests, 34 targeted tests pass. These tests do not prove that real Qwen selects the right educational detour.

`node scripts/teaching-runtime-check.mjs` subsequently ran six sequential requests against the actual Qwen3-8B Q4_K_M GPU worker in a fresh test profile. Five choices matched the expected pedagogical step; one did not. Definitions, subtraction, sign, reordering and the off-topic request were routed correctly. A request to continue the current brackets step incorrectly selected the earlier module step. All six outputs were syntactically valid permitted IDs: this demonstrates the distinction between a safe bounded selection and the correct teaching decision. The result is recorded as a failed six-case semantic suite, not a complete PASS. Explicit continuation controls should remain owned by the learning engine.

Cold startup took 18.506 seconds; the first selection completed in 19.575 seconds including startup. The subsequent five requests took 0.572–0.660 seconds each in this run. These timings are measurements on the test RTX 3070 Ti, not a latency guarantee. Full inputs, actual completion choices, token counts, source hashes, diagnostics and confirmed worker cleanup are in [the runtime result](verification/teaching-runtime-0.4/result.json); [the review](verification/teaching-runtime-0.4/REVIEW.md) describes the fixture and quality limits. This test did not launch the installed EXE, test live paraphrasing or establish end-to-end UI acceptance.
