import json

helpers = """export async function authorizeEstimateQuoteSend({ estimateId, quoteTotal, sessionToken }) {
  const estimateKey = String(estimateId || "").trim();
  if (!estimateKey) throw new Error("The estimate must be saved before its quote can be emailed.");
  let response;
  try {
    response = await base44.functions.invoke("recordEstimateQuoteDelivery", {
      session_token: sessionToken,
      action: "authorize_send",
      estimate_id: estimateKey,
      quote_total: Number(quoteTotal || 0),
    });
  } catch (error) {
    throw new Error(error?.response?.data?.error || error?.data?.error || error?.message || "Quote send authorization could not be verified.");
  }
  const result = response?.data || response;
  if (result?.error) throw new Error(result.error);
  if (result?.allowed !== true) throw new Error("This quote is not approved for sending.");
  return result;
}

export async function approveEstimateQuote({ estimateId, quoteTotal, sessionToken }) {
  const estimateKey = String(estimateId || "").trim();
  if (!estimateKey) throw new Error("The estimate must be saved before its quote can be approved.");
  let response;
  try {
    response = await base44.functions.invoke("recordEstimateQuoteDelivery", {
      session_token: sessionToken,
      action: "approve_quote",
      estimate_id: estimateKey,
      quote_total: Number(quoteTotal || 0),
    });
  } catch (error) {
    throw new Error(error?.response?.data?.error || error?.data?.error || error?.message || "Quote approval could not be recorded.");
  }
  const result = response?.data || response;
  if (result?.error) throw new Error(result.error);
  if (!result?.success || !result?.internal_approval?.approved_at) {
    throw new Error("Quote approval could not be verified.");
  }
  return result;
}

export async function deliverEstimateQuote({"""

gate_old = """  // Archive the exact bytes before sending so every successful email has a
  // retrievable source artifact. If archival fails, Gmail is not called.
  const archive = await archiveQuoteAttachment(attachment);"""
gate_new = """  // Internal approval gate: a quote over the configured threshold cannot be
  // emailed until a manager approves it. This server-side check runs before the
  // PDF is archived and before Gmail is invoked so a blocked quote never sends.
  await authorizeEstimateQuoteSend({ estimateId: estimate?.id, quoteTotal, sessionToken });
  // Archive the exact bytes before sending so every successful email has a
  // retrievable source artifact. If archival fails, Gmail is not called.
  const archive = await archiveQuoteAttachment(attachment);"""

edits = [
    {"old_text": "export async function deliverEstimateQuote({", "new_text": helpers},
    {"old_text": gate_old, "new_text": gate_new},
]
with open('remote_pull/qds_edits.json', 'w', encoding='utf-8') as f:
    json.dump(edits, f)
print('ok')
