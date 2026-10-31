import { base44 } from "@/api/base44Client";
import { getSessionToken } from "@/components/auth/EmailGate";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";
import { loadAuthorizedUserDirectory } from "@/components/user/authorizedUserDirectoryPersistence";
import { appParams } from "@/lib/app-params";
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
          // EmailGate staff can't read the platform User entity (guaranteed
          // 401), so resolve assignees through the session-authenticated
          // authorized-user directory instead.
          const sessionToken = getSessionToken();
          const directory = sessionToken
            ? await loadAuthorizedUserDirectory({ sessionToken }).catch(() => null)
            : null;
          const users = directory?.users || [];
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
        // Platform User reads only succeed for Base44-authenticated sessions —
        // for EmailGate staff this was a guaranteed 401 per rule trigger.
        if (appParams.token) {
          const admins = await loadAllEntityRows({ entity: User, query: { role: "admin" }, sort: null, label: "Notification admin recipients" });
          admins.forEach(admin => emails.add(admin.email));
        }
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
          record: extraData.recordData?.id ? { id: extraData.recordData.id } : undefined,
          extras: { ...extraData, orderData: undefined, recordData: undefined },
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
    if (workOrder?.is_rider) {
      await triggerNotification("rider_completed", workOrder, { changedBy, eventDescription: "Rider marked as completed" });
    }
  },
  
  workOrderDeleted: async (workOrder, changedBy) => {
    await triggerNotification("work_order_deleted", workOrder, { changedBy, eventDescription: "Work order deleted" });
    if (workOrder?.is_rider) {
      await triggerNotification("rider_deleted", workOrder, { changedBy, eventDescription: "Rider deleted" });
    }
  },
  
  riderCreated: async (workOrder, parentTitle, changedBy) => {
    await triggerNotification("rider_created", workOrder, { parentTitle, changedBy, eventDescription: `Rider task created for "${parentTitle}"` });
  },
  
  stageChanged: async (workOrder, previousStage, newStage, changedBy) => {
    const eventDescription = `Work order moved from ${formatStageName(previousStage)} to ${formatStageName(newStage)}`;
    await triggerNotification("stage_changed", workOrder, { previousStage, newStage, changedBy, eventDescription });
    await triggerNotification("stage_exited", workOrder, { previousStage, newStage, changedBy, eventDescription: `Work order exited ${formatStageName(previousStage)} stage` });
    await triggerNotification("stage_entered", workOrder, { previousStage, newStage, changedBy, eventDescription: `Work order entered ${formatStageName(newStage)} stage` });
    // Stage-specific convenience events so a rule can select "entered
    // Fabrication" directly instead of configuring a stage condition.
    const STAGE_ENTERED_TRIGGERS = {
      estimating: "stage_estimating_entered",
      sales: "stage_sales_entered",
      permitting: "stage_permitting_entered",
      design: "stage_design_entered",
      production: "stage_production_entered",
      fabrication: "stage_fabrication_entered",
      installation: "stage_installation_entered",
      completed: "stage_completed_entered",
    };
    const stageSpecific = STAGE_ENTERED_TRIGGERS[newStage];
    if (stageSpecific) {
      await triggerNotification(stageSpecific, workOrder, { previousStage, newStage, changedBy, eventDescription });
    }
    if (workOrder?.is_rider) {
      await triggerNotification("rider_stage_changed", workOrder, { previousStage, newStage, changedBy, eventDescription: `Rider moved from ${formatStageName(previousStage)} to ${formatStageName(newStage)}` });
    }
  },
  
  taskAdded: async (workOrder, taskText, changedBy) => {
    await triggerNotification("task_added", workOrder, { taskText, changedBy, eventDescription: "New task added" });
  },
  
  taskCompleted: async (workOrder, taskText, changedBy) => {
    await triggerNotification("task_completed", workOrder, { taskText, changedBy, eventDescription: "Task completed" });
  },

  taskUncompleted: async (workOrder, taskText, changedBy) => {
    await triggerNotification("task_uncompleted", workOrder, { taskText, changedBy, eventDescription: "Task marked incomplete" });
  },

  taskEdited: async (workOrder, oldText, newText, changedBy) => {
    await triggerNotification("task_edited", workOrder, { taskText: newText, oldValue: oldText, changedBy, eventDescription: "Task text edited" });
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

  subNoteAdded: async (workOrder, text, changedBy) => {
    await triggerNotification("sub_note_added", workOrder, { noteText: text, changedBy, eventDescription: "Sub-note added" });
  },

  subNoteDeleted: async (workOrder, changedBy) => {
    await triggerNotification("sub_note_deleted", workOrder, { changedBy, eventDescription: "Sub-note deleted" });
  },

  sipItemCompleted: async (workOrder, taskText, changedBy) => {
    await triggerNotification("sip_item_completed", workOrder, { taskText, changedBy, eventDescription: "SIP checklist item completed" });
  },

  mmmItemCompleted: async (workOrder, taskText, changedBy) => {
    await triggerNotification("mmm_item_completed", workOrder, { taskText, changedBy, eventDescription: "Monday Morning Meeting item completed" });
  },

  sipItemRevisitSet: async (workOrder, changedBy) => {
    await triggerNotification("sip_item_revisit_set", workOrder, { changedBy, eventDescription: "SIP revisit date set" });
  },
  
  imageUploaded: async (workOrder, changedBy) => {
    await triggerNotification("image_uploaded", workOrder, { changedBy, eventDescription: "Image uploaded" });
  },
  
  asapToggled: async (workOrder, isAsap, changedBy) => {
    await triggerNotification(isAsap ? "asap_toggled_on" : "asap_toggled_off", workOrder, { changedBy, eventDescription: isAsap ? "Marked as ASAP - URGENT" : "ASAP status removed" });
  },
  
  assignedToChanged: async (workOrder, previousAssignee, newAssignee, changedBy) => {
    await triggerNotification("assigned_to_changed", workOrder, { previousAssignee, newAssignee, changedBy, eventDescription: `Assignment changed from ${previousAssignee || 'unassigned'} to ${newAssignee}` });
    if (workOrder?.is_rider) {
      await triggerNotification("rider_assigned_to_changed", workOrder, { previousAssignee, newAssignee, changedBy, eventDescription: `Rider assignment changed to ${newAssignee}` });
    }
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
  },

  orderCancelled: async (order, changedBy) => {
    await triggerNotification("order_cancelled", null, {
      changedBy,
      eventDescription: "Order was cancelled",
      orderData: order
    });
  },

  workOrderRestored: async (workOrder, changedBy) => {
    await triggerNotification("work_order_restored", workOrder, { changedBy, eventDescription: "Work order restored from trash" });
  },

  // Emits one event per changed field after a Work Order save, plus the
  // generic "any field" event. Callers pass the saved record and the
  // pre-save baseline; the endpoint re-reads the record server-side.
  workOrderFieldsChanged: async (savedWorkOrder, baselineWorkOrder, changedBy) => {
    if (!savedWorkOrder?.id) return;
    const changed = (field) => {
      const before = baselineWorkOrder?.[field];
      const after = savedWorkOrder?.[field];
      if (field === "files") {
        return (Array.isArray(after) ? after.length : 0) > (Array.isArray(before) ? before.length : 0);
      }
      return JSON.stringify(before ?? null) !== JSON.stringify(after ?? null);
    };
    const emit = (type, fieldName) => triggerNotification(type, savedWorkOrder, {
      changedBy,
      fieldChanged: fieldName,
      oldValue: baselineWorkOrder?.[fieldName],
      newValue: savedWorkOrder?.[fieldName],
      eventDescription: `Work order ${String(fieldName || "").replace(/_/g, " ")} changed`,
    });

    let anyField = false;
    if (changed("client_name")) { await emit("work_order_client_changed", "client_name"); anyField = true; }
    if (changed("description")) { await emit("work_order_description_changed", "description"); anyField = true; }
    if (changed("title")) { await emit("work_order_title_changed", "title"); anyField = true; }
    if (changed("estimate_amount")) { await emit("work_order_estimate_changed", "estimate_amount"); anyField = true; }
    if (changed("contact_name") || changed("contact_email") || changed("contact_phone") || changed("additional_contact")) {
      await emit("work_order_contact_changed", "contact_info"); anyField = true;
    }
    if (changed("install_location")) { await emit("work_order_install_location_changed", "install_location"); anyField = true; }
    if (!baselineWorkOrder?.permit_number && savedWorkOrder?.permit_number) { await emit("work_order_permit_number_set", "permit_number"); anyField = true; }
    if (!baselineWorkOrder?.permit_approved_date && savedWorkOrder?.permit_approved_date) { await emit("work_order_permit_approved", "permit_approved_date"); anyField = true; }
    if (!baselineWorkOrder?.permit_submitted_date && savedWorkOrder?.permit_submitted_date) { await emit("work_order_permit_submitted", "permit_submitted_date"); anyField = true; }
    if (!baselineWorkOrder?.est_inv_at && savedWorkOrder?.est_inv_at) { await emit("work_order_est_inv_set", "est_inv_at"); anyField = true; }
    if (changed("project_install_date")) { await emit("work_order_install_date_set", "project_install_date"); anyField = true; }
    if (changed("project_health")) {
      await emit("work_order_project_health_changed", "project_health");
      // Health-specific convenience events ("Project Health At Risk" etc.)
      // fire the literal advertised trigger for the new health value.
      const HEALTH_TRIGGERS = {
        on_track: "project_health_on_track",
        at_risk: "project_health_at_risk",
        delayed: "project_health_delayed",
        blocked: "project_health_blocked",
      };
      const healthEvent = HEALTH_TRIGGERS[savedWorkOrder?.project_health];
      if (healthEvent) await emit(healthEvent, "project_health");
      anyField = true;
    }
    if (changed("production_type")) { await emit("work_order_production_type_changed", "production_type"); anyField = true; }
    if (changed("files")) { await emit("work_order_file_uploaded", "files"); await emit("file_attached", "files"); anyField = true; }
    if (!baselineWorkOrder?.permit_receipt_confirmed_date && savedWorkOrder?.permit_receipt_confirmed_date) { await emit("permit_receipt_confirmed", "permit_receipt_confirmed_date"); anyField = true; }
    if (!baselineWorkOrder?.permit_approved_date && savedWorkOrder?.permit_approved_date) { await emit("permit_approved", "permit_approved_date"); anyField = true; }
    if (changed("due_date")) {
      if (savedWorkOrder?.due_date) await emit("due_date_set", "due_date");
      else await emit("due_date_cleared", "due_date");
      anyField = true;
    }
    if (!baselineWorkOrder?.start_date && savedWorkOrder?.start_date) { await emit("start_date_set", "start_date"); anyField = true; }
    if (!baselineWorkOrder?.site_survey_date && savedWorkOrder?.site_survey_date) { await emit("site_survey_scheduled", "site_survey_date"); anyField = true; }
    if (!baselineWorkOrder?.google_drive_folder_url && savedWorkOrder?.google_drive_folder_url) { await emit("google_drive_linked", "google_drive_folder_url"); anyField = true; }
    
    // Item-level diffs on the notes[] (tasks) and follow_up[] arrays —
    // one event per transition type per save, not per touched item.
    const itemsOf = (arr) => (Array.isArray(arr) ? arr : []);
    const tasksBefore = itemsOf(baselineWorkOrder?.notes);
    const tasksAfter = itemsOf(savedWorkOrder?.notes);
    const fuBefore = itemsOf(baselineWorkOrder?.follow_up);
    const fuAfter = itemsOf(savedWorkOrder?.follow_up);

    if (fuAfter.length > fuBefore.length) { await emit("follow_up_added", "follow_up"); anyField = true; }
    if (fuAfter.some((it, i) => it?.completed && !fuBefore[i]?.completed)) {
      await emit("follow_up_completed", "follow_up"); anyField = true;
    }

    // Tasks match by id when present, else by position — the array order is
    // stable for in-place edits (toggles, due-date, assignee changes).
    const beforeByKey = new Map(tasksBefore.map((t, i) => [t?.id ?? `idx:${i}`, t]));
    let taskDueSet = false;
    let taskAssigned = false;
    let noteCompleted = false;
    for (let i = 0; i < tasksAfter.length; i++) {
      const t = tasksAfter[i];
      const before = beforeByKey.get(t?.id ?? `idx:${i}`);
      if (!before) continue;
      if (!before.due_date && t?.due_date) taskDueSet = true;
      if ((before.assigned_to || "") !== (t?.assigned_to || "") && t?.assigned_to) taskAssigned = true;
      if (!before.completed && t?.completed) noteCompleted = true;
    }
    if (taskDueSet) { await emit("task_due_date_set", "notes"); anyField = true; }
    if (taskAssigned) { await emit("task_assigned", "notes"); anyField = true; }
    if (noteCompleted) { await emit("note_completed", "notes"); anyField = true; }

    // Role assignments fire whenever the assignee field gains or changes a
    // value — a reassignment is an assignment too.
    const ROLE_TRIGGERS = {
      designer: "designer_assigned",
      surveyor: "surveyor_assigned",
      project_manager: "project_manager_assigned",
      estimator: "estimator_assigned",
    };
    for (const [field, type] of Object.entries(ROLE_TRIGGERS)) {
      const beforeRole = String(baselineWorkOrder?.[field] || "");
      const afterRole = String(savedWorkOrder?.[field] || "");
      if (afterRole && afterRole !== beforeRole) { await emit(type, field); anyField = true; }
    }

    if (changed("sip_revisit_date") && savedWorkOrder?.sip_revisit_date) {
      await emit("sip_item_revisit_set", "sip_revisit_date"); anyField = true;
    }

    // "All tasks done" fires on the transition only — completing the last
    // open task once, not on every later save.
    const allDone = tasksAfter.length > 0 && tasksAfter.every((t) => t?.completed);
    const allDoneBefore = tasksBefore.length > 0 && tasksBefore.every((t) => t?.completed);
    if (allDone && !allDoneBefore) {
      await emit("all_tasks_completed", "notes");
      if (savedWorkOrder?.is_rider) await emit("rider_all_tasks_completed", "notes");
      anyField = true;
    }

if (anyField) {
      await triggerNotification("work_order_updated", savedWorkOrder, { changedBy, eventDescription: "Work order updated" });
    }
  },

  // Fires once per reorder for the work order that moved furthest — a drag
  // renumbers many rows, and an event per row would flood every rule.
  workOrderPriorityReordered: async (loadedItems, reorderedItems, changedBy) => {
    const beforeIndex = new Map((loadedItems || []).map((wo, i) => [wo?.id, i]));
    let moved = null;
    let movedDelta = 0;
    (reorderedItems || []).forEach((wo, i) => {
      const delta = Math.abs(i - (beforeIndex.get(wo?.id) ?? i));
      if (delta > movedDelta) { movedDelta = delta; moved = wo; }
    });
    if (moved) {
      await triggerNotification("priority_changed", moved, {
        changedBy,
        eventDescription: `Work order moved ${movedDelta} position${movedDelta === 1 ? "" : "s"} in the list`,
      });
    }
  },
};