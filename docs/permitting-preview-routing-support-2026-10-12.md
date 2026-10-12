# Permitting preview routing blocker — October 12, 2026

App: CCS Signage Workflow  
App ID: 68dfcc5e57bbbc35387da97c  
Phase 10, milestone 2 of 3 remains incomplete.

## Request to Base44 support

Please investigate and recover this app's sandbox preview provisioning/routing. Its internal development server responds successfully, but the public preview remains on the Base44 startup placeholder.

Preview URL: https://preview-sandbox--68dfcc5e57bbbc35387da97c.base44.app/permitting

Do not publish the app, revert source, or alter production data as part of recovery. This repository contains concurrent work from several projects.

## Observed evidence

On October 12 at approximately 10:02–10:04 AM America/New_York:
- Opening the public preview initially reported a browser navigation timeout.
- The resulting tab title was “Preview Loading - Base44”.
- Visible heading: “Preview is starting up”; text: “Your app preview is being prepared.”
- One reload returned the same placeholder. Permitting UI did not load.
- Internal http://localhost:5173/permitting returned HTTP 200.
- Internal /src/main.jsx returned HTTP 200.
- Internal /__build_status returned HTTP 200 and {"ok":true,"error":null}.
- Git HEAD was 354a345a123e2d47a42a98a825cdc2129b73f47d and the working tree was clean.

Earlier evidence in docs/permitting-preview-full-restart-verification-2026-10-12.json records a successful managed restart_dev operation with port freed and server ready, followed by the same public startup placeholder. That restart did not resolve the public preview.

The exact platform cause is unconfirmed. These checks establish internal HTTP readiness; they do not prove complete frontend execution, authenticated access, or Google service readiness.

## Current recovery limitation

The currently connected Base44 MCP tool catalog has no callable preview recovery, get_app_preview_url, or get_app_status operation. App listing confirms the app identity but supplies no replacement preview URL. No new restart, authentication attempt, endpoint workaround, or frontend publication was performed during this follow-up.

Prior Google sign-in in the shared browser returned 502 Bad Gateway / connection refused. This is separate observed history, not proof of a Google outage or the cause of preview provisioning failure.

## Resume acceptance after recovery

1. Verify the current-code preview visibly loads.
2. Use the supported secure sign-in flow if needed.
3. Search the previously approved test address: 4900 Parkway Dr, Mason, OH 45040.
4. Confirm the saved scan executes resolvePermittingAddress revision address-geocode-v5 and inspect its safe provider diagnostic.
5. Verify address position, jurisdiction boundary agreement, map controls and per-action progress.
6. Do not apply the result to a WorkOrder or mark office authority verified for testing.

The last historical saved address test used v3 and reported REQUEST_DENIED. Successful geocoding and exact jurisdiction acceptance remain unverified; preview recovery alone does not establish their success.

## Evening follow-up — October 12, approximately 7 PM America/New_York

Fresh repository HEAD: e65cf926dfa4dc52ad28f3020ce75d2b08d064d6; working tree clean before inspection.

A single new public preview navigation timed out, but the resulting tab was inspected successfully. Its title remained “Preview Loading - Base44”, with the visible heading “Preview is starting up” and message “Your app preview is being prepared.” Permitting UI did not load.

Internal /permitting returned HTTP 200; /__build_status returned {"ok":true,"error":null}. The public/internal readiness discrepancy therefore remains observable. Its platform cause remains unconfirmed.

No restart, login attempt, frontend publication, or production data mutation was performed. Support report remains prepared, not sent. Address/map/authority live acceptance remains pending. The repository draft source freshness safeguard was separately verified at checkpoint 6acd58cdd85279ba6d87b053 with 38 focused tests and a successful build; that does not satisfy browser acceptance.
