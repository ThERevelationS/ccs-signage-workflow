# Permitting UX masterplan

**Goal:** A coordinator opening Permitting can tell which job needs a person, which permit is involved, and what to do next without opening a form. Looking at a permit never changes it.

**Scope:** CCS Signage Workflow, app `68dfcc5e57bbbc35387da97c`, Permitting staff workspace. Planning only. No changes to jurisdiction research workers, business rules, schemas, permissions, billing, or other queues. Publication is a separate decision.

## Start from the preview, not the original screenshots

Last verified preview checkpoint: `6b07e398c25a422ec7afde49`. Keep the collapsed job queue, direct setup and office-verification states, Do now / Up next / Done checklist, confirmed step handoff, and targeted fee, corrections, inspection, and closeout links. These are a baseline, not backlog. Previous fixture checks established that interactions work; they did not establish that a new staff member understands the page.

## Independent baseline and first implementation decision

**P0 complete for engineering triage; no staff feedback collected or required to proceed.** A browser harness used the sandbox queue rules and real checklist/handoff components with synthetic saves. Each fixture contained three completed permits and one active Historic District permit. Each had an incomplete Office review checkbox. After a simulated successful update to a different reference field, the harness compared the recommendation again. Reference date: 2026-11-25. No production calls.

| Active permit | Queue recommendation | Open checklist and post-save recommendation |
| --- | --- | --- |
| Future follow-up, Dec 1 | Wait until Dec 1 | Office review now / next |
| Overdue follow-up, Nov 23 | Follow up now | Office review now / next |
| Jurisdiction fee due | Resolve fee | Office review now / next |
| Inspection required | Book inspection | Office review now / next |
| Permit received, still active | Review for closeout | Office review now / next |
| Filed, no future follow-up | Schedule next follow-up | Office review now / next |

The queue chose the correct line ID in all six cases. The competing instructions arise because the checklist and handoff promote the first unfinished step even when the queue rules prioritize something else. These are repeatable behavioral findings, not measures of human comprehension or frequency in production.

**Decision: do P1 before visual polish.** Keep job-level priority across all lines. For a chosen line, derive its recommendation from the same rules scoped to that line, and derive the post-save recommendation from the confirmed saved record. Represent the intent (wait, follow up, review fee, inspect, close out, or work a checklist step) explicitly, rather than matching label text. Show one primary recommendation; keep other checklist steps accessible as optional work. For a waiting permit, do not present a mandatory-looking action. Never represent a scheduled reminder as a contact already made.

**P1 exit test:** repeat these six fixtures plus ordinary unfiled, completed, read-only and conflicting-save controls. All three surfaces must agree on the action and target *when referring to the same line*. The job-level queue may correctly prioritize a different permit after a save. No popup on inspection, no write on navigation, and no success recommendation after an unconfirmed save. Optional staff testing later can evaluate wording and speed; it does not block the engineering sequence.

## What the staff member should see

| Level | Visible by default | Intentionally one level deeper |
| --- | --- | --- |
| Queue | Job, permit or office needing attention, owner, plain-language status, next action, due date if relevant | Filters beyond search and My work; saved views; export and configuration |
| Job | One line per permit: permit name, office, current step, follow-up, blocker if any | Job metadata, shared office directory, documents, notes, setup and bulk actions |
| Permit | One primary action, a short upcoming list, collapsed completed work | Prior values, corrections, fees, inspection, closeout, office settings and history |
| Step update | Only the value being recorded, its consequence, Save and Cancel | After confirmed save: the next relevant action or return to the queue |

Example: **Drunken Tacos / Historic District** should say **Record submission** before filing and **Waiting on office - follow up [date]** when that is the actual next state. If a jurisdiction fee blocks progress, **Review fee** wins over a generic checklist action. Never invent a due date or show a waiting job as staff work merely because no permit line exists yet.

## Delivery sequence

| Order | Work package | Acceptance gate |
| --- | --- | --- |
| P0 - Independent walkthrough | Compare synthetic jobs across queue, permit, and save dialog. Record conflicting instructions and navigation errors. | Completed baseline above; no staff scheduling dependency. |
| P1 - Agree on one next action | Compare queue, open permit, and post-save dialog for the same record. Derive recommendations from the existing permit rules, not three independent strings. Distinguish **staff action**, **waiting on office**, and **blocked**. Preserve search, deep links, and saved views. | For each fixture below, all three surfaces agree about the responsible party and action. In a four-permit job the action opens the correct permit and section. |
| P2 - Subtract visual noise | Prototype one compact queue row and one open job. Give the next action the strongest emphasis. Use whitespace and headings for **Permits**, **Needs attention**, and **Reference**; reserve colored emphasis for urgency or a blocker. Show routine metadata once. Keep a visible count when completed work is folded away. | At 1280px a coordinator can compare several jobs without expanding them; at 320px every action remains reachable without horizontal page scroll. Staff can identify owner and blocker without relying on color, hover, or tiny icons. |
| P3 - Finish the daily loop | Prioritize following up with an office: show last contact, next follow-up, owner, and where to record the outcome. State explicitly whether a date is a contact date or a future reminder. On a meaningful milestone use one dialog, not a chain of confirmations. After saving, offer the actual next action, including waiting or closeout, rather than always recommending the next checkbox. | Cancel makes no write. Double-click does not duplicate a filing. A refused or uncertain save cannot show success or advance. If a saved job moves queue sections, the user can still continue or return to a sensible focus target. |
| P4 - Keep exceptions usable | Run through office corrections, unpaid fees, failed inspection, and permit receipt with remaining obligations. Show one concise reason and a link to the exact field. Group infrequent tools by scope: job actions vs permit actions. Bulk and destructive actions name affected permits and retain their confirmations. | A user can resolve or inspect each exception without opening unrelated sections. Receipt, checklist completion and audited permit closeout remain distinct. Read-only viewers can inspect facts without being offered writes. |
| P5 - Validate and release | Repeat P0 tasks on the candidate and compare with baseline. Check keyboard-only use, mobile, narrow desktop, slow responses, stale data and user permissions. Demo to Brett using synthetic jobs. | Proposed release targets: at least 4 of 5 unaided participants identify the correct permit and next action within 10 seconds; reach its control in at most two deliberate selections; zero accidental changes during inspection. Report actual results, not just passing builds. |

## Fixture pack and regression checks

- **New vs queued setup:** address-first wizard for a new job; named office verification status for a pending one; no duplicate setup prompt.
- **Ordinary filing:** dates, text, and checkboxes; out-of-order work; reopen completed steps intentionally. Confirmation uses the chosen filing date.
- **Waiting vs overdue:** future, today, past, and missing follow-up dates. No pressure to act on a future item; overdue work is discoverable without a filter.
- **Multi-office job:** two similarly named permit lines with different owners; one fee due and another ready for review. Verify navigation by record ID, not display name.
- **Closeout:** received permit with a fee, outstanding correction or inspection; then a clear-to-close permit. Never automatically close either.
- **Failure and access:** failed read is not an empty queue; failed save preserves an understandable next step; keyboard focus survives row movement; no mutation from opening a section or viewing as read-only.

## Execution rules

Start the next implementation slice at P1 using the baseline above. Track each package as **planned / in preview / validated with staff / approved to publish**, attaching a checkpoint and test evidence. For implementation, inspect fresh sandbox source first: `Permitting.jsx` for queue state and persistence; `permitQueue.js` for priority; `PermitClientGroup`, `PermitSpreadsheetRow`, `PermitChecklist` and `PermitLineLifecycleDetails` for presentation. Reuse existing saves, conflict checks and audit paths. Do not increase polling or introduce background writes for cosmetic status updates.

Test only with synthetic records. Build and verify each approved slice in preview; retain a pre-change checkpoint for recovery. Do not publish, restore, or change production data as part of this plan.
