# Fidelity editing and Taiwan language adaptation

AI System 6 treats expression editing as an author's controlled revision. The shared client, server and Pages guardrails preserve conditions, negation scope, attribution, comparison targets, judgment strength and completion status. Ordinary generation remains lint-only; this change adds no automatic rewrite round.

Humanizer and Make a Change use the smallest necessary expression change. Unless the author requests restructuring, titles, paragraph order and independent information stay intact. When equivalence is uncertain, keep the original sentence. Healthy prose, useful repetition and precise technical terms may remain unchanged. Editing does not retract the author's viewpoint or certify facts. A vague attribution remains attributed; substantive evidence problems belong in the existing review route.

Language follows explicit task requirements, then source language, then the current default. Taiwan readers or Taiwan usage must be explicitly requested through Make a Change. The prose then uses Traditional Chinese and Taiwan expressions in context. A request for Traditional characters alone changes glyphs, not regional vocabulary. Quotations, verbatim interviews/chat/recordings, names, code, links, numbers, scientific terms and heading IDs remain protected. There is no global localization replacement table.

A request to flag issues only returns locations and suggestions in ClioTalk, with no replacement document or write-back preview. Direct edits return document text only and keep the existing author adoption step. ClioTalk never claims it has edited the original. Before adopting a direct result, the runtime checks the captured cancellation signal, project, editor text and TeachText tab identity, including after the adoption dialog. Late ClioTalk results cannot append to another project's conversation.

The stable prompt IDs are `writing-route.humanizer` and `writing-tools.describe-change`. System Markdown is still built into generated records. Project disablement wins over project overrides, which win over system prompts. Existing override files are not migrated. Effective prompt hashes and run receipts remain available. No menu, public API, task type, setting or storage field is added.

## Sources and local choices

- [shuorenhua](https://github.com/MrGeDiao/shuorenhua/tree/e7c2b8670bd3e1988bfec199e861cebd87fc5e9c), commit `e7c2b8670bd3e1988bfec199e861cebd87fc5e9c`: conservative scope and semantic fidelity. Its permission to tidy reported speech does not apply here; project verbatim protection takes precedence. [MIT license](shuorenhua-LICENSE.txt), Copyright (c) 2026 MrGeDiao.
- [speak-human-tw](https://github.com/Raymondhou0917/speak-human-tw/tree/1f7a870a70a3d53e3b8fa8dae66e1345e5b022a6), version 1.4.0, commit `1f7a870a70a3d53e3b8fa8dae66e1345e5b022a6`: contextual Taiwan adaptation and protected spans. Fixed sentence/punctuation quotas, self-score thresholds, repeated confirmation and fabricated experiences are excluded. [MIT license](speak-human-tw-LICENSE.txt), Copyright (c) 2026 Raymond Hou (雷蒙三十).

These methods were rewritten into the existing compact contract and task prompts. The full upstream skills are not injected into requests.

## Verification and rollback

`tests/features/writing-fidelity.test.mjs` executes the production resolver, three prompt assemblers, request wrapper and adoption lifecycle. It covers language, destination, overrides/disablement, effective hashes, project/tab/text changes, cancellation and late ClioTalk replies. Humanizer and Pages parity tests cover the shared guardrail and lint-only behavior.

`node tooling/eval-writing-fidelity.mjs` preserves frozen sanitized before/after requests in `internal/evidence/writing-fidelity-20261007/requests.json`. The completed run used the product `/api/chat` chain with the configured `qwen3.5-4b-mlx`, temperature `0.35`, max tokens `650`, and a temporary 16K context; the loaded context was restored to 8K afterward. The primary review is saved in `semantic-review.json`. It found the candidate preserved all 14 after-case protected spans and heading order; targeted reruns fixed useful proper-name repetition, glyph-only Traditional conversion, and annotation-only output. The before outputs demonstrate the corresponding failures. This is evidence for these frozen cases, not a general quality claim. Machine checks and model self-scores cannot establish quality. No provider substitution was used.

Original bytes and SHA-256 hashes are in the independent `.statem/writing-fidelity-20261007/baseline/` and `baseline.json`. Roll back only these task differences after checking live files for later edits; never restore the whole checkout or overwrite project prompt overrides. This task does not publish or deploy.
