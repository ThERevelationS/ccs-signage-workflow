import { base44 } from "@/api/base44Client";
import { getSessionToken } from "@/components/auth/EmailGate";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";
const EmailNotificationSettings = base44.entities.EmailNotificationSettings;
const User = base44.entities.User;

// Generate AI-enhanced email content
const generateAIEmail = async (templateSubject, templateBody, workOrder, extraData = {}) => {
  try {
    // Build context based on whether it's an order or work order
    let contextInfo = "";
    if (extraData.orderData) {
      const order = extraData.orderData;
      contextInfo = `
ORDER DETAILS:
- Customer: ${order.customer_name || "Unknown"}
- Request Type: ${order.request_type || "Unknown"}
- Description: ${order.description || "No description"}
- Quantity: ${order.quantity || "Not specified"}
- Requestor: ${order.requestor_name || "Unknown"}
- Date Needed: ${order.date_needed || "Not set"}
- Vendor: ${order.vendor || "Not specified"}
- Status: ${order.status || "pending"}`;
    } else if (workOrder) {
      contextInfo = `
WORK ORDER: "${workOrder?.title || "Unknown"}" for client "${workOrder?.client_name || "Unknown"}"
${extraData.previousStage ? `MOVED FROM: ${formatStageName(extraData.previousStage)}` : ""}
${extraData.newStage ? `MOVED TO: ${formatStageName(extraData.newStage)}` : ""}
CURRENT STAGE: ${formatStageName(workOrder?.current_stage)}
ASSIGNED TO: ${workOrder?.assigned_to || "Unassigned"}
${workOrder?.due_date ? `DUE DATE: ${workOrder.due_date}` : ""}
${workOrder?.asap ? "PRIORITY: ASAP - URGENT" : ""}
${workOrder?.is_rider ? "TYPE: This is a RIDER task" : ""}
${extraData.taskText ? `TASK: ${extraData.taskText}` : ""}
${extraData.noteText ? `NOTE: ${extraData.noteText}` : ""}`;
    }

    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `You are an automated workflow notification system for Cincinnati Signs. Generate a brief, impersonal notification email.

EVENT: ${extraData.eventDescription || "Update"}
${contextInfo}

USER'S TEMPLATE TO BASE THIS ON:
Subject: ${templateSubject}
Body: ${templateBody}

INSTRUCTIONS:
- This is an AUTOMATED SYSTEM notification, NOT from a person
- Do NOT include any personal sign-offs, names, or contact info
- Do NOT say "Best regards", "Thanks", or any personal closings
- Keep it SHORT and factual (1-3 sentences max)
- Format as clean HTML with <p> tags
- Just state what happened and relevant details
- End with something like "This is an automated notification." if needed
- Do NOT use markdown formatting like ** or - lists`,
      response_json_schema: {
        type: "object",
        properties: {
          subject: { type: "string", description: "The email subject line (plain text, no HTML)" },
          body: { type: "string", description: "The email body formatted as clean HTML with <p> tags" }
        },
        required: ["subject", "body"]
      }
    });

    return { subject: result.subject, body: result.body };
  } catch (error) {
    console.error("AI email generation failed, using template:", error);
    // Fallback to original template with basic HTML formatting
    return { 
      subject: templateSubject, 
      body: `<p>${templateBody.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</p>` 
    };
  }
};

// Variable replacements for email templates
const replaceVariables = (template, workOrder, extraData = {}) => {
  if (!template) return "";
  
  const variables = {
    "{{title}}": workOrder?.title || "",
    "{{client_name}}": workOrder?.client_name || "",
    "{{description}}": workOrder?.description || "",
    "{{current_stage}}": formatStageName(workOrder?.current_stage) || "",
    "{{assigned_to}}": workOrder?.assigned_to || "Unassigned",
    "{{due_date}}": workOrder?.due_date || "Not set",
    "{{created_by}}": workOrder?.created_by || "",
    "{{is_rider}}": workOrder?.is_rider ? "Yes" : "No",
    "{{is_asap}}": workOrder?.asap ? "Yes" : "No",
    "{{previous_stage}}": formatStageName(extraData.previousStage) || "",
    "{{new_stage}}": formatStageName(extraData.newStage) || "",
    "{{task_text}}": extraData.taskText || "",
    "{{note_text}}": extraData.noteText || "",
    "{{note_type}}": extraData.noteType || "",
    "{{changed_by}}": extraData.changedBy || "",
    "{{timestamp}}": new Date().toLocaleString(),
    "{{work_order_id}}": workOrder?.id || ""
  };

  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(key.replace(/[{}]/g, "\\$&"), "g"), value);
  }
  return result;
};

const formatStageName = (stage) => {
  const names = {
    estimating: "Estimating",
    sales: "Sales",
    permitting: "Permitting",
    design: "Design",
    production: "Production",
    fabrication: "Fabrication",
    installation: "Installation",
    completed: "Completed"
  };
  return names[stage] || stage || "";
};

// Get recipients based on rule configuration
const getRecipients = async (rule, workOrder) => {
  const emails = new Set();
  
  for (const recipient of (rule.recipients || [])) {
    switch (recipient.type) {
      case "email":
        if (recipient.value) emails.add(recipient.value);
        break;
      case "assigned_user":
        if (workOrder?.assigned_to) {
          // Try to find user email from assigned_to field
          const users = await loadAllEntityRows({ entity: User, sort: null, label: "Notification user catalog" });
          const user = users.find(u => 
            u.email === workOrder.assigned_to || 
            u.full_name === workOrder.assigned_to
          );
          if (user?.email) emails.add(user.email);
        }
        break;
      case "creator":
        if (workOrder?.created_by) emails.add(workOrder.created_by);
        break;
      case "all_admins":
        const admins = await loadAllEntityRows({ entity: User, query: { role: "admin" }, sort: null, label: "Notification admin recipients" });
        admins.forEach(admin => emails.add(admin.email));
        break;
      case "custom_list":
        if (recipient.value) {
          recipient.value.split(",").forEach(email => {
            const trimmed = email.trim();
            if (trimmed) emails.add(trimmed);
          });
        }
        break;
    }
  }
  
  return Array.from(emails);
};

// Check if trigger conditions match
const matchesConditions = (rule, workOrder, extraData = {}) => {
  const conditions = rule.trigger_condition || {};
  
  // Stage-specific checks
  if (conditions.stage && workOrder?.current_stage !== conditions.stage) {
    return false;
  }
  
  if (conditions.from_stage && extraData.previousStage !== conditions.from_stage) {
    return false;
  }
  
  if (conditions.to_stage && extraData.newStage !== conditions.to_stage) {
    return false;
  }
  
  // Assignment check
  if (conditions.assigned_to && workOrder?.assigned_to !== conditions.assigned_to) {
    return false;
  }
  
  // ASAP check
  if (conditions.is_asap !== undefined && workOrder?.asap !== conditions.is_asap) {
    return false;
  }
  
  // Rider check
  if (conditions.is_rider !== undefined && workOrder?.is_rider !== conditions.is_rider) {
    return false;
  }
  
  return true;
};


// Main notification trigger function
export const triggerNotification = async (triggerType, workOrder, extraData = {}) => {
  try {
    // Check old EmailNotificationSettings rules
    const allRules = await loadAllEntityRows({ entity: EmailNotificationSettings, query: { enabled: true }, sort: null, label: "Enabled notification rules" });
    const matchingRules = allRules
      .filter(rule => rule.trigger_type === triggerType)
      .filter(rule => matchesConditions(rule, workOrder, extraData))
      .sort((a, b) => (a.priority || 0) - (b.priority || 0));
    
    // Process old-style rules
    for (const rule of matchingRules) {
      const recipients = await getRecipients(rule, workOrder);

      if (recipients.length === 0) continue;

      const templateSubject = replaceVariables(rule.email_subject, workOrder, extraData);
      const templateBody = replaceVariables(rule.email_body, workOrder, extraData);

      // Generate AI-enhanced email
      const { subject, body } = await generateAIEmail(templateSubject, templateBody, workOrder, extraData);

      for (const email of recipients) {
        try {
          await base44.functions.invoke('sendGmail', {
            to: email,
            subject: subject,
            body: body
          });
          console.log(`Notification sent to ${email} for trigger: ${triggerType}`);
        } catch (emailError) {
          console.error(`Failed to send email to ${email}:`, emailError);
        }
      }
    }
    
    // AutomationRule processing runs server-side in workflowTriggerEngine via
    // processWorkflowTriggers so every action type executes with service-role
    // consistency — not just send_email. The endpoint re-reads the Work
    // Order/Order itself, so only the record id and event extras cross the
    // wire. Fire-and-forget like the rest of this module.
    const sessionToken = getSessionToken();
    if (sessionToken) {
      try {
        await base44.functions.invoke('processWorkflowTriggers', {
          event_type: triggerType,
          work_order: workOrder?.id ? { id: workOrder.id } : undefined,
          order: extraData.orderData?.id ? { id: extraData.orderData.id } : undefined,
          extras: { ...extraData, orderData: undefined },
          session_token: sessionToken,
        });
      } catch (automationError) {
        console.error(`Automation processing failed for trigger "${triggerType}":`, automationError);
      }
    }
  } catch (error) {
    console.error("Error triggering notification:", error);
  }
};

// Convenience functions for specific triggers
export const NotificationTriggers = {
  workOrderCreated: async (workOrder, changedBy) => {
    await triggerNotification("work_order_created", workOrder, { changedBy, eventDescription: "New work order created" });
  },
  
  workOrderCompleted: async (workOrder, changedBy) => {
    await triggerNotification("work_order_completed", workOrder, { changedBy, eventDescription: "Work order marked as completed" });
  },
  
  workOrderDeleted: async (workOrder, changedBy) => {
    await triggerNotification("work_order_deleted", workOrder, { changedBy, eventDescription: "Work order deleted" });
  },
  
  riderCreated: async (workOrder, parentTitle, changedBy) => {
    await triggerNotification("rider_created", workOrder, { parentTitle, changedBy, eventDescription: `Rider task created for "${parentTitle}"` });
  },
  
  stageChanged: async (workOrder, previousStage, newStage, changedBy) => {
    const eventDescription = `Work order moved from ${formatStageName(previousStage)} to ${formatStageName(newStage)}`;
    await triggerNotification("stage_changed", workOrder, { previousStage, newStage, changedBy, eventDescription });
    await triggerNotification("stage_exited", workOrder, { previousStage, newStage, changedBy, eventDescription: `Work order exited ${formatStageName(previousStage)} stage` });
    await triggerNotification("stage_entered", workOrder, { previousStage, newStage, changedBy, eventDescription: `Work order entered ${formatStageName(newStage)} stage` });
  },
  
  taskAdded: async (workOrder, taskText, changedBy) => {
    await triggerNotification("task_added", workOrder, { taskText, changedBy, eventDescription: "New task added" });
  },
  
  taskCompleted: async (workOrder, taskText, changedBy) => {
    await triggerNotification("task_completed", workOrder, { taskText, changedBy, eventDescription: "Task completed" });
  },
  
  taskDeleted: async (workOrder, changedBy) => {
    await triggerNotification("task_deleted", workOrder, { changedBy, eventDescription: "Task deleted" });
  },
  
  noteAdded: async (workOrder, noteText, noteType, changedBy) => {
    await triggerNotification("note_added", workOrder, { noteText, noteType, changedBy, eventDescription: `New ${noteType} note added` });
  },
  
  noteDeleted: async (workOrder, changedBy) => {
    await triggerNotification("note_deleted", workOrder, { changedBy, eventDescription: "Note deleted" });
  },
  
  imageUploaded: async (workOrder, changedBy) => {
    await triggerNotification("image_uploaded", workOrder, { changedBy, eventDescription: "Image uploaded" });
  },
  
  asapToggled: async (workOrder, isAsap, changedBy) => {
    await triggerNotification(isAsap ? "asap_toggled_on" : "asap_toggled_off", workOrder, { changedBy, eventDescription: isAsap ? "Marked as ASAP - URGENT" : "ASAP status removed" });
  },
  
  assignedToChanged: async (workOrder, previousAssignee, newAssignee, changedBy) => {
    await triggerNotification("assigned_to_changed", workOrder, { previousAssignee, newAssignee, changedBy, eventDescription: `Assignment changed from ${previousAssignee || 'unassigned'} to ${newAssignee}` });
  },
  
  priorityChanged: async (workOrder, changedBy) => {
    await triggerNotification("priority_changed", workOrder, { changedBy, eventDescription: "Priority changed" });
  },
  
  automationTriggered: async (workOrder, automationName, changedBy) => {
    await triggerNotification("automation_triggered", workOrder, { automationName, changedBy, eventDescription: `Automation "${automationName}" triggered` });
  },
  
  // Order-specific triggers
  orderCreated: async (order, changedBy) => {
    // Skip notifications for imported orders
    if (order.is_import) return;
    
    await triggerNotification("order_created", null, { 
      changedBy, 
      eventDescription: "New order created",
      orderData: order
    });
  },
  
  orderOrdered: async (order, changedBy) => {
    // Skip notifications for imported orders
    if (order.is_import) return;
    
    await triggerNotification("order_ordered", null, { 
      changedBy, 
      eventDescription: "Order has been placed",
      orderData: order
    });
  },
  
  orderReceived: async (order, changedBy) => {
    // Skip notifications for imported orders
    if (order.is_import) return;
    
    await triggerNotification("order_received", null, { 
      changedBy, 
      eventDescription: "Order has been received",
      orderData: order
    });
  },
  
  orderDateNeededApproaching: async (order, changedBy) => {
    await triggerNotification("order_date_needed_approaching", null, { 
      changedBy, 
      eventDescription: "Order date needed is approaching",
      orderData: order
    });
  },
  
  // Order field change triggers
  orderFieldChanged: async (order, fieldName, oldValue, newValue, changedBy) => {
    const triggerMap = {
      "customer_name": "order_customer_name_changed",
      "request_type": "order_request_type_changed",
      "description": "order_description_changed",
      "quantity": "order_quantity_changed",
      "requestor_name": "order_requestor_changed",
      "requestor_email": "order_requestor_changed",
      "date_needed": "order_date_needed_changed",
      "date_ordered": "order_date_ordered_changed",
      "vendor": "order_vendor_changed",
      "date_received": "order_date_received_changed"
    };
    
    const triggerType = triggerMap[fieldName];
    if (triggerType) {
      await triggerNotification(triggerType, null, {
        changedBy,
        eventDescription: `Order ${fieldName.replace(/_/g, ' ')} changed from "${oldValue || 'empty'}" to "${newValue || 'empty'}"`,
        orderData: order,
        fieldChanged: fieldName,
        oldValue,
        newValue
      });
    }
  }
};