# Address → jurisdiction → permitting information

## Simple surface

1. Enter the job address and press **Find my jurisdiction**. Typing alone does not start paid research.
2. Read the suggested place and choose a jurisdiction. Direct manual selection also works without an address lookup.
3. Press **Scan website** to recheck the saved official page, or **Find missing information** for broader research. Office buttons recheck individual saved offices. Every tracked action has its own activity and progress inside the selector.
4. Read the result, then press **Use this jurisdiction** when ready. Scanning and research do not apply a selection to the job.

## Current implemented behavior

The existing Google geocoder supplies coordinates and address components. Saved localities are matched using normalized names, states, municipality/township rules and canonical profile links; duplicate or broken identities remain blocked. The existing AI address task researches zoning/parcel information and suggests a place where necessary. AI results do not create verified office authority. The picker displays saved forms/links and the last research date, exposes scan/research controls and keeps office-review details available on expansion. Missing reference research starts only after an explicit request. Current lookup still invokes AI after the catalog check to research parcel/zoning details; this is not an address-cache or boundary verification implementation.

## Remaining address-resolution work

- Confirm the actual parcel and municipal/township boundary with official GIS/auditor/boundary evidence. A mailing city, ZIP or geocoder component is a geographic suggestion and cannot alone prove legal coverage.
- Determine each responsible office separately: sign/zoning, building, electrical permit issuer, electrical inspection provider, and additional historic/ROW/planning reviews when supported by the location and project. A county or city label is not proof that one office covers every role.
- Retain the exact official source, property/boundary match, review state and last check for each result. Use “Needs review” when a match is missing or conflicting.
- Reuse saved address/parcel evidence with explicit freshness rules before doing additional paid research. Develop an address-specific cache only after its identity and invalidation rules are implemented.
- Connect the confirmed location, project sign details and reviewed office requirements to workflow generation. Present forms, online submission links, fees and requirements with citations. Do not promote AI guesses into legal requirements or silently replace an existing job workflow.

## Progress meaning

Measured page/step counts use a determinate bar. AI internal searches/visited pages and total work are not exposed, so that stage uses an indeterminate bar plus the actual submitted instructions and returned findings. A bounded source-page scan is not a claim of complete jurisdiction coverage; retained frontier/gaps still need continuation and review. Details remain expandable so the normal surface stays simple.
