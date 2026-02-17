import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const WorkOrder = base44.asServiceRole.entities.WorkOrder;
  const CorebridgeLog = base44.asServiceRole.entities.CorebridgeLog;

  // Detect trigger type from request body
  let triggerType = 'scheduled';
  try {
    const body = await req.clone().json();
    if (body && Object.keys(body).length > 0) triggerType = 'manual';
  } catch (_) {}

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
    // Load settings
    const settingsRecords = await base44.asServiceRole.entities.GlobalSettings.filter({ setting_key: "corebridgeAI" });
    const cfg = settingsRecords.length > 0 ? settingsRecords[0].setting_value : {};

    if (cfg.enabled === false) {
      logData.status = 'no_emails';
      logData.debug_info = 'Importer is disabled in settings.';
      await CorebridgeLog.create(logData);
      return Response.json({ success: true, message: "CoreBridge AI importer is disabled", processed: 0 });
    }

    const gmailQuery = cfg.gmail_query || 'subject:"Your Sign Estimate" OR subject:"Your Sign Invoice" is:unread';
    const estPattern = (cfg.estimate_subject_pattern || 'EST').toUpperCase();
    const invPattern = (cfg.invoice_subject_pattern || 'INV').toUpperCase();
    const maxEmails = cfg.max_emails_per_run || 20;
    const estimateStage = cfg.estimate_stage || 'sales';
    const estimateSalesStatus = cfg.estimate_sales_status || 'quoted';
    const invoiceStage = cfg.invoice_stage || 'production';
    const invoiceSalesStatus = cfg.invoice_sales_status || 'won';
    const estToInvStage = cfg.est_to_inv_stage || 'production';
    const estToInvSalesStatus = cfg.est_to_inv_sales_status || 'won';
    const titleFormat = cfg.title_format || 'description';
    const aiPromptExtra = cfg.ai_prompt_extra || '';

    const accessToken = await base44.asServiceRole.connectors.getAccessToken("gmail");

    const searchUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(gmailQuery)}&maxResults=${maxEmails}`;
    const searchRes = await fetch(searchUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    const searchData = await searchRes.json();

    logData.debug_info = `Gmail query: ${gmailQuery} | Found: ${searchData.messages?.length ?? 0}`;

    if (!searchData.messages || searchData.messages.length === 0) {
      logData.status = 'no_emails';
      await CorebridgeLog.create(logData);
      return Response.json({ success: true, message: "No new CoreBridge emails found", processed: 0, results: [] });
    }

    logData.emails_found = searchData.messages.length;
    let processed = 0;
    const results = [];

    for (const msg of searchData.messages) {
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
- description: The DESCRIPTION field value
- products: Array of product names (top-level products only, not sub-parts)
- quoted_amount: The Grand Total number only (no $ sign)
- sales_rep: Salesperson name
- sales_rep_email: Salesperson email
- payment_terms: Payment terms text
- doc_number: The exact document number
- doc_numeric_id: Just the numeric part
${aiPromptExtra ? `\nAdditional instructions:\n${aiPromptExtra}` : ''}`;

        const aiRes = await base44.asServiceRole.integrations.Core.InvokeLLM({
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
        const extractedData = aiRes;

        if (!extractedData || !extractedData.client_name) {
          results.push({ action: 'error', subject, docNumber, error: 'AI could not extract data from PDF' });
          continue;
        }

        const clientName = extractedData.client_name || "Unknown Client";
        const workOrderTitle = titleFormat === 'client_docnum'
          ? `${clientName} - ${docNumber}`
          : (extractedData.description || `${clientName} - Sign Project`);

        const existingOrders = await WorkOrder.filter({ deleted: { $ne: true } });
        const existing = existingOrders.find(wo => {
          const storedNum = wo.est_inv_at || wo.corbridge_invoice_number || '';
          return storedNum.includes(docNumericId);
        });

        if (existing) {
          const updateData = {
            est_inv_at: docNumber,
            corbridge_invoice_number: docNumber
          };
          if (extractedData.quoted_amount) {
            updateData.quoted_amount = extractedData.quoted_amount;
            updateData.estimate_amount = extractedData.quoted_amount;
          }
          const isEstToInv = docType === 'invoice' && (existing.est_inv_at || '').startsWith(estPattern);
          if (isEstToInv) {
            updateData.current_stage = estToInvStage;
            updateData.in_pipeline = true;
            updateData.sales_status = estToInvSalesStatus;
          }
          if (extractedData.install_location) updateData.install_location = extractedData.install_location;

          await WorkOrder.update(existing.id, updateData);
          results.push({ action: 'updated', subject, docNumber, workOrderId: existing.id, client: clientName, estToInv: isEstToInv });
        } else {
          const newWorkOrder = {
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
          Object.keys(newWorkOrder).forEach(k => {
            if (newWorkOrder[k] === null || newWorkOrder[k] === undefined) delete newWorkOrder[k];
          });
          const created = await WorkOrder.create(newWorkOrder);
          results.push({ action: 'created', subject, docNumber, workOrderId: created.id, client: clientName, stage: newWorkOrder.current_stage });
        }

        // Mark as read
        await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}/modify`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ removeLabelIds: ['UNREAD'] })
        });

        processed++;
      } catch (emailError) {
        console.error(`Error processing email ${msg.id}:`, emailError);
        results.push({ action: 'error', messageId: msg.id, error: emailError.message });
      }
    }

    const hasErrors = results.some(r => r.action === 'error');
    logData.processed = processed;
    logData.results = results;
    logData.status = processed === 0 && hasErrors ? 'error' : hasErrors ? 'partial' : 'success';

    await CorebridgeLog.create(logData);

    return Response.json({ success: true, processed, results });

  } catch (error) {
    console.error('processCorebridgeEmails error:', error);
    logData.status = 'error';
    logData.error_message = error.message;
    await CorebridgeLog.create(logData);
    return Response.json({ error: error.message }, { status: 500 });
  }
});