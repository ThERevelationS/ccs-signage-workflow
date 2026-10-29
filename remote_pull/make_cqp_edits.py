import json

edits = []

# 1. lucide import — add ShieldCheck
edits.append({
    "old_text": 'import { Loader2, Mail, Printer, RefreshCw, Settings2 } from "lucide-react";',
    "new_text": 'import { Loader2, Mail, Printer, RefreshCw, Settings2, ShieldCheck } from "lucide-react";',
})

# 2. service import — add approveEstimateQuote
edits.append({
    "old_text": 'import { defaultQuoteEmailMessage, defaultQuoteEmailSubject, deliverEstimateQuote } from "./quoteDeliveryService";',
    "new_text": 'import { approveEstimateQuote, defaultQuoteEmailMessage, defaultQuoteEmailSubject, deliverEstimateQuote } from "./quoteDeliveryService";',
})

# 3. new imports after loadAllEntityRows
edits.append({
    "old_text": 'import { loadAllEntityRows } from "./loadAllEntityRows";',
    "new_text": 'import { loadAllEntityRows } from "./loadAllEntityRows";\nimport { staffEntities } from "@/components/staff/staffEntities";\nimport { loadSingleGlobalSetting } from "@/components/shared/globalSettingsPersistence";\nimport { getSessionUser } from "@/components/auth/EmailGate";',
})

# 4. approval helpers after defaultBool
edits.append({
    "old_text": 'const defaultBool = (estimate, key, fallback = true) => estimate[key] === undefined || estimate[key] === null ? fallback : estimate[key] !== false;',
    "new_text": '''const defaultBool = (estimate, key, fallback = true) => estimate[key] === undefined || estimate[key] === null ? fallback : estimate[key] !== false;

const DEFAULT_QUOTE_APPROVAL_THRESHOLD = 5000;
const QUOTE_APPROVAL_THRESHOLD_KEY = "quote_approval_threshold";

const thresholdFromSetting = (record) => {
  const raw = record?.setting_value;
  const parsed = Number(raw?.threshold ?? raw?.value ?? raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_QUOTE_APPROVAL_THRESHOLD;
};

const recordedApproval = (estimate) => {
  const approval = estimate?.internal_approval;
  if (!approval || typeof approval !== "object" || Array.isArray(approval)) return null;
  if (!approval.approved_at && !approval.approved_by_email && !approval.approved_by_user_id) return null;
  return approval;
};

// An approval recorded at a lower total does not cover a quote whose total has
// since grown past the approved amount; it must be approved again.
const approvalCoversQuote = (estimate, total) => {
  const approval = recordedApproval(estimate);
  if (!approval) return false;
  const approvedTotal = Number(approval?.quote_total_at_approval);
  if (Number.isFinite(approvedTotal) && approvedTotal > 0 && total > approvedTotal + 0.005) return false;
  return true;
};''',
})

# 5. state additions
edits.append({
    "old_text": '  const [applyingDefaults, setApplyingDefaults] = useState(false);',
    "new_text": '''  const [applyingDefaults, setApplyingDefaults] = useState(false);
  const [quoteApprovalThreshold, setQuoteApprovalThreshold] = useState(DEFAULT_QUOTE_APPROVAL_THRESHOLD);
  const [sessionCanApproveQuotes, setSessionCanApproveQuotes] = useState(false);
  const [approvingQuote, setApprovingQuote] = useState(false);''',
})

# 6. mount effect after the deliveries effect
edits.append({
    "old_text": '''    return () => { active = false; };
  }, [estimate?.id, quoteVersion, issuingNewQuote]);

  const emailActionLabel = issuingNewQuote || !currentVersionDelivered ? "Send Quote" : "Resend Quote";''',
    "new_text": '''    return () => { active = false; };
  }, [estimate?.id, quoteVersion, issuingNewQuote]);

  // Load the internal quote-approval threshold and whether the signed-in user
  // may approve over-threshold quotes. The gate is enforced server-side; these
  // reads only drive the send button state and the Approve control.
  useEffect(() => {
    let active = true;
    const sessionEmail = String(getSessionUser()?.email || "").trim().toLowerCase();
    Promise.all([
      loadSingleGlobalSetting({ entity: staffEntities.GlobalSettings, settingKey: QUOTE_APPROVAL_THRESHOLD_KEY, label: "Quote approval threshold" }).catch(() => null),
      sessionEmail ? staffEntities.AuthorizedEmail.filter({ email: sessionEmail }).catch(() => []) : Promise.resolve([]),
    ]).then(([setting, users]) => {
      if (!active) return;
      setQuoteApprovalThreshold(thresholdFromSetting(setting));
      setSessionCanApproveQuotes((users || []).some((row) => row?.can_approve_quotes === true));
    });
    return () => { active = false; };
  }, []);

  const emailActionLabel = issuingNewQuote || !currentVersionDelivered ? "Send Quote" : "Resend Quote";
  const quoteTotalNow = Number(pricing?.quoteTotal ?? estimate.quote_total ?? 0);
  const overApprovalThreshold = quoteTotalNow > quoteApprovalThreshold;
  const quoteApproval = recordedApproval(estimate);
  const quoteApprovalSatisfied = approvalCoversQuote(estimate, quoteTotalNow);
  const sendNeedsApproval = overApprovalThreshold && !quoteApprovalSatisfied;
  const approvalThresholdLabel = fmt(quoteApprovalThreshold, true);
  const approvalWhenLabel = quoteApproval?.approved_at && Number.isFinite(Date.parse(quoteApproval.approved_at))
    ? new Date(quoteApproval.approved_at).toLocaleString()
    : "";''',
})

# 7. approveQuote handler before const set
edits.append({
    "old_text": '''  const set = (key, value) => onChange?.({ [key]: value });''',
    "new_text": '''  const approveQuote = async () => {
    if (approvingQuote || !sessionCanApproveQuotes || !sendNeedsApproval) return;
    setApprovingQuote(true);
    try {
      if (!String(sessionToken || "").trim()) {
        throw new Error("Your sign-shop session is no longer available. Sign in again before approving a quote.");
      }
      const result = await approveEstimateQuote({ estimateId: estimate.id, quoteTotal: quoteTotalNow, sessionToken });
      const approval = result?.internal_approval;
      if (!approval?.approved_at) throw new Error("Quote approval could not be verified.");
      onChange?.({ internal_approval: approval });
    } catch (error) {
      window.alert(error?.message || "Quote approval could not be recorded.");
    } finally {
      setApprovingQuote(false);
    }
  };

  const set = (key, value) => onChange?.({ [key]: value });''',
})

# 8. send button: approve button + disabled/title
edits.append({
    "old_text": '''          <Button
            type="button"
            onClick={() => openSendDialog().catch((e) => setSendError(e?.message || "Could not open the send dialog."))}
            disabled={!canEmailQuote || sending}
            title={revisionInProgress ? "Save the open revision before emailing the customer quote." : persistedStatus === "cancelled" ? "Cancelled estimates cannot be emailed." : !issuingNewQuote && quoteVersion === 0 ? "This protected estimate has no issued customer quote version to send." : issuingNewQuote ? "Email this quote as the next issued customer version." : currentVersionDelivered ? "Email the currently issued quote version again." : "Email the currently issued quote version for the first time."}''',
    "new_text": '''          {sendNeedsApproval && sessionCanApproveQuotes && !readOnly && (
            <Button
              type="button"
              variant="outline"
              onClick={approveQuote}
              disabled={approvingQuote}
              title={`Record your manager approval for this ${fmt(quoteTotalNow)} quote so it can be emailed.`}
              className="h-[31px] text-[11px]"
            >
              {approvingQuote ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />}
              {approvingQuote ? "Approving…" : "Approve Quote"}
            </Button>
          )}
          <Button
            type="button"
            onClick={() => openSendDialog().catch((e) => setSendError(e?.message || "Could not open the send dialog."))}
            disabled={!canEmailQuote || sending || sendNeedsApproval}
            title={sendNeedsApproval ? `Over ${approvalThresholdLabel} — manager approval required` : revisionInProgress ? "Save the open revision before emailing the customer quote." : persistedStatus === "cancelled" ? "Cancelled estimates cannot be emailed." : !issuingNewQuote && quoteVersion === 0 ? "This protected estimate has no issued customer quote version to send." : issuingNewQuote ? "Email this quote as the next issued customer version." : currentVersionDelivered ? "Email the currently issued quote version again." : "Email the currently issued quote version for the first time."}''',
})

# 9. approval banner after header
edits.append({
    "old_text": '''        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[390px_minmax(0,1fr)]">''',
    "new_text": '''        </div>
      </div>

      {quoteApproval && (
        <div className="no-print px-4 py-2 border-b border-emerald-200 bg-emerald-50 text-[10px] text-emerald-800 flex items-center gap-2">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Manager approval recorded{quoteApproval.approved_by_email ? ` by ${quoteApproval.approved_by_email}` : ""}{approvalWhenLabel ? ` on ${approvalWhenLabel}` : ""}{Number(quoteApproval.threshold_at_approval) > 0 ? ` (threshold ${fmt(quoteApproval.threshold_at_approval, true)})` : ""}.</span>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[390px_minmax(0,1fr)]">''',
})

# 10. threshold line in send dialog
edits.append({
    "old_text": '''            <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-[10px] text-gray-600">
              <strong>Attachment:</strong> Customer quote PDF · {issuingNewQuote ? `next version ${Math.max(1, quoteVersion + 1)}` : `Version ${quoteVersion}`}
            </div>''',
    "new_text": '''            <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-[10px] text-gray-600">
              <strong>Attachment:</strong> Customer quote PDF · {issuingNewQuote ? `next version ${Math.max(1, quoteVersion + 1)}` : `Version ${quoteVersion}`}
            </div>
            <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-[10px] text-gray-600">
              <strong>Internal approval threshold:</strong> {approvalThresholdLabel}{overApprovalThreshold ? (quoteApprovalSatisfied ? ` — approval recorded${quoteApproval?.approved_by_email ? ` by ${quoteApproval.approved_by_email}` : ""}` : " — manager approval required") : ""}
            </div>''',
})

with open('remote_pull/cqp_edits.json', 'w', encoding='utf-8') as f:
    json.dump(edits, f)
print('ok', len(edits))
