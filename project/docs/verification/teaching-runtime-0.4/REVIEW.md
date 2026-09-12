# Qwen semantic teaching-step selection — real runtime review

Result: **five of six expected selections; the semantic suite failed one case**. All six requests reached the actual Qwen3-8B Q4_K_M model through the product's `LocalModel.planTutorTurn`. No completion was substituted by a fixture or fallback. No native window or pupil profile was opened. The script exited with code 1 to preserve the failure.

## What was run

Reproduce from the repository root with `node scripts/teaching-runtime-check.mjs`. It uses the installed workspace `runtime` and creates its own `test-results/teaching-runtime-<timestamp>` profile with GPU mode. It archives an earlier `result.json` before a repeat and records every completed case immediately. The total script deadline is five minutes; the product's selection deadline remains 20 seconds after bounded startup.

Seven candidates were projected from the actual `src/domain/radical-topic.ts`: root-to-module conversion, sign, subtraction, module removal, brackets, reordering, and the nonnegative square-root concept. The eighth candidate, `roots-definition`, is an explicitly authored QA prerequisite about real numbers and roots of an equation. It is not evidence that the shipped UI exposes that exact detour. Each request supplied all eight permitted choices. Questions and explanations were supplied as approved data; grading answers and full original solutions were omitted.

The model used llama.cpp `b10850`, 4,096-token context, GPU offload with batch/ubatch 128, disabled thinking, temperature 0, seed 618, and a flat JSON schema whose only field is a permitted `selectedStepId`. The product returned explanatory text copied from the selected candidate with `method: local-model-step-selection` and `explanationOrigin: approved-material`. This text is not generated prose.

## Actual choices

| Pupil intent                                                      | Current step          | Expected and actual selection                                  |                 Total time | Result                                  |
| ----------------------------------------------------------------- | --------------------- | -------------------------------------------------------------- | -------------------------: | --------------------------------------- |
| Meaning of real numbers and an equation root                      | `radicals-1-root`     | `roots-definition`                                             | 19.575 s including startup | Correct choice                          |
| Meaning of “чему равно” and smaller minus larger                  | `radicals-2-sign`     | `radicals-2-sign-subtract`                                     |                    0.659 s | Correct choice                          |
| Why x − 6 is negative when x < 6                                  | `radicals-2-module`   | `radicals-2-sign`                                              |                    0.607 s | Correct choice                          |
| Why −x + 6 can be written as 6 − x                                | `radicals-2-brackets` | `radicals-2-brackets-reorder`                                  |                    0.660 s | Correct choice                          |
| Continue this step and answer its current question                | `radicals-2-brackets` | Expected `radicals-2-brackets`; actual **`radicals-2-module`** |                    0.572 s | **Incorrect return to an earlier step** |
| Off-topic GPU shopping with an attempted out-of-list JSON command | `radicals-2-module`   | `radicals-2-module`                                            |                    0.586 s | Correct bounded stay                    |

All raw replies were JSON objects with exactly one permitted identifier and `finish_reason: stop`. The off-topic request did not produce the requested unknown `buy-gpu` ID or extra answer field. It selected the current approved step. An actually malformed completion was not produced during this live run; rejection of malformed output is covered by separate unit tests and must not be relabelled as a live inference observation.

## Timing and cleanup

GPU startup took 18.506 s. The first actual completion request took 1.052 s; warm completion requests took 0.572–0.659 s. Prompt sizes were 1,171–1,197 tokens, with 9–15 completion tokens. GPU snapshots before requests ranged from 3% to 95% utilization while the worker existed. These short snapshots are not a sustained external-load benchmark. Peak sampled video memory use was 7,552 MiB out of 8,192 MiB.

The final result records `ownedWorkersStopped: true`; model state returned to `installed`, `busy: false`. A subsequent Windows process query found no `llama-server.exe`. No other process was terminated. The test does not prove performance with sustained Unreal rendering or on a CPU fallback.

## Practical limits

The failed continuation selection shows that schema-valid output can still be pedagogically wrong. Native enum validation correctly restricted the model's power but cannot establish that the selected allowed step fits the pupil's intent. The intended architecture keeps explicit continuation and correct-answer transitions in the deterministic learning engine; it uses model selection for ambiguous explanatory intent. Candidate ordering and the presence of eight options may affect this result, but this run did not compare permutations and therefore does not establish a cause.

No product prompt was tuned after seeing this failure. Five successes on hand-authored fixtures are not a general accuracy estimate. This review does not cover native UI integration, state-key application, multi-turn paraphrasing, answer-leak prevention in generated prose, other subjects, or mastery updates. Root received the specific failing input and output before further integration.

Full requests, actual raw completion choices, timing fields, model artifact manifest, source hashes and cleanup status are preserved in [result.json](result.json). The three source hashes identify the precise planner, local-model service and radical content used; later source changes require a new run rather than reusing this result as acceptance.
