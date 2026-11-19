# Estimator AI Model And Transport Policy

## Binding Decision - 2026-11-06

Brett requires every Estimator module's AI to use Base44 InvokeLLM and delegates selection of a high-quality model. The selected shared flagship is **GPT-6.1 Sol**, exact Base44 preset **`gpt_6_sol`**.

This is a quality-first engineering recommendation for multi-step intake, reference understanding and structured design proposals, not a benchmark claim or engineering certification. The choice is grounded in Base44's current published supported-model list. No paid provider-quality/cost test has been performed.

The policy applies to all eight specialist modules:

| Registry Key | Specialist Module | Requested Model |
| --- | --- | --- |
| `foundation` | Concrete / Masonry / Pole | `gpt_6_sol` |
| `channel_letters` | Channel / Dimensional Letters | `gpt_6_sol` |
| `maintenance` | Sign Maintenance | `gpt_6_sol` |
| `painting` | Paint | `gpt_6_sol` |
| `laser` | Laser | `gpt_6_sol` |
| `cnc` | CNC | `gpt_6_sol` |
| `metal` | Metal Fabrication | `gpt_6_sol` |
| `vinyl` | Vinyl | `gpt_6_sol` |

Distinct domain prompts/contracts remain necessary; a shared model does not make these generic assistants. Concrete remains the active feature module. Narrow adoption of this shared model policy in existing other-module calls is not permission to start their redesigns in parallel.

## Transport And Selection

- All Estimator language/vision reasoning calls use `base44.integrations.Core.InvokeLLM`.
- Explicitly set each call's `model` from canonical `base44/shared/estimatorAiModelPolicy.js`; do not omit it, use `automatic`, accept a caller-selected model, or hardcode separate module models.
- Do not change the app-wide Base44 model/default or unrelated SOP, Fleet, Permitting, Workflow, Time Clock or other AI.
- No direct OpenAI/Anthropic/Google SDKs, external model endpoints, outside API credentials or separate paid providers for Estimator inference.
- The planned session-authenticated `estimatorDesignAction` owns module/action dispatch and server-controlled model selection. Existing frontend model pins are interim adoption, NOT proof that this backend/authorization boundary already exists.
- InvokeLLM is a bounded call, not a tool-using autonomous agent. Interactive interviews use explicit user turns and bounded validated calls, not a paid self-prompting/tool loop or an unapproved AI-gateway substitution.
- Keep deterministic metadata/vector parsers as non-AI preprocessing. Route any language/vision inference fallback through InvokeLLM, not a second provider.
- `file_urls` and `add_context_from_internet` must not be combined. Reference analysis and grounded research are separately bounded actions where needed; no hidden extra calls.
- Output requiring capabilities InvokeLLM does not provide is explicitly pending, not silently routed to another AI service. Deterministic CAD/3D rendering is not a separate AI-provider call.

## AI Authority And Validation

- AI interviews, extracts observations, requests missing information, proposes editable assemblies/operations, explains options and prepares scope/handoff text.
- Ordinary deterministic calculators and the shared pricing workflow remain authoritative for dimensions/units, valid quantities, costs, inventory/BOM, nesting/machine limits and customer sell.
- AI cannot silently replace raw/saved prices, apply edits, order materials, certify engineering, approve fabrication/machining parameters or assert safe structural adequacy.
- Reference documents/photos and retrieved text are untrusted data, not instructions or authority to ignore permissions/user locks. Unknown scale, wind, soil, load and manufacturer limits remain explicit.
- Use module-specific `response_json_schema` plus independent runtime validation. Reject malformed/unsupported operations, nonfinite geometry, fabricated catalog IDs, arbitrary code/tool instructions and stale revisions.
- Preview the design/scope/quantity/cost delta; explicit acceptance produces one undoable local edit. Normal guarded Save/Builder CAS persists it. Preserve accepted historical quotes.
- Track requested model, policy version, module/action, proposal/source revision, provenance and validation/review state. Do not persist secrets or raw photos in project JSON.

## Failure, Retirement And Credits

- Provider/authorization/credit/validation failures remain visible; manual editing and deterministic estimation remain usable.
- No application-level silent switch to a faster/cheaper/different model and no automatic retry on an ambiguous paid result.
- Base44 documents that retired preset IDs may be remapped to a current model without rewriting app configuration. A requested preset is NOT proof of the served model. Record actual model only if provider metadata really exposes it; otherwise keep served model unknown and recheck supported-model availability during controlled upgrades.
- The unattended TEST run still has the approved ceiling of FIVE existing Base44 integration credits total and FIVE live billable attempts, including retries. This model decision does not increase/reset either limit.
- Verify and reserve a trustworthy upper charge bound for the entire live attempt, including SDK retries. Unknown cost means mock/defer, not guess.
- Use synthetic inputs and mocked AI by default. No unapproved customer photos/records, new subscriptions, top-ups, purchases or paid external APIs.
- Do not conflate the agent's bounded test budget with normal staff-triggered app usage or Devin-session billing. Operational app quotas remain separately controlled.

## Observable Acceptance

1. All eight registry keys resolve to `gpt_6_sol`; unknown keys fail closed with no default/fallback.
2. Every current Estimator InvokeLLM call sends the canonical model explicitly; no old module-specific/automatic preset remains on those calls.
3. Shared imports compile in real component/page bundles without bringing backend auth/secrets into the browser.
4. A synthetic SDK spy observes the requested model, existing structured schema and reference flags; no foreign request or paid provider call is allowed.
5. Future server dispatch ignores/rejects client model/provider overrides and enforces session/module/action permissions; this remains a separate OPEN integration gate.
6. Existing prompt/AI quality risks, stale-response handling, engineering safeguards and seven queued modules' future assistants remain tracked. A model pin alone does not complete those features.
7. Fresh remote compare, named restore checkpoint, contained edit, exact readback/build and final checkpoint precede a claim of sandbox adoption. No publishing.

## Grounded Source Inventory

Fresh source discovery found six current Estimator InvokeLLM call sites:

- `src/components/estimator/foundation/AiEngineeringAssistant.jsx`.
- `src/components/vinylEstimator/VinylArtworkUploadDialog.jsx`.
- `src/components/channelLetterInstall/AIScopeWriterModal.jsx`.
- `src/components/channelLetterInstall/AIInstallScopeModal.jsx`.
- `src/components/channelLetterInstall/PhotoEstimateModal.jsx`.
- `src/components/channelLetterInstall/AddressAutocomplete.jsx` (used by Channel, Maintenance and Vinyl estimator pages).

Other discovered InvokeLLM calls in Permitting, SOP, Fleet and Workflow are outside this change. Existing draft/model/source issues are not evidence that seven new module AI assistants are implemented. Existing unsafe scale/engineering assumptions must be repaired in their module's validated AI work; a flagship model does not make a weak prompt safe.

## Sources

Verified adoption checkpoint: `6aeda3df9662f00bac5c9411`, commit
`b359c0a43e62075b1d25d61fa132ceeb9b875d51`, app main. Canonical policy and all6 existing
Estimator callers read back/build correctly;22 synthetic checks pass. No real AI call or
credit spend. This verifies requested-model wiring, not live model quality/served identity.
Evidence: `.audit-work/estimator-invokellm-policy/RELEASE.md`. Full backend/specialist AI gates stay OPEN.

- Base44 supported models: https://docs.base44.com/developers/backend/resources/models.md
- InvokeLLM API: https://docs.base44.com/developers/references/sdk/docs/type-aliases/integrations
- Built-in integration model selection: https://docs.base44.com/Integrations/built-in-integrations
- Snapshot read on 2026-11-06: `.audit-work/estimator-invokellm-policy/supported-models.md`.
- Source baseline: `.audit-work/estimator-invokellm-policy/source-baseline.json`.
