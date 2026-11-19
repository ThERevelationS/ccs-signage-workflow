// Agent patch — portal reorder, job messages, drive folders, route sheet,
// attachment plumbing, delivery telemetry, signature capture.
// Runs in the Base44 sandbox (Node 24 ESM). String-surgery with strict anchors.
import fs from "node:fs";

const edits = [];
const file = (path, ...pairs) => edits.push({ path, pairs });
const rep = (oldStr, newStr) => ({ oldStr, newStr });

// ============================================================
// 1) base44/functions/customerPortalAction/entry.ts
// ============================================================
const CPA = "base44/functions/customerPortalAction/entry.ts";

file(CPA,
  // --- helpers: safe URL + job-scoped thread loader ---
  rep(`Deno.serve(async (req) => {
  try {
    const base44 = withEntityRateLimitRetry(createClientFromRequest(req));
    const body = await req.json().catch(() => ({}));
    const action = clean(body?.action);`,
`// Client-supplied attachment links pass through only when they are plain
// http(s) URLs — anything else (javascript:, data:, file:) is dropped.
const safeExternalUrl = (value: any) => {
  const raw = clean(value).slice(0, 4096);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return ["https:", "http:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
};

// Single-job threads: a work_order portal link sees only the messages tagged
// to that job — never the rest of the customer's thread.
async function loadJobThread(PortalMessage: any, workOrderId: string, markRead = false) {
  const rows = await loadAllEntityRows({ entity: PortalMessage, query: { related_kind: "work_order", related_id: workOrderId }, sort: "created_date", label: "Portal job thread" }).catch(() => []);
  const list = (Array.isArray(rows) ? rows : [])
    .filter((m: any) => clean(m?.related_id) === workOrderId)
    .sort((a: any, b: any) => clean(a?.created_date).localeCompare(clean(b?.created_date)));
  if (markRead) {
    for (const m of list) {
      if (clean(m?.author_side) === "staff" && m?.read_by_customer !== true) {
        replaceFoundationFieldsIfUnchanged({
          entity: PortalMessage,
          recordId: clean(m.id),
          expectedFields: expectedFoundationFields(m, { read_by_customer: true }),
          nextFields: { read_by_customer: true },
          label: "Portal job message read receipt",
        }).catch(() => null);
        m.read_by_customer = true;
      }
    }
  }
  return list;
}

Deno.serve(async (req) => {
  try {
    const base44 = withEntityRateLimitRetry(createClientFromRequest(req));
    const body = await req.json().catch(() => ({}));
    const action = clean(body?.action);`),

  // --- work_order bootstrap: include the job-scoped thread ---
  rep(`        const order = await WorkOrder.get(clean(link.record_id)).catch(() => null);
        if (!order?.id || order?.deleted === true) throw bad("The linked job is no longer available.", 404);
        const announcements = await loadPortalAnnouncements(clean(link.customer_id) || clean(order.customer_id) || "");
        return Response.json({
          success: true,
          action,
          kind: "work_order",
          label: clean(link.label),
          expires_at: clean(link.expires_at),
          announcements,
          job: jobPortalView(order),`,
`        const order = await WorkOrder.get(clean(link.record_id)).catch(() => null);
        if (!order?.id || order?.deleted === true) throw bad("The linked job is no longer available.", 404);
        const announcements = await loadPortalAnnouncements(clean(link.customer_id) || clean(order.customer_id) || "");
        const jobThread = await loadJobThread(PortalMessage, clean(order.id), true);
        return Response.json({
          success: true,
          action,
          kind: "work_order",
          label: clean(link.label),
          expires_at: clean(link.expires_at),
          announcements,
          job: jobPortalView(order),
          messages: jobThread.slice(-100).map(messageView),`),

  // --- post_message: widen to work_order links + attachment_url pass-through ---
  rep(`    if (action === "post_message") {
      const link = await resolveLink(PortalLink, clean(body?.token));
      if (clean(link.kind) !== "customer") throw bad("This portal link cannot send messages.", 403);
      const customerId = clean(link.customer_id) || clean(link.record_id);
      const text = clean(body?.body).slice(0, MESSAGE_MAX);
      if (!text) throw bad("A message is required.");
      const relatedKind = clean(body?.related_kind);
      const relatedId = clean(body?.related_id);
      const relatedLabel = clean(body?.related_label).slice(0, 200);
      // Related records must belong to this customer before they can be referenced.
      if (relatedId) {
        const owned = relatedKind === "invoice"
          ? await Invoice.get(relatedId).then((r: any) => clean(r?.customer_id) === customerId).catch(() => false)
          : relatedKind === "estimate"
            ? await Estimate.get(relatedId).then((r: any) => clean(r?.customer_id) === customerId).catch(() => false)
            : relatedKind === "work_order"
              ? await WorkOrder.get(relatedId).then((r: any) => clean(r?.customer_id) === customerId).catch(() => false)
              : false;
        if (!owned) throw bad("That record cannot be referenced from this portal.", 403);
      }
      // Optional file attachment — the customer uploads via the portal composer;
      // stored server-side via UploadFile so the staff thread shows a download link.
      let attachmentUrl = "";
      const attachmentName = clean(body?.attachment_name).slice(0, 255);
      const attachmentB64 = clean(body?.attachment_base64);
      if (attachmentB64) {
        if (!attachmentName) throw bad("An attached file needs a filename.");
        try {
          const file = new File([Uint8Array.from(atob(attachmentB64), (c) => c.charCodeAt(0))], attachmentName, { type: clean(body?.attachment_mime) || "application/octet-stream" });
          const upload = await base44.asServiceRole.integrations.Core.UploadFile({ file });
          attachmentUrl = clean(upload?.file_url || upload?.url);
        } catch (uploadError) {
          throw bad(\`The attached file could not be uploaded: \${uploadError?.message || "upload failed"}\`);
        }
      }`,
`    if (action === "post_message") {
      const link = await resolveLink(PortalLink, clean(body?.token));
      const linkKind = clean(link.kind);
      // work_order links may post too — every message is hard-scoped to the
      // one job the link points at (related_* below is forced, never trusted).
      if (linkKind !== "customer" && linkKind !== "work_order") throw bad("This portal link cannot send messages.", 403);
      const isJobLink = linkKind === "work_order";
      let customerId = clean(link.customer_id) || clean(link.record_id);
      let jobOrder: any = null;
      if (isJobLink) {
        jobOrder = await WorkOrder.get(clean(link.record_id)).catch(() => null);
        if (!jobOrder?.id || jobOrder?.deleted === true) throw bad("The linked job is no longer available.", 404);
        customerId = clean(jobOrder.customer_id) || customerId;
      }
      const text = clean(body?.body).slice(0, MESSAGE_MAX);
      const attachmentB64 = clean(body?.attachment_base64);
      let attachmentUrl = safeExternalUrl(body?.attachment_url);
      if (!text && !attachmentB64 && !attachmentUrl) throw bad("A message is required.");
      let relatedKind = clean(body?.related_kind);
      let relatedId = clean(body?.related_id);
      let relatedLabel = clean(body?.related_label).slice(0, 200);
      if (isJobLink) {
        relatedKind = "work_order";
        relatedId = clean(jobOrder.id);
        relatedLabel = (clean(jobOrder.est_inv_at || jobOrder.work_order_number || jobOrder.corbridge_invoice_number) || clean(jobOrder.title) || "Job").slice(0, 200);
      } else if (relatedId) {
        // Related records must belong to this customer before they can be referenced.
        const owned = relatedKind === "invoice"
          ? await Invoice.get(relatedId).then((r: any) => clean(r?.customer_id) === customerId).catch(() => false)
          : relatedKind === "estimate"
            ? await Estimate.get(relatedId).then((r: any) => clean(r?.customer_id) === customerId).catch(() => false)
            : relatedKind === "work_order"
              ? await WorkOrder.get(relatedId).then((r: any) => clean(r?.customer_id) === customerId).catch(() => false)
              : false;
        if (!owned) throw bad("That record cannot be referenced from this portal.", 403);
      }
      // Optional file attachment — pass an http(s) URL for an already-hosted
      // file, or base64 bytes stored server-side via UploadFile so the staff
      // thread shows a download link.
      const attachmentName = clean(body?.attachment_name).slice(0, 255);
      if (!attachmentUrl && attachmentB64) {
        if (!attachmentName) throw bad("An attached file needs a filename.");
        try {
          const file = new File([Uint8Array.from(atob(attachmentB64), (c) => c.charCodeAt(0))], attachmentName, { type: clean(body?.attachment_mime) || "application/octet-stream" });
          const upload = await base44.asServiceRole.integrations.Core.UploadFile({ file });
          attachmentUrl = clean(upload?.file_url || upload?.url);
        } catch (uploadError) {
          throw bad(\`The attached file could not be uploaded: \${uploadError?.message || "upload failed"}\`);
        }
      }`),

  rep(`          kind: "message",
          body: text,
          attachment_name: attachmentName,`,
`          kind: "message",
          body: text || (attachmentName ? \`[Attachment] \${attachmentName}\` : ""),
          attachment_name: attachmentName,`),

  // --- signature capture on portal quote approval (#251) ---
  rep(`        const saved = await replaceFoundationFieldsIfUnchanged({
          entity: Estimate,
          recordId: estimateId,
          expectedFields: expectedFoundationFields(estimate, { status: "approved" }),
          nextFields: { status: "approved" },
          label: "Portal estimate approval",
        });
        const msg = await createFoundationRecordWithRecovery({
          entity: PortalMessage,
          data: {
            creation_request_key: key,
            customer_id: customerId,
            portal_link_id: clean(link.id),
            author_side: "customer",
            kind: "estimate_approved",
            body: note || \`Approved \${quoteLabel}.\`,`,
`        // Optional drawn signature (#251): the approval form sends a PNG data
        // URL / raw base64. Service-role UploadFile stores it so the acceptance
        // audit carries retrievable evidence; when the upload is unavailable
        // the data URL rides on the approval message itself instead of being
        // dropped — the approval never fails over a signature image.
        let signatureUrl = "";
        let signatureDataUrl = "";
        const sigRaw = clean(body?.signature_image);
        if (sigRaw) {
          const sigB64 = sigRaw.startsWith("data:") ? (sigRaw.split(",")[1] || "") : sigRaw;
          if (sigB64.length > 64 && sigB64.length <= 600000) {
            try {
              const bytes = Uint8Array.from(atob(sigB64), (c: string) => c.charCodeAt(0));
              const file = new File([bytes], \`portal-signature-\${estimateId}-\${Date.now()}.png\`, { type: "image/png" });
              const upload = await base44.asServiceRole.integrations.Core.UploadFile({ file });
              signatureUrl = clean(upload?.file_url || upload?.url);
            } catch (sigError: any) {
              console.error("Portal signature upload failed:", sigError?.message || sigError);
            }
            if (!signatureUrl && sigRaw.startsWith("data:image/") && sigRaw.length <= 600000) signatureDataUrl = sigRaw;
          }
        }
        const signatureAttachment = signatureUrl || signatureDataUrl;
        const saved = await replaceFoundationFieldsIfUnchanged({
          entity: Estimate,
          recordId: estimateId,
          expectedFields: expectedFoundationFields(estimate, { status: "approved" }),
          nextFields: { status: "approved" },
          label: "Portal estimate approval",
        });
        const msg = await createFoundationRecordWithRecovery({
          entity: PortalMessage,
          data: {
            creation_request_key: key,
            customer_id: customerId,
            portal_link_id: clean(link.id),
            author_side: "customer",
            kind: "estimate_approved",
            body: note || \`Approved \${quoteLabel}.\`,
            attachment_name: signatureAttachment ? "signature.png" : "",
            attachment_url: signatureAttachment,
            attachment_mime: signatureAttachment ? "image/png" : "",`),

  rep(`              acceptance_method: "portal",
              evidence_reference: "Customer portal approval",`,
`              acceptance_method: "portal",
              evidence_reference: signatureUrl
                ? \`Portal approval — signature: \${signatureUrl}\`
                : signatureDataUrl
                  ? "Customer portal approval — drawn signature captured on the portal thread"
                  : "Customer portal approval",`),

  // --- new public actions: request_reorder + token-scoped list_thread ---
  rep(`      return Response.json({ success: true, action, change_order_number: coNumber, message: messageView(msg.record) });
    }

    // ---------- Staff actions (session-authenticated) ----------`,
`      return Response.json({ success: true, action, change_order_number: coNumber, message: messageView(msg.record) });
    }

    // Customer-initiated reorder: "order something like this" hands a
    // job's product list to the estimator queue as an EstimatingRequest.
    // Customer links only — scoped to a job the link's customer owns.
    if (action === "request_reorder") {
      const link = await resolveLink(PortalLink, clean(body?.token));
      if (clean(link.kind) !== "customer") throw bad("This portal link cannot request reorders.", 403);
      const customerId = clean(link.customer_id) || clean(link.record_id);
      const workOrderId = clean(body?.work_order_id);
      const order = await WorkOrder.get(workOrderId).catch(() => null);
      if (!order?.id || clean(order.customer_id) !== customerId) throw bad("Job not found.", 404);
      const note = clean(body?.note).slice(0, MESSAGE_MAX);
      const woNumber = clean(order.est_inv_at || order.work_order_number || order.corbridge_invoice_number);
      const woLabel = woNumber || clean(order.title) || "Job";
      const products = (Array.isArray(order?.products) ? order.products : [])
        .filter((p: any) => p && p.deleted !== true)
        .map((p: any) => ({
          description: clean(p?.description || p?.customer_description) || "Item",
          quantity: num(p?.quantity) || null,
          product_type: clean(p?.product_type),
        }));
      const productSummary = products.map((p: any) => \`\${p.quantity > 1 ? \`\${p.quantity}x \` : ""}\${p.description}\`).join("; ").slice(0, 800);
      const key = \`portal-reorder:\${workOrderId}:\${clean(body?.creation_request_key) || crypto.randomUUID()}\`.slice(0, 256);
      const now = new Date().toISOString();
      const result = await createFoundationRecordWithRecovery({
        entity: EstimatingRequest,
        data: {
          creation_request_key: key,
          // EstimatingRequest requires opportunity_id; when the job predates
          // the opportunity migration a namespaced sentinel keeps the request
          // on the estimator queue without colliding with a real opportunity.
          opportunity_id: clean(order.opportunity_id) || \`portal-reorder:\${workOrderId}\`,
          customer_id: customerId,
          compatibility_work_order_id: workOrderId,
          status: "ready",
          requested_at: now,
          submitted_at: now,
          requested_by: "customer_portal",
          priority: "normal",
          request_notes: [note, \`Reorder request for \${woLabel}: \${productSummary || clean(order.title) || "job"}\`].filter(Boolean).join("\\n\\n").slice(0, 2000),
          handoff_snapshot_version: 1,
          handoff_snapshot: {
            snapshot_version: 1,
            source_type: "portal_reorder",
            opportunity_id: clean(order.opportunity_id),
            compatibility_work_order_id: workOrderId,
            work_order_number: woNumber,
            customer_id: customerId,
            customer_display_name: clean(order.client_name) || clean(link.label),
            title: \`Reorder — \${clean(order.title) || woLabel}\`,
            job_description: productSummary,
            products,
            install_location: clean(order.install_location),
            customer_note: note,
            notes: \`Customer requested a reorder of \${woLabel} via the portal.\`,
          },
        },
        readMatches: () => EstimatingRequest.filter({ creation_request_key: key }),
        label: "Portal reorder request",
      });
      logPortalOpportunityActivity(OpportunityActivity, {
        opportunityId: clean(order.opportunity_id),
        eventType: "note",
        summary: \`Customer requested a reorder of \${woLabel} via the portal\`,
        details: { work_order_id: workOrderId, estimating_request_id: clean(result.record?.id), source: "customer_portal" },
        key: \`portal-act:reorder:\${workOrderId}:\${clean(result.record?.id) || key}\`,
      });
      return Response.json({ success: true, action, estimating_request: result.record, reused: result.status !== "created" });
    }

    // Token-scoped thread reads: a work_order link lists only its own job's
    // messages; a customer link lists its own thread (same data bootstrap
    // already returns). Other link kinds cannot read threads.
    if (action === "list_thread" && clean(body?.token)) {
      const link = await resolveLink(PortalLink, clean(body?.token));
      const linkKind = clean(link.kind);
      if (linkKind === "work_order") {
        const order = await WorkOrder.get(clean(link.record_id)).catch(() => null);
        if (!order?.id || order?.deleted === true) throw bad("The linked job is no longer available.", 404);
        const thread = await loadJobThread(PortalMessage, clean(order.id), true);
        return Response.json({ success: true, action, related_kind: "work_order", related_id: clean(order.id), messages: thread.slice(-200).map(messageView) });
      }
      if (linkKind === "customer") {
        const customerId = clean(link.customer_id) || clean(link.record_id);
        const thread = await loadCustomerThread(PortalMessage, customerId, true);
        return Response.json({ success: true, action, messages: thread.slice(-200).map(messageView) });
      }
      throw bad("This portal link cannot list messages.", 403);
    }

    // ---------- Staff actions (session-authenticated) ----------`),
);

// ============================================================
// 2) src/pages/CustomerPortal.jsx
// ============================================================
const CP = "src/pages/CustomerPortal.jsx";

file(CP,
  // --- SignaturePad component (plain canvas + pointer events, no deps) ---
  rep(`function QuoteCard({ quote, onRespond, busy }) {
  const [mode, setMode] = useState("");
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(false);`,
`// Draw-to-sign pad (#251): plain canvas + pointer events. onChange receives a
// PNG data URL when the pad has ink, "" when cleared. Optional — an empty pad
// submits no signature and the approval proceeds exactly as before.
function SignaturePad({ onChange }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);
  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) { ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#1e293b"; }
  }, []);
  const pos = (e) => {
    const c = canvasRef.current;
    const r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) };
  };
  const start = (e) => {
    drawing.current = true;
    const ctx = canvasRef.current.getContext("2d");
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    e.preventDefault();
  };
  const move = (e) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current.getContext("2d");
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    if (!hasInk) setHasInk(true);
    e.preventDefault();
  };
  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    onChange?.(canvasRef.current.toDataURL("image/png"));
  };
  const clear = () => {
    const c = canvasRef.current;
    c.getContext("2d").clearRect(0, 0, c.width, c.height);
    setHasInk(false);
    onChange?.("");
  };
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-emerald-900">Signature (optional)</p>
        {hasInk && <button type="button" onClick={clear} className="text-[11px] font-medium text-slate-500 underline">Clear</button>}
      </div>
      <canvas
        ref={canvasRef}
        width={560}
        height={140}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        className="mt-1 w-full touch-none cursor-crosshair rounded-lg border border-emerald-300 bg-white"
      />
    </div>
  );
}

function QuoteCard({ quote, onRespond, busy }) {
  const [mode, setMode] = useState("");
  const [note, setNote] = useState("");
  const [signature, setSignature] = useState("");
  const [open, setOpen] = useState(false);`),

  rep(`        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-medium text-emerald-900">Approve {quote.estimate_number || "this quote"} for {money(quote.quote_total)}?</p>
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note for the team…"
            className="mt-2 w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm" />
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => onRespond(quote, "approve", note)} disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Confirm approval
            </button>
            <button type="button" onClick={() => { setMode(""); setNote(""); }} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-white">Cancel</button>
          </div>
        </div>`,
`        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-medium text-emerald-900">Approve {quote.estimate_number || "this quote"} for {money(quote.quote_total)}?</p>
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note for the team…"
            className="mt-2 w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm" />
          <SignaturePad onChange={setSignature} />
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => onRespond(quote, "approve", note, undefined, signature || undefined)} disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Confirm approval
            </button>
            <button type="button" onClick={() => { setMode(""); setNote(""); setSignature(""); }} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-white">Cancel</button>
          </div>
        </div>`),

  // --- JobCard: reorder button + confirm panel ---
  rep(`function JobCard({ job, onRequestChange, busy }) {
  const style = JOB_STYLES[job.status] || { label: (job.status || "open").replace(/_/g, " "), cls: "bg-slate-100 text-slate-700" };
  const stepIndex = JOB_STEPS.indexOf(job.status);
  const progress = job.task_progress;
  const pct = progress && progress.total ? Math.round((progress.completed / progress.total) * 100) : (job.status === "completed" ? 100 : stepIndex > 0 ? 50 : 0);
  const [changing, setChanging] = useState(false);
  const [note, setNote] = useState("");`,
`function JobCard({ job, onRequestChange, onReorder, busy }) {
  const style = JOB_STYLES[job.status] || { label: (job.status || "open").replace(/_/g, " "), cls: "bg-slate-100 text-slate-700" };
  const stepIndex = JOB_STEPS.indexOf(job.status);
  const progress = job.task_progress;
  const pct = progress && progress.total ? Math.round((progress.completed / progress.total) * 100) : (job.status === "completed" ? 100 : stepIndex > 0 ? 50 : 0);
  const [changing, setChanging] = useState(false);
  const [note, setNote] = useState("");
  const [reordering, setReordering] = useState(false);
  const [reorderNote, setReorderNote] = useState("");`),

  rep(`      {active && changing && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">What should change on this job? We'll draft a change order for review.</p>
          <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Move the install date, swap the panel color, add a vinyl banner…"
            className="mt-2 w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm" />
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => onRequestChange(job, note)} disabled={busy || !note.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Send request
            </button>
            <button type="button" onClick={() => { setChanging(false); setNote(""); }} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-white">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}`,
`      {active && changing && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">What should change on this job? We'll draft a change order for review.</p>
          <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Move the install date, swap the panel color, add a vinyl banner…"
            className="mt-2 w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm" />
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => onRequestChange(job, note)} disabled={busy || !note.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Send request
            </button>
            <button type="button" onClick={() => { setChanging(false); setNote(""); }} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-white">Cancel</button>
          </div>
        </div>
      )}
      {onReorder && !reordering && (
        <button type="button" onClick={() => setReordering(true)} disabled={busy}
          className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-blue-300 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50">
          <RefreshCw className="h-4 w-4" />Order something like this
        </button>
      )}
      {onReorder && reordering && (
        <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
          <p className="text-sm font-medium text-blue-900">Send this job to estimating as the starting point for a new order?</p>
          <textarea rows={2} value={reorderNote} onChange={(e) => setReorderNote(e.target.value)} placeholder="Anything different this time? (optional)"
            className="mt-2 w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm" />
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => { onReorder(job, reorderNote); setReordering(false); setReorderNote(""); }} disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Send to estimating
            </button>
            <button type="button" onClick={() => { setReordering(false); setReorderNote(""); }} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-white">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}`),

  // --- respond(): forward the signature image on approvals ---
  rep(`  const respond = async (quote, decision, note, section) => {
    setBusy(true);
    try {
      const payload = { action: "estimate_respond", token, estimate_id: quote.id, decision, note, creation_request_key: crypto.randomUUID() };
      if (section?.key) { payload.section_key = section.key; payload.section_label = section.label || ""; }
      await call(payload);`,
`  const respond = async (quote, decision, note, section, signature) => {
    setBusy(true);
    try {
      const payload = { action: "estimate_respond", token, estimate_id: quote.id, decision, note, creation_request_key: crypto.randomUUID() };
      if (section?.key) { payload.section_key = section.key; payload.section_label = section.label || ""; }
      if (signature) payload.signature_image = signature;
      await call(payload);`),

  // --- requestReorder handler ---
  rep(`  const requestJobChange = async (job, note) => {`,
`  const requestReorder = async (job, note) => {
    setBusy(true);
    try {
      await call({ action: "request_reorder", token, work_order_id: job.id, note, creation_request_key: crypto.randomUUID() });
      setToast("Sent to estimating — we'll follow up.");
    } catch (error) {
      setToast(error?.message || "Could not send the reorder request.");
    } finally { setBusy(false); }
  };

  const requestJobChange = async (job, note) => {`),

  // --- jobs tab: wire the reorder prop ---
  rep(`                {jobs.map((j) => <JobCard key={j.id} job={j} onRequestChange={requestJobChange} busy={busy} />)}`,
`                {jobs.map((j) => <JobCard key={j.id} job={j} onRequestChange={requestJobChange} onReorder={requestReorder} busy={busy} />)}`),

  // --- work_order tracker: job-scoped message thread ---
  rep(`                <p className="text-center text-[11px] text-slate-400">Status updates appear here as the job moves — bookmark this link.</p>`,
`                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Messages about this job</p>
                  <Thread messages={data.messages || []} onSend={sendMessage} busy={busy} customerName={data?.label} />
                </div>
                <p className="text-center text-[11px] text-slate-400">Status updates appear here as the job moves — bookmark this link.</p>`),
);

// ============================================================
// 3) base44/functions/googleDriveOperations/entry.ts
// ============================================================
const GDO = "base44/functions/googleDriveOperations/entry.ts";

file(GDO,
  rep(`      case 'listFiles': {`,
`      case 'ensureJobFolder': {
        // One Drive folder per job. Reads the WO's saved folder URL first; on
        // a miss it finds-or-creates "<WO number> <client>" under a root
        // folder — a GlobalSettings driveConfig row wins when present, else a
        // top-level app-created "CCS Jobs" folder — then persists the URL.
        const workOrderId = String(body.work_order_id || '').trim();
        if (!workOrderId) {
          return Response.json({ error: 'work_order_id is required' }, { status: 400 });
        }
        const WorkOrder = base44.asServiceRole.entities.WorkOrder;
        const Settings = base44.asServiceRole.entities.GlobalSettings;
        const order = await WorkOrder.get(workOrderId).catch(() => null);
        if (!order?.id) {
          return Response.json({ error: 'Work order not found' }, { status: 404 });
        }
        const existingUrl = String(order.google_drive_folder_url || '').trim();
        if (existingUrl) {
          return Response.json({ success: true, url: existingUrl, reused: true, work_order_id: order.id });
        }

        const driveListFiles = async (q) => {
          const response = await fetch(
            \`https://www.googleapis.com/drive/v3/files?q=\${encodeURIComponent(q)}&fields=files(id,name,mimeType,webViewLink,parents)&supportsAllDrives=true&includeItemsFromAllDrives=true\`,
            { headers: { 'Authorization': \`Bearer \${accessToken}\` } }
          );
          if (!response.ok) {
            await response.text().catch(() => '');
            throw new Error(\`Google Drive list failed (status \${response.status})\`);
          }
          const data = await response.json();
          return Array.isArray(data?.files) ? data.files : [];
        };
        const driveCreateFolder = async (name, parents) => {
          const response = await fetch('https://www.googleapis.com/drive/v3/files', {
            method: 'POST',
            headers: { 'Authorization': \`Bearer \${accessToken}\`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents }),
          });
          if (!response.ok) {
            await response.text().catch(() => '');
            return null;
          }
          return await response.json();
        };

        // Root folder: GlobalSettings setting_key "driveConfig" (or
        // "googleDriveConfig") may pin jobs_root_folder_id; otherwise
        // find-or-create the shared "CCS Jobs" root at top level.
        let rootId = '';
        for (const key of ['driveConfig', 'googleDriveConfig']) {
          if (rootId) break;
          const cfgRows = await Settings.filter({ setting_key: key }).catch(() => []);
          const cfg = (Array.isArray(cfgRows) ? cfgRows[0]?.setting_value : null) || {};
          const candidate = String(cfg.jobs_root_folder_id || cfg.root_folder_id || cfg.drive_jobs_folder_id || '').trim();
          if (/^[a-zA-Z0-9_-]+$/.test(candidate)) rootId = candidate;
        }
        if (!rootId) {
          const roots = await driveListFiles("name='CCS Jobs' and mimeType='application/vnd.google-apps.folder' and trashed=false");
          rootId = String(roots[0]?.id || '');
          if (!rootId) {
            const createdRoot = await driveCreateFolder('CCS Jobs', []);
            rootId = String(createdRoot?.id || '');
          }
        }
        if (!rootId) {
          return Response.json({ error: 'The CCS Jobs Drive root folder could not be resolved.' }, { status: 502 });
        }

        const safeQueryName = (v) => String(v || '').replace(/[\\\\']/g, ' ').replace(/\\s+/g, ' ').trim();
        const jobName = safeQueryName(body.job_name);
        const woNumber = safeQueryName(order.est_inv_at || order.work_order_number || order.corbridge_invoice_number || order.id);
        const clientName = safeQueryName(order.client_name || order.title);
        const folderName = safeQueryName(jobName || \`\${woNumber} \${clientName}\`).slice(0, 180) || order.id;
        const matches = await driveListFiles(\`name='\${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false and '\${rootId}' in parents\`);
        let folder = matches[0];
        if (!folder) {
          folder = await driveCreateFolder(folderName, [rootId]);
        }
        if (!folder?.id) {
          return Response.json({ error: 'The job Drive folder could not be created.' }, { status: 502 });
        }
        const url = String(folder.webViewLink || \`https://drive.google.com/drive/folders/\${folder.id}\`);

        // Persist only while the field is still empty — a concurrent writer's
        // URL wins over ours rather than being silently replaced.
        const current = await WorkOrder.get(order.id).catch(() => null);
        const raced = String(current?.google_drive_folder_url || '').trim();
        if (raced) {
          return Response.json({ success: true, url: raced, reused: true, work_order_id: order.id });
        }
        await WorkOrder.update(order.id, { google_drive_folder_url: url }).catch((e) => {
          console.error('ensureJobFolder: WorkOrder update failed:', e?.message || e);
        });
        return Response.json({ success: true, url, folder_id: folder.id, root_folder_id: rootId, work_order_id: order.id });
      }

      case 'listFiles': {`),
);

// ============================================================
// 4) src/components/jobs/JobWorkspace.jsx — Drive button
// ============================================================
const JW = "src/components/jobs/JobWorkspace.jsx";

file(JW,
  rep(`  const [statusLinkState, setStatusLinkState] = useState("");
  const copyStatusLink = async () => {`,
`  const [statusLinkState, setStatusLinkState] = useState("");
  const [driveState, setDriveState] = useState("");
  const openDriveFolder = async () => {
    const existing = String(wo?.google_drive_folder_url || "").trim();
    if (existing) { window.open(existing, "_blank", "noopener"); return; }
    if (!sessionToken || !wo?.id || driveState === "busy") return;
    setDriveState("busy");
    try {
      const r = await base44.functions.invoke("googleDriveOperations", { session_token: sessionToken, action: "ensureJobFolder", work_order_id: wo.id });
      const data = r?.data || r;
      const url = String(data?.url || data?.folder?.webViewLink || "");
      if (!url) throw new Error(data?.error || "no url");
      wo.google_drive_folder_url = url;
      refreshAllWorkOrders();
      window.open(url, "_blank", "noopener");
      setDriveState("done");
    } catch { setDriveState("error"); }
    setTimeout(() => setDriveState(""), 3000);
  };
  const copyStatusLink = async () => {`),

  rep(`            <button
              type="button"
              onClick={copyStatusLink}
              title="Copy a no-login customer link that shows only this job's status"
              className="rounded border border-gray-300 px-2 py-1 text-sky-700 hover:bg-sky-50 disabled:opacity-50"
              disabled={!sessionToken || statusLinkState === "busy"}
            >
              {statusLinkState === "copied" ? "Status link copied" : statusLinkState === "error" ? "Link failed" : "Status link"}
            </button>`,
`            <button
              type="button"
              onClick={copyStatusLink}
              title="Copy a no-login customer link that shows only this job's status"
              className="rounded border border-gray-300 px-2 py-1 text-sky-700 hover:bg-sky-50 disabled:opacity-50"
              disabled={!sessionToken || statusLinkState === "busy"}
            >
              {statusLinkState === "copied" ? "Status link copied" : statusLinkState === "error" ? "Link failed" : "Status link"}
            </button>
            <button
              type="button"
              onClick={openDriveFolder}
              title={wo.google_drive_folder_url ? "Open this job's Google Drive folder" : "Find or create this job's Google Drive folder (admin)"}
              className="rounded border border-gray-300 px-2 py-1 text-sky-700 hover:bg-sky-50 disabled:opacity-50"
              disabled={driveState === "busy" || (!wo.google_drive_folder_url && !sessionToken)}
            >
              {driveState === "busy" ? "Drive…" : driveState === "error" ? "Drive failed" : wo.google_drive_folder_url ? "Open Drive" : "Drive"}
            </button>`),
);

// ============================================================
// 5) src/pages/InstallationDeliver.jsx — Route sheet panel
// ============================================================
const ID = "src/pages/InstallationDeliver.jsx";

file(ID,
  rep(`import { useState, useEffect } from "react";`,
`import { useState, useEffect, useMemo } from "react";`),

  rep(`const WorkOrder = staffEntities.WorkOrder;

export default function InstallationDeliver() {`,
`const WorkOrder = staffEntities.WorkOrder;

// Route sheet: upcoming installs from this board grouped by project_install_date
// day (ascending; undated jobs land in "Unscheduled"). Each row links to plain
// Google Maps directions — no API key. window.print() prints it fine.
function InstallRouteSheet({ workOrders }) {
  const [open, setOpen] = useState(false);
  const groups = useMemo(() => {
    const byDay = new Map();
    for (const wo of workOrders || []) {
      const day = String(wo?.project_install_date || "").trim();
      const key = /^\\d{4}-\\d{2}-\\d{2}$/.test(day) ? day : "";
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key).push(wo);
    }
    return [...byDay.entries()]
      .sort((a, b) => (a[0] === "" ? 1 : b[0] === "" ? -1 : a[0].localeCompare(b[0])))
      .map(([day, rows]) => ({ day, rows }));
  }, [workOrders]);
  const count = (workOrders || []).length;
  const timeWindow = (wo) =>
    String(wo?.install_time_window || wo?.install_window || wo?.install_time || wo?.arrival_window || "").trim();
  const address = (wo) =>
    [wo?.install_location, wo?.address_line_2].filter((v) => String(v || "").trim()).join(", ");
  const woNumber = (wo) =>
    String(wo?.est_inv_at || wo?.corbridge_invoice_number || wo?.work_order_number || "").trim();
  return (
    <div className="clay-card mb-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={() => setOpen(!open)} className="text-left">
          <h2 className="text-lg font-bold text-gray-800">Route sheet {open ? "▾" : "▸"}</h2>
          <p className="text-xs text-gray-500">Upcoming installs grouped by install date · {count} job{count === 1 ? "" : "s"} on this board</p>
        </button>
        <button type="button" onClick={() => window.print()} className="rounded border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50">
          Print route sheet
        </button>
      </div>
      {open && (
        <div className="mt-3 space-y-4">
          {count === 0 && <p className="text-sm text-gray-400">No installation jobs on this board yet.</p>}
          {groups.map((g) => (
            <div key={g.day || "unscheduled"}>
              <p className="border-b border-gray-200 pb-1 text-sm font-bold text-gray-700">
                {g.day
                  ? new Date(\`\${g.day}T12:00:00\`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" })
                  : "Unscheduled"}
              </p>
              <ul className="divide-y divide-gray-100">
                {g.rows.map((wo) => {
                  const addr = address(wo);
                  const window_ = timeWindow(wo);
                  return (
                    <li key={wo.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium text-gray-800">
                          {woNumber(wo) && <span className="mr-2 text-gray-500">{woNumber(wo)}</span>}
                          {wo.title || "Work order"}
                          {wo.client_name && wo.client_name !== wo.title ? \` — \${wo.client_name}\` : ""}
                        </p>
                        <p className="text-xs text-gray-500">
                          {addr || "No install address on file"}
                          {window_ ? \` · \${window_}\` : ""}
                        </p>
                      </div>
                      {addr ? (
                        <a
                          href={\`https://www.google.com/maps/dir/?api=1&destination=\${encodeURIComponent(addr)}\`}
                          target="_blank"
                          rel="noreferrer"
                          className="shrink-0 rounded border border-blue-300 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                        >
                          Directions
                        </a>
                      ) : (
                        <span className="shrink-0 text-xs text-gray-300">No address</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function InstallationDeliver() {`),

  rep(`        <StageTasksPanel stage="installation" />

        <div className="clay-card">`,
`        <StageTasksPanel stage="installation" />

        <InstallRouteSheet workOrders={workOrders} />

        <div className="clay-card">`),
);

// ============================================================
// 6) base44/entities/EstimateQuoteDelivery.jsonc — telemetry fields
// ============================================================
const EQD = "base44/entities/EstimateQuoteDelivery.jsonc";

file(EQD,
  rep(`    "delivery_status": {
      "type": "string",
      "enum": [
        "sent"
      ],
      "default": "sent"
    },`,
`    "delivery_status": {
      "type": "string",
      "enum": [
        "sent",
        "failed"
      ],
      "default": "sent"
    },
    "transport": {
      "type": "string",
      "description": "Send-time transport that produced the outcome (gmail_api, smtp)."
    },
    "failure_reason": {
      "type": "string",
      "description": "Send-time failure detail when delivery_status is failed."
    },
    "delivery_events": {
      "type": "array",
      "description": "Append-only send-time event trail (sent/failed + timestamp + transport). Provider webhook/bounce telemetry is unavailable — this is send-time outcome only.",
      "items": {
        "type": "object",
        "properties": {
          "at": {
            "type": "string"
          },
          "outcome": {
            "type": "string"
          },
          "transport": {
            "type": "string"
          },
          "detail": {
            "type": "string"
          }
        },
        "additionalProperties": true
      }
    },
    "telemetry_note": {
      "type": "string",
      "description": "Fixed note marking the telemetry boundary: send-time outcome only; provider webhook/bounce data is unavailable."
    },`),
);

// ============================================================
// 7) base44/functions/recordEstimateQuoteDelivery/entry.ts
// ============================================================
const REQD = "base44/functions/recordEstimateQuoteDelivery/entry.ts";

file(REQD,
  rep(`const QUOTE_APPROVAL_THRESHOLD_KEY = 'quote_approval_threshold';`,
`// Delivery telemetry boundary (#246/#296): this audit records send-time
// outcome only (accepted by transport vs send attempt failed). Neither the
// Gmail API transport nor the SMTP transport exposes a webhook/bounce channel
// to this app, so post-send delivery/bounce data is genuinely unavailable.
const DELIVERY_TELEMETRY_NOTE = 'Send-time outcome only — provider webhook/bounce telemetry is unavailable on this transport.';

const QUOTE_APPROVAL_THRESHOLD_KEY = 'quote_approval_threshold';`),

  rep(`    const estimateId = cleanText(input.estimate_id, 128);
    const quoteVersion = Math.max(0, whole(input.quote_version));
    const recipientEmail = cleanText(input.recipient_email, 320).toLowerCase();
    const gmailMessageId = cleanText(input.gmail_message_id, 512);
    const attachmentSha256 = cleanText(input.attachment_sha256, 128).toLowerCase();
    const sentAt = cleanText(input.sent_at, 64);

    if (!estimateId || !recipientEmail || !gmailMessageId || !sentAt) {
      return Response.json({ error: 'Estimate, recipient, Gmail message id, and sent timestamp are required.' }, { status: 400 });
    }`,
`    const estimateId = cleanText(input.estimate_id, 128);
    const quoteVersion = Math.max(0, whole(input.quote_version));
    const recipientEmail = cleanText(input.recipient_email, 320).toLowerCase();
    const gmailMessageId = cleanText(input.gmail_message_id, 512);
    const attachmentSha256 = cleanText(input.attachment_sha256, 128).toLowerCase();
    const sentAt = cleanText(input.sent_at, 64);
    const deliveryOutcome = cleanText(input.delivery_status, 32) === 'failed' ? 'failed' : 'sent';
    const failureReason = cleanText(input.failure_reason, 500);
    const transport = cleanText(input.transport, 40) || 'gmail_api';

    if (!estimateId || !recipientEmail || !sentAt) {
      return Response.json({ error: 'Estimate, recipient, and sent timestamp are required.' }, { status: 400 });
    }
    if (deliveryOutcome === 'sent' && !gmailMessageId) {
      return Response.json({ error: 'Estimate, recipient, Gmail message id, and sent timestamp are required.' }, { status: 400 });
    }`),

  rep(`    const idempotencyKey = \`quote_delivery:gmail:\${gmailMessageId}\`;`,
`    // Failed send attempts are immutable audit rows too (#246/#296): no
    // Gmail message id exists, so attempts dedupe on attempt_key/sent_at and
    // skip the send-authorization backstop (the send already failed — this
    // write only records that outcome; it never marks anything sent).
    if (deliveryOutcome === 'failed') {
      const attemptKey = \`quote_delivery_attempt:\${estimateId}:\${quoteVersion}:\${cleanText(input.attempt_key, 120) || \`\${recipientEmail}:\${sentAt}\`}\`;
      const existingAttempts = await Delivery.filter({ idempotency_key: attemptKey }).catch(() => []);
      if (Array.isArray(existingAttempts) && existingAttempts.length) {
        return Response.json({ delivery: existingAttempts[0], reused: true });
      }
      const priorAttempts = await Delivery.filter({ quote_issue_key: estimateQuoteIssueKey(estimateId, quoteVersion) }).catch(() => []);
      const attemptRow = {
        estimate_id: estimateId,
        idempotency_key: attemptKey,
        work_order_id: cleanText(estimate.work_order_id || input.work_order_id, 128),
        quote_issue_key: estimateQuoteIssueKey(estimateId, quoteVersion),
        quote_version: quoteVersion,
        quote_issue_date: cleanText(input.quote_issue_date, 32),
        quote_valid_days: Math.max(0, whole(input.quote_valid_days, 30)),
        quote_expiration_date: cleanText(input.quote_expiration_date, 32),
        quote_total: Number.isFinite(Number(input.quote_total)) ? Number(input.quote_total) : 0,
        recipient_email: recipientEmail,
        cc_emails: cleanText(input.cc_emails, 998),
        bcc_emails: cleanText(input.bcc_emails, 998),
        subject: cleanText(input.subject, 998),
        delivery_method: 'email',
        delivery_status: 'failed',
        sent_at: new Date(sentAt).toISOString(),
        gmail_message_id: '',
        attachment_filename: cleanText(input.attachment_filename, 255),
        is_resend: input.is_resend === true,
        delivery_n: (Array.isArray(priorAttempts) ? priorAttempts.filter((r: any) => r?.deleted !== true).length : 0) + 1,
        source_status: cleanText(input.source_status, 64),
        transport,
        failure_reason: failureReason || 'send failed',
        delivery_events: [{ at: new Date(sentAt).toISOString(), outcome: 'failed', transport, detail: failureReason || 'send failed' }],
        telemetry_note: DELIVERY_TELEMETRY_NOTE,
      };
      const createdAttempt = await Delivery.create(attemptRow).catch(() => null);
      await new Promise((resolve) => setTimeout(resolve, 50));
      const verifyAttempts = await Delivery.filter({ idempotency_key: attemptKey }).catch(() => []);
      const attempt = createdAttempt?.id ? createdAttempt : (Array.isArray(verifyAttempts) ? verifyAttempts[0] : null);
      if (!attempt?.id) {
        throw new Error('Quote delivery attempt audit could not be created or verified.');
      }
      return Response.json({ delivery: attempt, attempted: true, reused: !createdAttempt?.id });
    }

    const idempotencyKey = \`quote_delivery:gmail:\${gmailMessageId}\`;`),

  rep(`      is_resend: input.is_resend === true,
      source_status: cleanText(input.source_status, 64),
    };`,
`      is_resend: input.is_resend === true,
      source_status: cleanText(input.source_status, 64),
      transport,
      failure_reason: '',
      delivery_events: [{ at: new Date(sentAt).toISOString(), outcome: 'sent', transport, detail: \`accepted by \${transport}\` }],
      telemetry_note: DELIVERY_TELEMETRY_NOTE,
    };`),
);

// ============================================================
// 8) src/components/estimator/quoteDeliveryService.js
// ============================================================
const QDS = "src/components/estimator/quoteDeliveryService.js";

file(QDS,
  rep(`export async function ensureQuoteDeliveryAudit(data = {}, sessionToken = "") {`,
`// Best-effort send-time failure telemetry (#246/#296): a failed quote email
// still lands on EstimateQuoteDelivery with delivery_status "failed" so the
// delivery history shows the attempt. Provider webhook/bounce data is
// unavailable — this is send-time outcome only. Never throws.
export async function recordQuoteDeliveryAttempt(data = {}, sessionToken = "") {
  try {
    const response = await base44.functions.invoke("recordEstimateQuoteDelivery", {
      session_token: sessionToken,
      delivery: { ...data, delivery_status: "failed" },
    });
    const result = response?.data || response;
    return result?.delivery || null;
  } catch {
    return null;
  }
}

export async function ensureQuoteDeliveryAudit(data = {}, sessionToken = "") {`),

  rep(`  const archive = await archiveQuoteAttachment(attachment);
  const response = await sendGmail({
    to: recipientEmail,
    cc: ccEmails || "",
    bcc: bccEmails || "",
    subject,
    body: quoteEmailBodyHtml(message, emailSignature),
    attachments: [attachment],
  });
  const payload = response?.data || response || {};
  if (payload.error || payload.success === false) {
    throw new Error(payload.error || "Quote email could not be sent.");
  }

  const messageId = payload.messageId || "";
  const sentAt = new Date().toISOString();
  const normalizedQuoteVersion = Math.max(0, Math.floor(Number(quoteVersion || 0)));`,
`  const archive = await archiveQuoteAttachment(attachment);
  const normalizedQuoteVersion = Math.max(0, Math.floor(Number(quoteVersion || 0)));
  let response;
  try {
    response = await sendGmail({
      to: recipientEmail,
      cc: ccEmails || "",
      bcc: bccEmails || "",
      subject,
      body: quoteEmailBodyHtml(message, emailSignature),
      attachments: [attachment],
    });
  } catch (sendError) {
    response = { data: { error: sendError?.message || "Quote email could not be sent." } };
  }
  const payload = response?.data || response || {};
  if (payload.error || payload.success === false) {
    // Record the failed attempt before surfacing the error (#246/#296).
    await recordQuoteDeliveryAttempt({
      estimate_id: estimate.id,
      work_order_id: estimate.work_order_id || "",
      quote_version: normalizedQuoteVersion,
      quote_issue_date: quoteIssueDate || "",
      quote_valid_days: Math.max(0, Math.floor(Number(quoteValidDays || 0))),
      quote_expiration_date: quoteExpirationDate(quoteIssueDate, quoteValidDays),
      quote_total: Number(quoteTotal || 0),
      recipient_email: recipientEmail,
      cc_emails: String(ccEmails || ""),
      bcc_emails: String(bccEmails || ""),
      subject,
      sent_at: new Date().toISOString(),
      transport: "gmail_api",
      failure_reason: String(payload.error || "Quote email could not be sent.").slice(0, 500),
      attachment_filename: attachment?.filename || "",
      attempt_key: \`attempt:\${estimate.id}:\${Date.now()}\`,
      is_resend: !!isResend,
      source_status: sourceStatus || estimate.status || "",
    }, sessionToken);
    throw new Error(payload.error || "Quote email could not be sent.");
  }

  const messageId = payload.messageId || "";
  const sentAt = new Date().toISOString();`),

  rep(`    delivery_method: "email",
    delivery_status: "sent",
    sent_at: sentAt,`,
`    delivery_method: "email",
    delivery_status: "sent",
    transport: "gmail_api",
    sent_at: sentAt,`),
);

// ============================================================
// Apply
// ============================================================
let applied = 0;
for (const { path, pairs } of edits) {
  let text = fs.readFileSync(path, "utf8");
  for (const { oldStr, newStr } of pairs) {
    const count = text.split(oldStr).length - 1;
    if (count !== 1) {
      console.error(`ANCHOR MISS (${count}x) in ${path}:\n---\n${oldStr.slice(0, 220)}\n---`);
      process.exitCode = 1;
      continue;
    }
    text = text.replace(oldStr, newStr);
    applied += 1;
  }
  fs.writeFileSync(path, text);
}
console.log(`Applied ${applied} edits across ${edits.length} files.`);
