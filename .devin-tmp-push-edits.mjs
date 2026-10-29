import { readFileSync, writeFileSync } from 'node:fs';

const crlf = (s) => s.replace(/\r?\n/g, '\r\n');
const local = (p) => readFileSync(p, 'utf8');

// timeClockAction: extract the two new action blocks from the local file,
// sandwiched between the end of time_off_request_update and list_correction_requests.
const tca = local('base44/functions/timeClockAction/entry.ts').replace(/\r\n/g, '\n');
const anchorOld = `      return Response.json({ success: true, request: confirmedRecord, audit_id: updateIntent.id, reused: finalOutcome === 'recovered' });\n    }\n\n    if (action === 'list_correction_requests') {`;
const newBlockStart = tca.indexOf(`    if (action === 'list_time_off_requests') {`);
const lcrIdx = tca.indexOf(`    if (action === 'list_correction_requests') {`);
if (newBlockStart < 0 || lcrIdx < 0) throw new Error('new block missing');
const newBlock = tca.slice(newBlockStart, lcrIdx);
const tcaNew = anchorOld.replace(`    if (action === 'list_correction_requests') {`, newBlock + `    if (action === 'list_correction_requests') {`);
// sanity: new_text minus the anchor suffix must equal the local block
if (!tcaNew.includes(newBlock)) throw new Error('tca new block assembly failed');
writeFileSync('.devin-tmp-e-tca.json', JSON.stringify([{ old_text: crlf(anchorOld), new_text: crlf(tcaNew) }]));

// TimeOffRequest.jsonc
const torOld = `      "enum": [\n        "pending",\n        "approved",\n        "denied"\n      ],`;
const torNew = `      "enum": [\n        "pending",\n        "approved",\n        "denied",\n        "cancelled"\n      ],`;
writeFileSync('.devin-tmp-e-tor.json', JSON.stringify([{ old_text: crlf(torOld), new_text: crlf(torNew) }]));

// AdminSettings: TC set +3 events (remote already has the 5-event version)
const asOld = `  "time_clock_in", "time_clock_out", "time_clock_in_late", "time_clock_out_early",\n  "time_entry_long_shift", "time_entry_no_clock_out", "time_entry_notes_updated",\n  "time_off_requested", "time_off_updated", "job_allocation_added", "pto_balance_low",`;
const asNew = `  "time_clock_in", "time_clock_out", "time_clock_in_late", "time_clock_out_early",\n  "time_entry_long_shift", "time_entry_no_clock_out", "time_entry_notes_updated",\n  "time_off_requested", "time_off_updated", "time_off_approved", "time_off_denied",\n  "time_off_cancelled", "job_allocation_added", "pto_balance_low",`;
writeFileSync('.devin-tmp-e-as.json', JSON.stringify([{ old_text: crlf(asOld), new_text: crlf(asNew) }]));

// engine: record map + matchesTrigger cases
const wteEdits = [
  {
    old_text: `  time_off_requested: 'TimeOffRequest',\n  time_off_updated: 'TimeOffRequest',`,
    new_text: `  time_off_requested: 'TimeOffRequest',\n  time_off_updated: 'TimeOffRequest',\n  time_off_approved: 'TimeOffRequest',\n  time_off_denied: 'TimeOffRequest',\n  time_off_cancelled: 'TimeOffRequest',`,
  },
  {
    old_text: `    case 'time_off_requested':\n    case 'time_off_updated':`,
    new_text: `    case 'time_off_requested':\n    case 'time_off_updated':\n    case 'time_off_approved':\n    case 'time_off_denied':\n    case 'time_off_cancelled':`,
  },
].map(e => ({ old_text: crlf(e.old_text), new_text: crlf(e.new_text) }));
writeFileSync('.devin-tmp-e-wte.json', JSON.stringify(wteEdits));

// processWorkflowTriggers
const pwtOld = `  'time_off_requested', 'time_off_updated', 'job_allocation_added', 'pto_balance_low',`;
const pwtNew = `  'time_off_requested', 'time_off_updated', 'time_off_approved', 'time_off_denied',\n  'time_off_cancelled', 'job_allocation_added', 'pto_balance_low',`;
writeFileSync('.devin-tmp-e-pwt.json', JSON.stringify([{ old_text: crlf(pwtOld), new_text: crlf(pwtNew) }]));

// TimeClockAdmin: import + mount
const tcadmEdits = [
  {
    old_text: `import CorrectionRequestAdminPanel from "@/components/timeclock/CorrectionRequestAdminPanel";`,
    new_text: `import CorrectionRequestAdminPanel from "@/components/timeclock/CorrectionRequestAdminPanel";\nimport TimeOffApprovalPanel from "@/components/timeclock/TimeOffApprovalPanel";`,
  },
  {
    old_text: `      <CorrectionRequestAdminPanel\n        sessionToken={sessionToken}\n        onEntriesChanged={loadData}\n        reviewRequestId={correctionReviewRequestId}\n        onReviewRequestOpened={() => setCorrectionReviewRequestId("")}\n      />`,
    new_text: `      <CorrectionRequestAdminPanel\n        sessionToken={sessionToken}\n        onEntriesChanged={loadData}\n        reviewRequestId={correctionReviewRequestId}\n        onReviewRequestOpened={() => setCorrectionReviewRequestId("")}\n      />\n\n      <TimeOffApprovalPanel sessionToken={sessionToken} />`,
  },
].map(e => ({ old_text: crlf(e.old_text), new_text: crlf(e.new_text) }));
writeFileSync('.devin-tmp-e-tcadm.json', JSON.stringify(tcadmEdits));

// TimeClock.jsx: Ban import, state, cancel handler, cancel button
const tcLocal = local('src/pages/TimeClock.jsx').replace(/\r\n/g, '\n');
const cancelFnStart = tcLocal.indexOf('  const cancelTimeOffRequest = async (request) => {');
const cancelFnEnd = tcLocal.indexOf('  const clearEmployeeSession = useCallback');
if (cancelFnStart < 0 || cancelFnEnd < 0) throw new Error('cancel fn not found');
const cancelFn = tcLocal.slice(cancelFnStart, cancelFnEnd);
const handlerOld = `    setIsLoading(false);\n  };\n\n  const clearEmployeeSession = useCallback`;
const handlerNew = `    setIsLoading(false);\n  };\n\n${cancelFn}  const clearEmployeeSession = useCallback`;
const btnOld = `                          <div className="flex items-center gap-2">\n                            {request.status === "pending" && (\n                              <Button \n                                variant="ghost" \n                                size="sm" \n                                className="h-7 px-2"\n                                onClick={() => setEditingTimeOff(request)}\n                              >\n                                <Pencil className="w-3 h-3" />\n                              </Button>\n                            )}\n                            <Badge className={`;
const btnNew = `                          <div className="flex items-center gap-2">\n                            {request.status === "pending" && (\n                              <Button\n                                variant="ghost"\n                                size="sm"\n                                className="h-7 px-2"\n                                onClick={() => setEditingTimeOff(request)}\n                              >\n                                <Pencil className="w-3 h-3" />\n                              </Button>\n                            )}\n                            {["pending", "approved"].includes(request.status) && (\n                              <Button\n                                variant="ghost"\n                                size="sm"\n                                className="h-7 px-2 text-red-600 hover:bg-red-50"\n                                disabled={cancellingTimeOffId === request.id}\n                                onClick={() => cancelTimeOffRequest(request)}\n                              >\n                                {cancellingTimeOffId === request.id\n                                  ? <Loader2 className="w-3 h-3 animate-spin" />\n                                  : <Ban className="w-3 h-3" />}\n                              </Button>\n                            )}\n                            <Badge className={`;
const tcEdits = [
  {
    old_text: `  Pause,\n  LockKeyhole\n} from "lucide-react";`,
    new_text: `  Pause,\n  LockKeyhole,\n  Ban\n} from "lucide-react";`,
  },
  {
    old_text: `  const [editingTimeOff, setEditingTimeOff] = useState(null);`,
    new_text: `  const [editingTimeOff, setEditingTimeOff] = useState(null);\n  const [cancellingTimeOffId, setCancellingTimeOffId] = useState("");`,
  },
  { old_text: handlerOld, new_text: handlerNew },
  { old_text: btnOld, new_text: btnNew },
].map(e => ({ old_text: crlf(e.old_text), new_text: crlf(e.new_text) }));
// sanity: each new_text must exist in local file
for (const e of tcEdits) {
  if (!tcLocal.includes(e.new_text.replace(/\r\n/g, '\n'))) throw new Error('TimeClock new_text not in local file');
}
writeFileSync('.devin-tmp-e-tc.json', JSON.stringify(tcEdits));

console.log('payloads written');
