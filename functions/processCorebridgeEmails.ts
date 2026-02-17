import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // For scheduled automations, use service role
    const WorkOrder = base44.asServiceRole.entities.WorkOrder;

    // Get Gmail access token
    const accessToken = await base44.asServiceRole.connectors.getAccessToken("gmail");

    // Search for CoreBridge emails - estimates and invoices
    const query = 'subject:"Your Sign Estimate" OR subject:"Your Sign Invoice" is:unread';
    const searchUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=20`;

    const searchRes = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const searchData = await searchRes.json();

    if (!searchData.messages || searchData.messages.length === 0) {
      return Response.json({ success: true, message: "No new CoreBridge emails found", processed: 0 });
    }

    let processed = 0;
    let results = [];

    for (const msg of searchData.messages) {
      try {
        // Fetch full message
        const msgRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        const msgData = await msgRes.json();

        // Extract subject
        const headers = msgData.payload?.headers || [];
        const subject = headers.find(h => h.name === 'Subject')?.value || '';
        const fromHeader = headers.find(h => h.name === 'From')?.value || '';

        // Parse document number from subject
        // Matches EST-XXXXX or INV-XXXXX
        const estMatch = subject.match(/EST-(\d+)/i);
        const invMatch = subject.match(/INV-(\d+)/i);
        const docNumber = estMatch ? `EST-${estMatch[1]}` : invMatch ? `INV-${invMatch[1]}` : null;
        const docType = estMatch ? 'estimate' : invMatch ? 'invoice' : null;
        const docNumericId = estMatch ? estMatch[1] : invMatch ? invMatch[1] : null;

        if (!docNumber || !docType) {
          console.log(`Skipping email: ${subject} - no document number found`);
          continue;
        }

        // Find PDF attachment
        let pdfBase64 = null;
        let pdfFilename = null;

        const findAttachments = (parts) => {
          if (!parts) return;
          for (const part of parts) {
            if (part.mimeType === 'application/pdf' || (part.filename && part.filename.endsWith('.pdf'))) {
              if (part.body?.attachmentId) {
                return { attachmentId: part.body.attachmentId, filename: part.filename };
              }
            }
            if (part.parts) {
              const found = findAttachments(part.parts);
              if (found) return found;
            }
          }
          return null;
        };

        const attachmentInfo = findAttachments(msgData.payload?.parts || []);

        if (attachmentInfo) {
          // Download the attachment
          const attRes = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}/attachments/${attachmentInfo.attachmentId}`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          const attData = await attRes.json();
          // Gmail returns URL-safe base64
          pdfBase64 = attData.data?.replace(/-/g, '+').replace(/_/g, '/');
          pdfFilename = attachmentInfo.filename;
        }

        // Upload PDF to get a URL for AI processing
        let pdfUrl = null;
        if (pdfBase64) {
          const pdfBytes = Uint8Array.from(atob(pdfBase64), c => c.charCodeAt(0));
          const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });

          const uploadRes = await base44.asServiceRole.integrations.Core.UploadFile({ file: pdfBlob });
          pdfUrl = uploadRes.file_url;
        }

        // Use AI to extract information from the PDF
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
- doc_number: The exact document number (EST-XXXXX or INV-XXXXX)
- doc_numeric_id: Just the numeric part`;

        let extractedData = null;
        if (pdfUrl) {
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
          extractedData = aiRes;
        }

        if (!extractedData) {
          console.log(`Could not extract data for ${docNumber}`);
          continue;
        }

        // Build the title from client name + doc number
        const clientName = extractedData.client_name || "Unknown Client";
        const workOrderTitle = extractedData.description
          ? `${extractedData.description}`
          : `${clientName} - Sign Project`;

        // Check if a work order already exists for this numeric ID
        // Search by corbridge_invoice_number (we store both EST and INV numbers here)
        const existingOrders = await WorkOrder.filter({ deleted: { $ne: true } });

        // Find existing by numeric ID (handles EST->INV conversion)
        const existing = existingOrders.find(wo => {
          const storedNum = wo.est_inv_at || wo.corbridge_invoice_number || '';
          // Match if same numeric ID regardless of EST/INV prefix
          return storedNum.includes(docNumericId);
        });

        if (existing) {
          // UPDATE existing work order
          const updateData = {};

          // Always update the document number
          updateData.est_inv_at = docNumber;
          updateData.corbridge_invoice_number = docNumber;

          // Update amount if provided
          if (extractedData.quoted_amount) {
            updateData.quoted_amount = extractedData.quoted_amount;
            updateData.estimate_amount = extractedData.quoted_amount;
          }

          // If this is now an invoice (EST -> INV conversion), move to WIP / production
          if (docType === 'invoice' && (existing.est_inv_at || '').startsWith('EST')) {
            updateData.current_stage = 'production';
            updateData.in_pipeline = true;
            updateData.sales_status = 'won';
            console.log(`EST->INV conversion for ${docNumber}: moving to WIP/production`);
          }

          // Update install location if provided
          if (extractedData.install_location) {
            updateData.install_location = extractedData.install_location;
          }

          await WorkOrder.update(existing.id, updateData);

          results.push({
            action: 'updated',
            docNumber,
            workOrderId: existing.id,
            client: clientName,
            estToInv: docType === 'invoice' && (existing.est_inv_at || '').startsWith('EST')
          });
        } else {
          // CREATE new work order
          const newWorkOrder = {
            title: workOrderTitle,
            client_name: clientName,
            description: extractedData.description || '',
            current_stage: docType === 'invoice' ? 'production' : 'sales',
            sales_status: docType === 'invoice' ? 'won' : 'quoted',
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
            // Store products as text in product fields
            product_1: extractedData.products?.[0] || null,
            product_2: extractedData.products?.[1] || null,
            product_3: extractedData.products?.[2] || null,
            product_4: extractedData.products?.[3] || null,
            product_5: extractedData.products?.[4] || null,
          };

          // Remove null values to keep it clean
          Object.keys(newWorkOrder).forEach(k => {
            if (newWorkOrder[k] === null || newWorkOrder[k] === undefined) {
              delete newWorkOrder[k];
            }
          });

          const created = await WorkOrder.create(newWorkOrder);

          results.push({
            action: 'created',
            docNumber,
            workOrderId: created.id,
            client: clientName,
            stage: newWorkOrder.current_stage
          });
        }

        // Mark email as read
        await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}/modify`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ removeLabelIds: ['UNREAD'] })
        });

        processed++;
      } catch (emailError) {
        console.error(`Error processing email ${msg.id}:`, emailError);
        results.push({ action: 'error', messageId: msg.id, error: emailError.message });
      }
    }

    return Response.json({
      success: true,
      processed,
      results
    });

  } catch (error) {
    console.error('processCorebridgeEmails error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});