// Applies the O-013 fix edits to the fresh remote copies and writes the
// fixed candidates under fixed/. Each old_string must occur exactly once in
// the remote file — the same contract `sandbox edit` enforces remotely.
// Remote files are LF-terminated; edit strings embed \n so they match
// byte-exact (verified by cat -A on the pulled files).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const R = (p) => path.join(here, 'remote', p);
const F = (p) => path.join(here, 'fixed', p);
const E = '\n';

const edits = [
  // ---- F-3: updateEstimateRevisionAudit — caller-scoped read of a
  // backend-only entity -> read service-role after the session check.
  {
    file: 'updateEstimateRevisionAudit_entry.ts',
    out: 'base44/functions/updateEstimateRevisionAudit/entry.ts',
    edits: [
      {
        id: 'F-3/1 bind service-role estimate entity',
        old: `    const RevisionService = base44.asServiceRole.entities.EstimateRevision;${E}    const EstimateUser = base44.entities.AllInOneEstimate;`,
        next: `    const RevisionService = base44.asServiceRole.entities.EstimateRevision;${E}    // AllInOneEstimate is backend-only RLS — the caller-scoped client can${E}    // never read it, so this verification read must go through the service${E}    // role like the sibling RevisionService handle (auth is checked above).${E}    const EstimateService = base44.asServiceRole.entities.AllInOneEstimate;`,
      },
      {
        id: 'F-3/2 use service-role handle',
        old: `      const estimate = await EstimateUser.get(estimateId).catch(() => null);`,
        next: `      const estimate = await EstimateService.get(estimateId).catch(() => null);`,
      },
    ],
  },

  // ---- F-4: EstimatorAuditPanel — AdminAuditLog is not in the client proxy
  // set; route the read through staffEntities (staffDataRead ADMIN_READABLE).
  {
    file: 'EstimatorAuditPanel.jsx',
    out: 'src/components/estimator/EstimatorAuditPanel.jsx',
    edits: [
      {
        id: 'F-4/1 import staffEntities',
        old: `import { base44 } from "@/api/base44Client";${E}import { ListSkeleton } from "@/components/ui/list-skeleton";`,
        next: `import { base44 } from "@/api/base44Client";${E}import { staffEntities } from "@/components/staff/staffEntities";${E}import { ListSkeleton } from "@/components/ui/list-skeleton";`,
      },
      {
        id: 'F-4/2 route AdminAuditLog through the staff read gateway',
        old: `          type === "revision" || type === "activity" ? Promise.resolve([]) : base44.entities.AdminAuditLog.filter({}, "-at", 150).catch(() => []),`,
        next: `          // AdminAuditLog is not in the base44Client read-proxy set — it must${E}          // go through staffEntities (staffDataRead ADMIN_READABLE, admin role${E}          // re-checked server-side; the panel itself mounts only for admins).${E}          type === "revision" || type === "activity" ? Promise.resolve([]) : staffEntities.AdminAuditLog.filter({}, "-at", 150).catch(() => []),`,
      },
    ],
  },

  // ---- F-2a + F-2b: EstimatorQueues — .update() is not an allowed op for
  // AllInOneEstimate; use the CAS-anchored updateMany the gateway accepts.
  {
    file: 'EstimatorQueues.jsx',
    out: 'src/pages/EstimatorQueues.jsx',
    edits: [
      {
        id: 'F-2a quote_expired sweep -> anchored updateMany',
        old: `    staffEntities.AllInOneEstimate.update(e.id, { quote_expired: expired }).catch(() => {});`,
        next: `    // Best-effort sweep stays swallowed — a stale anchor just no-ops and${E}    // the next load retries (update() is not an allowed op on estimates).${E}    staffEntities.AllInOneEstimate.updateMany(${E}      { id: e.id, updated_date: e.updated_date },${E}      { $set: { quote_expired: expired } },${E}    ).catch(() => {});`,
      },
      {
        id: 'F-2b bulk status -> anchored updateMany + result check',
        old: `      try {${E}        await staffEntities.AllInOneEstimate.update(id, { status: bulkStatus });${E}      } catch (error) {`,
        next: `      try {${E}        // update() is not an allowed op on estimates — anchor the write to${E}        // the loaded row's updated_date; a zero-match means the row changed${E}        // since the queue loaded and must surface as a failure, not a no-op.${E}        const bulkResult = await staffEntities.AllInOneEstimate.updateMany(${E}          { id, updated_date: row?.updated_date },${E}          { $set: { status: bulkStatus } },${E}        );${E}        if (!bulkResult || bulkResult.updated !== 1) throw new Error("estimate changed in another session — reload and retry");${E}      } catch (error) {`,
      },
    ],
  },

  // ---- F-2c: EstimateDetail merge — archive the secondary through the same
  // field-level CAS helper the queue archive path uses (updateMany inside).
  {
    file: 'EstimateDetail.jsx',
    out: 'src/pages/EstimateDetail.jsx',
    edits: [
      {
        id: 'F-2c merge-archive via replaceEstimateFieldsIfUnchanged',
        old: `      try {${E}        await staffEntities.AllInOneEstimate.update(secondary.id, {${E}          status: secondaryAfter.status,${E}          archived_at: secondaryAfter.archived_at,${E}          archived_reason: secondaryAfter.archived_reason,${E}        });${E}        await ensureEstimateLifecycleRevision({`,
        next: `      try {${E}        // update() is not an allowed op on estimates — archive through the${E}        // same field-level CAS helper the queue archive path uses, anchored${E}        // to the secondary's loaded version so a drifted/trashed row throws${E}        // (and reaches the alert below) instead of silently skipping.${E}        const mergeArchiveFields = {${E}          status: secondaryAfter.status,${E}          archived_at: secondaryAfter.archived_at,${E}          archived_reason: secondaryAfter.archived_reason,${E}        };${E}        await replaceEstimateFieldsIfUnchanged({${E}          entity: staffEntities.AllInOneEstimate,${E}          estimateId: secondary.id,${E}          expectedFields: expectedEstimateFields(secondary, mergeArchiveFields),${E}          guardFields: { updated_date: secondary.updated_date },${E}          nextFields: mergeArchiveFields,${E}          label: "Estimate merge archive",${E}        });${E}        await ensureEstimateLifecycleRevision({`,
      },
    ],
  },
];

let allOk = true;
for (const spec of edits) {
  const src = fs.readFileSync(R(spec.file), 'utf8');
  let out = src;
  for (const e of spec.edits) {
    const count = out.split(e.old).length - 1;
    if (count !== 1) {
      console.error(`FAIL ${e.id}: old_string occurs ${count}x in ${spec.file}`);
      allOk = false;
      continue;
    }
    out = out.split(e.old).join(e.next);
    console.log(`OK   ${e.id} (${spec.file})`);
  }
  const target = F(spec.out);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, out);
}
if (!allOk) process.exit(1);
console.log('all edits applied -> fixed/');

// Emit SPEC.json from the same edit objects so the apply spec and the fixed
// candidates can never drift apart.
const spec = {
  spec_id: 'O-013-estimator-authz-func-fixes',
  generated_by: '.audit-work/foundation-o013-fixes/apply-edits.mjs',
  app_id: '68dfcc5e57bbbc35387da97c',
  branch: 'main',
  head_at_pull: '1fe65f4445bd5963adfb87f8b92eb30d08ff6730',
  remote_pulled_utc: new Date().toISOString(),
  source_audit: '.audit-work/foundation-o013-authz/findings.md',
  line_endings: 'LF (verified via cat -A on fresh pulls)',
  findings_addressed: ['F-2', 'F-3', 'F-4'],
  findings_explicitly_out_of_scope: {
    'F-1': 'fileBridgeMaintenance anonymous writes — FileBridge module, not estimator scope',
    'F-5..F-9': 'design notes / REQUIRES-LIVE-PROBE items — no code change requested',
  },
  apply: {
    method: 'sandbox edit',
    note: 'Each edit.old occurs exactly once in the remote file at head_at_pull (verified by this script). Re-pull and re-run this script if head moved. Full fixed files also staged under fixed/ for `sandbox write` fallback — prefer `sandbox edit` so unrelated remote drift cannot be clobbered.',
  },
  fixes: edits.flatMap((s) => s.edits.map((e) => ({
    id: e.id,
    file: s.out,
    sandbox_edit: { old_string: e.old, new_string: e.next },
  }))),
  verification: {
    harness: '.audit-work/foundation-o013-fixes/test-o013-fixes.mjs',
    result: 'passed=20 failed=0 (see NOTES.md)',
    covers: [
      'RED: op=update on AllInOneEstimate -> real staffEntityWrite bundle 403',
      'GREEN: updateMany({id,updated_date},{$set}) -> 200 updated:1 for all three write payloads',
      'RED: baseline updateEstimateRevisionAudit complete_manual_revision -> 404',
      'GREEN: fixed bundle -> 200 revision completed; attach_delivery_evidence regression 200',
      'GREEN: staffEntities.AdminAuditLog.filter -> real staffDataRead admin rows; staff -> denied[]; no session -> 401',
      'e2e: replaceEstimateFieldsIfUnchanged merge-archive -> real gateway write lands; drifted row throws',
      'static: no denied-op calls remain; esbuild transform of every fixed file',
    ],
  },
};
fs.writeFileSync(path.join(here, 'SPEC.json'), JSON.stringify(spec, null, 2) + '\n');
console.log('SPEC.json written');
