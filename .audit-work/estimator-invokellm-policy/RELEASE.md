# InvokeLLM Shared Flagship Policy - Verified Sandbox Adoption

- App `68dfcc5e57bbbc35387da97c`, branch `main`.
- Checkpoint `6aeda3df9662f00bac5c9411`.
- Commit `b359c0a43e62075b1d25d61fa132ceeb9b875d51`.
- Restore checkpoint `6aeda34bb9f864218d6cd922`.
- ALREADY checkpointed; do not repeat activation.

## Exact Scope

New canonical `base44/shared/estimatorAiModelPolicy.js`: all8 registry keys request GPT-6.1 Sol, exact preset `gpt_6_sol`, via Base44 InvokeLLM.

Six existing callers import that policy and pass its model: Foundation AiEngineeringAssistant; VinylArtworkUploadDialog; Channel AIScopeWriterModal, AIInstallScopeModal, PhotoEstimateModal and shared AddressAutocomplete (used by Channel/Maintenance/Vinyl estimator pages). Address's old `gemini_3_flash` override is replaced. Five unused React default imports were removed to clear existing lint errors; named hooks remain.

No prompt, response schema, callback, price calculation, app-wide model default, unrelated module AI, entity schema or backend action changed. This is shared-model selection adoption, not completed specialist assistant/backend work.

## Verification

- `policy-verification.json`, `policy-final.txt`: lead-authored/checked22/22. All8 keys, fail-closed unknown keys, AST preservation of prompts/schema/callbacks, actual-source request argument SDK spies across6 callers and image branch. Zero foreign/paid provider calls.
- `lint-final.txt`:0 errors,1 preexisting unused-catch-variable warning in AddressAutocomplete.
- `component-bundles/*-meta.json`, `page-final-meta.json`: all6 actual caller bundles and actual Foundation page include canonical policy.
- `stored-source-shape.json`: independent stored CRLF inspection/hashes. First full-file dryrun failed without mutation; unique ASCII anchors then passed all6 previews, preserving stored line endings.
- `readback-*.json`, `final-source-readback.json`: all7 exact LF-equivalent source readbacks (only new policy's final LF optional after Base44 write).
- `remote-build.json`: exit0/truncatedfalse; real6 caller outputs and actual page include canonical policy/card/auth/toolbar.
- `preview-status.json`: sanitized preview metadata succeeds, existing sandbox reused. No credential persisted/printed and no business page opened.
- `activation-final.json`, `final-git.json`, `final-clean-state.json`: exact7-file delta, clean remote and final checkpoint.

## Limits

No publishing, deploy commands, customer/business-record tests, real AI calls or integration-credit spend. Requested model is verified in source/synthetic parameters, NOT as an actual served model. Live quality/cost, retired-preset remapping, server-authenticated estimatorDesignAction, validated/stale-safe proposals and each module's full AI acceptance remain OPEN. Existing unsafe engineering/scale assumptions are not repaired merely by choosing a flagship model.

Repository policy: `ESTIMATOR_AI_MODEL_POLICY.md`; approved external plan Section29. Five-credit/five-attempt TEST limit unchanged. Concrete feature work remains first; no queued module redesign starts through this change.
