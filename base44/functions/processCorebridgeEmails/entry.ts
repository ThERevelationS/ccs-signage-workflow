import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { loadAllEntityRows } from '../../shared/pagedEntityRows.ts';
import { expectedWorkOrderFields, replaceWorkOrderFieldsIfUnchanged } from '../../shared/workOrderFieldPersistence.mjs';
import { ensureConvergentPendingImportCreate } from '../../shared/pendingImportCreatePersistence.mjs';
import { createWorkOrderWithRecovery } from '../../shared/workOrderCreatePersistence.mjs';
import { loadGlobalSettingSingleton } from '../../shared/globalSettingSingleton.ts';

// Normalize a string for fuzzy comparison
function normalize(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

// Compute fuzzy match score (0-100) between imported data and an existing work order
function computeMatchScore(extracted, wo) {
  let score = 0;
  const reasons = [];

  const normClient = normalize(extracted.client_name);
  const normWoClient = normalize(wo.client_name);
  const normTitle = normalize(extracted.description || extracted.client_name);
  const normWoTitle = normalize(wo.title);

  // Client name similarity
  if (normClient && normWoClient) {
    if (normClient === normWoClient) { score += 40; reasons.push('Exact client name match'); }
    else if (normWoClient.includes(normClient) || normClient.includes(normWoClient)) { score += 25; reasons.push('Partial client name match'); }
    else {
      // Word overlap
      const clientWords = normClient.split(' ').filter(w => w.length > 2);
      const woWords = normWoClient.split(' ').filter(w => w.length > 2);
      const overlap = clientWords.filter(w => woWords.includes(w)).length;
      if (overlap > 0) { score += Math.min(15, overlap * 7); reasons.push(`${overlap} shared client name word(s)`); }
    }
  }

  // Title / description similarity
  if (normTitle && normWoTitle) {
    if (normTitle === normWoTitle) { score += 30; reasons.push('Exact title/description match'); }
    else if (normWoTitle.includes(normTitle) || normTitle.includes(normWoTitle)) { score += 15; reasons.push('Partial title match'); }
    else {
      const titleWords = normTitle.split(' ').filter(w => w.length > 2);
      const woTitleWords = normWoTitle.split(' ').filter(w => w.length > 2);
      const overlap = titleWords.filter(w => woTitleWords.includes(w)).length;
      if (overlap > 0) { score += Math.min(10, overlap * 4); reasons.push(`${overlap} shared title word(s)`); }
    }
  }

  // Address match
  const normAddr = normalize(extracted.install_location || extracted.billing_address);
  const normWoAddr = normalize(wo.install_location || wo.billing_address);
  if (normAddr && normWoAddr && normAddr.length > 5 && (normAddr === normWoAddr || normAddr.includes(normWoAddr) || normWoAddr.includes(normAddr))) {
    score += 20; reasons.push('Address match');
  }

  // Amount similarity (within 10%)
  if (extracted.quoted_amount && wo.quoted_amount) {
    const diff = Math.abs(extracted.quoted_amount - wo.quoted_amount) / Math.max(extracted.quoted_amount, wo.quoted_amount);
    if (diff < 0.05) { score += 15; reasons.push('Very close quote amount'); }
    else if (diff < 0.10) { score += 8; reasons.push('Similar quote amount'); }
  }

  // Contact name/email
  if (extracted.contact_email && wo.contact_email && normalize(extracted.contact_email) === normalize(wo.contact_email)) {
    score += 15; reasons.push('Contact email match');
  }
  if (extracted.contact_name && wo.contact_name && normalize(extracted.contact_name) === normalize(wo.contact_name)) {
    score += 10; reasons.push('Contact name match');
  }

  // Penalize if existing WO already has a doc number (already linked)
  if (wo.est_inv_at || wo.corbridge_invoice_number) {
    score -= 20;
  }

  return { score: Math.max(0, Math.min(100, score)), reasons };
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  // Scheduled invocations arrive without a request payload. Any caller that
  // supplies a payload is using the manual/admin path and must be authenticated
  // as an admin before this service-role importer can touch Gmail or production
  // WorkOrder/PendingImport data.
  let requestBody: Record<string, unknown> = {};
  try {
    requestBody = await req.clone().json();
  } catch (_) {}
  const isManualRequest = requestBody && Object.keys(requestBody).length > 0;
  if (isManualRequest) {
    const user = await base44.auth.me().catch(() => null);
    if (!user) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }
    if (user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }
  }

  const WorkOrder = base44.asServiceRole.entities.WorkOrder;
  const CorebridgeLog = base44.asServiceRole.entities.CorebridgeLog;
  const PendingImport = base44.asServiceRole.entities.PendingImport;
  const writeRunLogBestEffort = async (data: any) => {
    try {
      await CorebridgeLog.create(data);
      return true;
    } catch (logError) {
      console.error('CoreBridge run log could not be persisted:', logError);
      return false;
    }
  };

  // Preserve existing scheduled/manual run labeling using the already-parsed body.
  const triggerType = isManualRequest ? 'manual' : 'scheduled';

  const runAt = new Date().toISOString();
  const logData = {
    run_at: runAt,
    trigger: triggerType,
    emails_found: 0,
    processed: 0,
    status: 'success',
    results: [],
    debug_info: ''
  };

  try {
    // Load the CoreBridge business-routing settings as a true singleton. If a
    // duplicate setting row ever exists, fail closed instead of arbitrarily using
    // whichever record the datastore returns first.
    const settingsRecord = await loadGlobalSettingSingleton({
      entity: base44.asServiceRole.entities.GlobalSettings,
      settingKey: 'corebridgeAI',
      label: 'CoreBridge AI settings',
    });
    const cfg = settingsRecord?.setting_value || {};

    if (cfg.enabled === false) {
      logData.status = 'no_emails';
      logData.debug_info = 'Importer is disabled in settings.';
      await writeRunLogBestEffort(logData);
      return Response.json({ success: true, message: "CoreBridge AI importer is disabled", processed: 0 });
    }

    // Only scan emails from the last 24 hours to prevent reprocessing old emails
    const baseGmailQuery = cfg.gmail_query || 'subject:"Your Sign Estimate" OR subject:"Your Sign Invoice" is:unread';
    const gmailQuery = baseGmailQuery.includes('newer_than') ? baseGmailQuery : `(${baseGmailQuery}) newer_than:1d`;
    const estPattern = (cfg.estimate_subject_pattern || 'EST').toUpperCase();
    const invPattern = (cfg.invoice_subject_pattern || 'INV').toUpperCase();
    const maxEmails = cfg.max_emails_per_run || 3;
    const estimateStage = cfg.estimate_stage || 'sales';
    const estimateSalesStatus = cfg.estimate_sales_status || 'quoted';
    const invoiceStage = cfg.invoice_stage || 'production';
    const invoiceSalesStatus = cfg.invoice_sales_status || 'won';
    const estToInvStage = cfg.est_to_inv_stage || 'production';
    const estToInvSalesStatus = cfg.est_to_inv_sales_status || 'won';
    const titleFormat = cfg.title_format || 'description';
    const aiPromptExtra = cfg.ai_prompt_extra || '';

    const { accessToken } = await base44.asServiceRole.connectors.getConnection("gmail");

    const searchUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(gmailQuery)}&maxResults=${maxEmails}`;
    const searchRes = await fetch(searchUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    const searchData = await searchRes.json();

    console.log('Gmail search URL:', searchUrl);
    console.log('Gmail search response:', JSON.stringify(searchData));

    logData.debug_info = `Gmail query: "${gmailQuery}" | HTTP status: ${searchRes.status} | Found: ${searchData.messages?.length ?? 0} | Raw response keys: ${Object.keys(searchData).join(', ')}`;

    if (!searchData.messages || searchData.messages.length === 0) {
      // Also try a broader search to help diagnose
      const broadUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent('from:noreply@corebridge.net')}&maxResults=5`;
      const broadRes = await fetch(broadUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
      const broadData = await broadRes.json();
      console.log('Broad search (from corebridge):', JSON.stringify(broadData));
      logData.debug_info += ` | Broad search (from corebridge) found: ${broadData.messages?.length ?? 0}`;

      logData.status = 'no_emails';
      await writeRunLogBestEffort(logData);
      return Response.json({ success: true, message: "No new CoreBridge emails found", processed: 0, results: [], debug: logData.debug_info });
    }

    logData.emails_found = searchData.messages.length;
    let processed = 0;
    const results = [];
    const RUN_START = Date.now();
    const MAX_RUN_MS = 55_000; // leave ~5s buffer before 60s timeout

    // Pre-load the complete existing Work Order and pending-import sets once
    // (not inside the loop). Fail closed before processing any email if either
    // catalog cannot be verified completely.
    const allExistingOrders = await loadAllEntityRows({
      entity: WorkOrder,
      query: { deleted: { $ne: true } },
      sort: 'created_date',
      label: 'CoreBridge existing Work Orders',
    });

    const pendingImports = await loadAllEntityRows({
      entity: PendingImport,
      sort: 'created_date',
      label: 'CoreBridge pending imports',
    });
    const pendingImportDocNumbers = new Set(
      pendingImports.map(p => p.doc_number).filter(Boolean)
    );

    // Build a Set of already-linked doc numbers from existing work orders (for O(1) lookup)
    const linkedDocNumbers = new Set();
    for (const wo of allExistingOrders) {
      if (wo.est_inv_at) linkedDocNumbers.add(wo.est_inv_at.trim().toUpperCase());
      if (wo.corbridge_invoice_number) linkedDocNumbers.add(wo.corbridge_invoice_number.trim().toUpperCase());
    }

    // Track doc numbers processed in THIS run to avoid intra-run duplicates
    const processedDocNumbers = new Set();

    for (const msg of searchData.messages) {
      // Stop processing if we're running low on time
      if (Date.now() - RUN_START > MAX_RUN_MS) {
        results.push({ action: 'skipped', skipped_reason: 'Time budget exhausted, remaining emails will be picked up next run' });
        break;
      }
      try {
        const msgRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        const msgData = await msgRes.json();

        const headers = msgData.payload?.headers || [];
        const subject = headers.find(h => h.name === 'Subject')?.value || '';

        const estRegex = new RegExp(`${estPattern}-(\\d+)`, 'i');
        const invRegex = new RegExp(`${invPattern}-(\\d+)`, 'i');
        const estMatch = subject.match(estRegex);
        const invMatch = subject.match(invRegex);
        const docNumber = estMatch ? `${estPattern}-${estMatch[1]}` : invMatch ? `${invPattern}-${invMatch[1]}` : null;
        const docType = estMatch ? 'estimate' : invMatch ? 'invoice' : null;
        const docNumericId = estMatch ? estMatch[1] : invMatch ? invMatch[1] : null;

        if (!docNumber || !docType) {
          results.push({ action: 'skipped', subject, skipped_reason: 'No EST/INV doc number found in subject' });
          continue;
        }

        // Skip if we already processed this doc number in this run
        if (processedDocNumbers.has(docNumber)) {
          results.push({ action: 'skipped', subject, docNumber, skipped_reason: 'Duplicate email for same doc number in this run' });
          await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}/modify`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ removeLabelIds: ['UNREAD'] })
          });
          continue;
        }
        processedDocNumbers.add(docNumber);

        // === EARLY DEDUP CHECKS (before AI processing to save credits) ===
        // Uses pre-loaded sets — NO extra DB queries per email

        // 1. Check if already in PendingImport queue
        if (pendingImportDocNumbers.has(docNumber.toUpperCase())) {
          results.push({ action: 'skipped', subject, docNumber, skipped_reason: 'Already in pending queue' });
          await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}/modify`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ removeLabelIds: ['UNREAD'] })
          });
          continue;
        }

        // 2. Check if already linked to an existing work order
        if (linkedDocNumbers.has(docNumber.toUpperCase())) {
          results.push({ action: 'skipped', subject, docNumber, skipped_reason: 'Already linked to a work order' });
          await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}/modify`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ removeLabelIds: ['UNREAD'] })
          });
          continue;
        }

        // Find PDF attachment
        const findAttachments = (parts) => {
          if (!parts) return null;
          for (const part of parts) {
            if (part.mimeType === 'application/pdf' || (part.filename && part.filename.endsWith('.pdf'))) {
              if (part.body?.attachmentId) return { attachmentId: part.body.attachmentId, filename: part.filename };
            }
            if (part.parts) {
              const found = findAttachments(part.parts);
              if (found) return found;
            }
          }
          return null;
        };

        const attachmentInfo = findAttachments(msgData.payload?.parts || []);

        let pdfUrl = null;
        if (attachmentInfo) {
          const attRes = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}/attachments/${attachmentInfo.attachmentId}`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          const attData = await attRes.json();
          const pdfBase64 = attData.data?.replace(/-/g, '+').replace(/_/g, '/');

          if (pdfBase64) {
            // Upload PDF using multipart/form-data (required by UploadFile)
            const pdfBytes = Uint8Array.from(atob(pdfBase64), c => c.charCodeAt(0));
            const formData = new FormData();
            formData.append('file', new Blob([pdfBytes], { type: 'application/pdf' }), attachmentInfo.filename || 'estimate.pdf');
            const uploadRes = await base44.asServiceRole.integrations.Core.UploadFile({ file: formData.get('file') });
            pdfUrl = uploadRes?.file_url || null;
          }
        } else {
          results.push({ action: 'skipped', subject, docNumber, skipped_reason: 'No PDF attachment found in email' });
          continue;
        }

        if (!pdfUrl) {
          results.push({ action: 'error', subject, docNumber, error: 'Failed to upload PDF for AI processing' });
          continue;
        }

        // AI extraction
        const aiPrompt = `You are extracting structured data from a sign company estimate/invoice PDF.

Document type: ${docType.toUpperCase()}
Document number: ${docNumber}
Email subject: ${subject}

Extract the following information and return ONLY what is clearly present in the document. Do NOT invent or guess fields that aren't there.

Return a JSON object with these fields (use null for anything not found):
- client_name: The "Bill To" name/company (first line of Bill To address)
- contact_name: The person's name if different from company
- contact_email: Customer email if shown (NOT the salesperson email)
- contact_phone: Customer phone if shown
- billing_address: Full billing address (street, city, state, zip)
- install_location: Full installation address if different from billing
- description: The full job description or scope of work — include the "Description" field text AND any notes, scope, or line item descriptions that describe what work is being done. Concatenate multiple description lines together if needed.
- products: Array of product names (top-level products only, not sub-parts)
- quoted_amount: The Grand Total number only (no $ sign)
- sales_rep: Salesperson name
- sales_rep_email: Salesperson email
- payment_terms: Payment terms text
- doc_number: The exact document number
- doc_numeric_id: Just the numeric part
${aiPromptExtra ? `\nAdditional instructions:\n${aiPromptExtra}` : ''}`;

        // Timeout for AI call — if it hangs, skip this email gracefully
        const aiCallPromise = base44.asServiceRole.integrations.Core.InvokeLLM({
          prompt: aiPrompt,
          file_urls: [pdfUrl],
          response_json_schema: {
            type: "object",
            properties: {
              client_name: { type: "string" },
              contact_name: { type: "string" },
              contact_email: { type: "string" },
              contact_phone: { type: "string" },
              billing_address: { type: "string" },
              install_location: { type: "string" },
              description: { type: "string" },
              products: { type: "array", items: { type: "string" } },
              quoted_amount: { type: "number" },
              sales_rep: { type: "string" },
              sales_rep_email: { type: "string" },
              payment_terms: { type: "string" },
              doc_number: { type: "string" },
              doc_numeric_id: { type: "string" }
            }
          }
        });
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('AI extraction timed out after 20s')), 20_000));
        const extractedData = await Promise.race([aiCallPromise, timeoutPromise]);

        if (!extractedData || !extractedData.client_name) {
          results.push({ action: 'error', subject, docNumber, error: 'AI could not extract data from PDF' });
          continue;
        }

        const clientName = extractedData.client_name || "Unknown Client";
        const workOrderTitle = titleFormat === 'client_docnum'
          ? `${clientName} - ${docNumber}`
          : (extractedData.description || `${clientName} - Sign Project`);

        // Also check the in-memory list for doc number match (catches newly created in same run)
        const exactMatch = allExistingOrders.find(wo => {
          const fields = [wo.est_inv_at, wo.corbridge_invoice_number].filter(Boolean);
          return fields.some(f => {
            const normalized = f.trim().toUpperCase();
            return normalized === docNumber.toUpperCase() || normalized === docNumericId;
          });
        });

        // === FINAL DEDUP GUARD: direct DB queries before any create ===
        // This catches cases where the in-memory sets missed an already-created record
        // (e.g. due to WorkOrder.filter pagination limits)
        const readCorebridgeDocMatches = async () => {
          const [estimateRows, invoiceRows] = await Promise.all([
            loadAllEntityRows({
              entity: WorkOrder,
              query: { est_inv_at: docNumber, deleted: { $ne: true } },
              sort: 'created_date',
              label: `CoreBridge ${docNumber} estimate identity`,
            }),
            loadAllEntityRows({
              entity: WorkOrder,
              query: { corbridge_invoice_number: docNumber, deleted: { $ne: true } },
              sort: 'created_date',
              label: `CoreBridge ${docNumber} invoice identity`,
            }),
          ]);
          return [...estimateRows, ...invoiceRows];
        };

        const [dbDocCheck, dbPendingCheck] = await Promise.all([
          readCorebridgeDocMatches(),
          PendingImport.filter({ doc_number: docNumber })
        ]);
        if ((dbDocCheck?.length ?? 0) > 0) {
          results.push({ action: 'skipped', subject, docNumber, skipped_reason: 'Doc number already linked to a work order (db check)' });
          await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}/modify`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ removeLabelIds: ['UNREAD'] })
          });
          continue;
        }
        if ((dbPendingCheck?.length ?? 0) > 0) {
          results.push({ action: 'skipped', subject, docNumber, skipped_reason: 'Doc number already in pending queue (db check)' });
          await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}/modify`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ removeLabelIds: ['UNREAD'] })
          });
          continue;
        }

        if (exactMatch) {
          // Update the existing linked work order
          const updateData = {
            est_inv_at: docNumber,
            corbridge_invoice_number: docNumber
          };
          if (extractedData.quoted_amount) {
            updateData.quoted_amount = extractedData.quoted_amount;
            updateData.estimate_amount = extractedData.quoted_amount;
          }
          const isEstToInv = docType === 'invoice' && (exactMatch.est_inv_at || '').startsWith(estPattern);
          if (isEstToInv) {
            updateData.current_stage = estToInvStage;
            updateData.in_pipeline = true;
            updateData.sales_status = estToInvSalesStatus;
          }
          if (extractedData.install_location) updateData.install_location = extractedData.install_location;
          if (extractedData.description) updateData.description = extractedData.description;

          const savedWorkOrder = await replaceWorkOrderFieldsIfUnchanged({
            entity: WorkOrder,
            workOrderId: exactMatch.id,
            expectedFields: expectedWorkOrderFields(exactMatch, updateData),
            nextFields: updateData,
            label: `CoreBridge ${docNumber} Work Order update`,
          });
          // Update in-memory so subsequent emails in this run see the confirmed latest record.
          Object.assign(exactMatch, savedWorkOrder);
          results.push({ action: 'updated', subject, docNumber, workOrderId: exactMatch.id, client: clientName, estToInv: isEstToInv });

        } else {
          // Compute fuzzy match scores against all existing work orders (including newly created in this run)
          const candidates = allExistingOrders
            .filter(wo => !wo.deleted && !wo.completed && wo.id !== undefined) // Ensure only valid WOs
            .map(wo => {
              const { score, reasons } = computeMatchScore(extractedData, wo);
              return { work_order_id: wo.id, work_order_title: wo.title, client_name: wo.client_name, current_stage: wo.current_stage, match_score: score, match_reasons: reasons };
            })
            .filter(c => c.match_score >= 25)
            .sort((a, b) => b.match_score - a.match_score)
            .slice(0, 5);

          const proposedWorkOrder = {
            title: workOrderTitle,
            client_name: clientName,
            description: extractedData.description || '',
            current_stage: docType === 'invoice' ? invoiceStage : estimateStage,
            sales_status: docType === 'invoice' ? invoiceSalesStatus : estimateSalesStatus,
            in_pipeline: true,
            est_inv_at: docNumber,
            corbridge_invoice_number: docNumber,
            quoted_amount: extractedData.quoted_amount || null,
            estimate_amount: extractedData.quoted_amount || null,
            contact_name: extractedData.contact_name || null,
            contact_email: extractedData.contact_email || null,
            contact_phone: extractedData.contact_phone || null,
            billing_address: extractedData.billing_address || null,
            install_location: extractedData.install_location || null,
            sales_rep: extractedData.sales_rep || null,
            representative: extractedData.sales_rep || null,
            completed: false,
            deleted: false,
            product_1: extractedData.products?.[0] || null,
            product_2: extractedData.products?.[1] || null,
            product_3: extractedData.products?.[2] || null,
            product_4: extractedData.products?.[3] || null,
            product_5: extractedData.products?.[4] || null,
          };

          if (candidates.length === 0) {
            // Each Corebridge email has a unique doc number (EST-xxx / INV-xxx).
            // If we reach here, no doc number match and no fuzzy score match was found.
            // This is likely a genuinely new job, even if the client already exists.
            // Auto-create — the doc number itself prevents future duplicates.
            Object.keys(proposedWorkOrder).forEach(k => {
              if (proposedWorkOrder[k] === null || proposedWorkOrder[k] === undefined) delete proposedWorkOrder[k];
            });
            const createResult = await createWorkOrderWithRecovery({
              entity: WorkOrder,
              data: proposedWorkOrder,
              readMatches: readCorebridgeDocMatches,
              label: `CoreBridge ${docNumber} Work Order`,
            });
            const created = createResult.record;
            if (!allExistingOrders.some((wo) => wo.id === created.id)) allExistingOrders.push(created);
            processedDocNumbers.add(docNumber);
            linkedDocNumbers.add(docNumber.toUpperCase());
            if (createResult.status === 'reused') {
              results.push({ action: 'skipped', subject, docNumber, workOrderId: created.id, client: clientName, skipped_reason: 'Work Order was created concurrently during final convergence' });
            } else {
              results.push({ action: 'created', subject, docNumber, workOrderId: created.id, client: clientName, stage: proposedWorkOrder.current_stage, create_recovered: createResult.status === 'recovered' });
            }
          } else {
            // Has potential matches → send to pending review
            const action = candidates[0].match_score >= 50 ? 'pending_merge' : 'pending_approve';
            const pendingCreate = await ensureConvergentPendingImportCreate({
              entity: PendingImport,
              data: {
                doc_number: docNumber,
                doc_type: docType,
                email_subject: subject,
                extracted_data: extractedData,
                proposed_work_order: proposedWorkOrder,
                match_candidates: candidates,
                status: 'pending',
                pdf_url: pdfUrl
              },
              readMatches: () => loadAllEntityRows({
                entity: PendingImport,
                query: { doc_number: docNumber },
                sort: 'created_date',
                label: `CoreBridge Pending Import ${docNumber}`,
              }),
              label: `CoreBridge Pending Import ${docNumber}`,
            });
            pendingImportDocNumbers.add(docNumber.toUpperCase());
            if (pendingCreate.status === 'created') {
              results.push({ action, subject, docNumber, client: clientName, candidates: candidates.length });
            } else {
              results.push({ action: 'skipped', subject, docNumber, skipped_reason: 'Pending import was created concurrently or already existed during final convergence' });
            }
          }
        }

        // Mark email as read
        await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}/modify`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ removeLabelIds: ['UNREAD'] })
        });

        processed++;
      } catch (emailError) {
        console.error(`Error processing email ${msg.id}:`, emailError);
        results.push({ action: 'error', messageId: msg.id, error: emailError.message });
        // Mark the failing email as read so it doesn't block future runs.
        // Without this, a single bad email (e.g. AI timeout) gets retried every
        // 10 minutes and eventually causes the whole isolate to time out → 502.
        try {
          await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}/modify`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ removeLabelIds: ['UNREAD'] })
          });
        } catch (markErr) {
          console.warn(`Failed to mark email ${msg.id} as read after error:`, markErr.message);
        }
      }
    }

    const hasErrors = results.some(r => r.action === 'error');
    logData.processed = processed;
    logData.results = results;
    logData.status = processed === 0 && hasErrors ? 'error' : hasErrors ? 'partial' : 'success';

    await writeRunLogBestEffort(logData);

    return Response.json({ success: true, processed, results });

  } catch (error) {
    console.error('processCorebridgeEmails error:', error);
    logData.status = 'error';
    logData.error_message = error.message;
    await writeRunLogBestEffort(logData);
    return Response.json({ error: error.message }, { status: 500 });
  }
});