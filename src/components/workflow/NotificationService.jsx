import { base44 } from "@/api/base44Client";
const EmailNotificationSettings = base44.entities.EmailNotificationSettings;
const AutomationRule = base44.entities.AutomationRule;
const EmailGroup = base44.entities.EmailGroup;
const User = base44.entities.User;

// Generate AI-enhanced email content
const generateAIEmail = async (templateSubject, templateBody, workOrder, extraData = {}) => {
  try {
    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `You are an automated workflow notification system for Cincinnati Signs. Generate a brief, impersonal notification email.

EVENT: ${extraData.eventDescription || "Work order update"}
WORK ORDER: "${workOrder?.title || "Unknown"}" for client "${workOrder?.client_name || "Unknown"}"
${extraData.previousStage ? `MOVED FROM: ${formatStageName(extraData.previousStage)}` : ""}
${extraData.newStage ? `MOVED TO: ${formatStageName(extraData.newStage)}` : ""}
CURRENT STAGE: ${formatStageName(workOrder?.current_stage)}
ASSIGNED TO: ${workOrder?.assigned_to || "Unassigned"}
${workOrder?.due_date ? `DUE DATE: ${workOrder.due_date}` : ""}
${workOrder?.asap ? "PRIORITY: ASAP - URGENT" : ""}
${workOrder?.is_rider ? "TYPE: This is a RIDER task" : ""}
${extraData.taskText ? `TASK: ${extraData.taskText}` : ""}
${extraData.noteText ? `NOTE: ${extraData.noteText}` : ""}

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
          const users = await User.list();
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
        const admins = await User.filter({ role: "admin" });
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

// Check if automation triggers match (with AND/OR logic support)
const checkAutomationTriggers = (automation, triggerType, workOrder, extraData = {}) => {
  const triggers = automation.triggers || [];
  if (triggers.length === 0) return false;
  
  // Check if ANY trigger matches the current trigger type
  const hasMatchingTriggerType = triggers.some(t => t.trigger_type === triggerType);
  if (!hasMatchingTriggerType) return false;
  
  // For single trigger, just check if it matches
  if (triggers.length === 1) {
    const trigger = triggers[0];
    return trigger.trigger_type === triggerType && 
      matchesTriggerConditions(trigger.trigger_condition, workOrder, extraData, triggerType);
  }
  
  // For multiple triggers, evaluate with AND/OR logic
  let result = null;
  
  for (let i = 0; i < triggers.length; i++) {
    const trigger = triggers[i];
    const triggerMatches = trigger.trigger_type === triggerType && 
      matchesTriggerConditions(trigger.trigger_condition, workOrder, extraData, triggerType);
    
    if (i === 0) {
      result = triggerMatches;
    } else {
      const logic = trigger.logic || "or";
      if (logic === "and") {
        result = result && triggerMatches;
      } else {
        result = result || triggerMatches;
      }
    }
  }
  
  return result === true;
};

// Check trigger conditions for a single trigger
const matchesTriggerConditions = (conditions, workOrder, extraData = {}, triggerType = "") => {
  if (!conditions) return true;
  
  // For stage_entered, check against the NEW stage (to_stage)
  // For stage_exited, check against the OLD stage (from_stage)
  if (conditions.stage) {
    if (triggerType === "stage_entered" && extraData.newStage !== conditions.stage) {
      return false;
    } else if (triggerType === "stage_exited" && extraData.previousStage !== conditions.stage) {
      return false;
    } else if (triggerType !== "stage_entered" && triggerType !== "stage_exited" && workOrder?.current_stage !== conditions.stage) {
      return false;
    }
  }
  
  if (conditions.from_stage && extraData.previousStage !== conditions.from_stage) {
    return false;
  }
  
  if (conditions.to_stage && extraData.newStage !== conditions.to_stage) {
    return false;
  }
  
  if (conditions.assigned_to && workOrder?.assigned_to !== conditions.assigned_to) {
    return false;
  }
  
  if (conditions.is_asap === true && !workOrder?.asap) {
    return false;
  }
  
  // Rider filtering - if is_rider is explicitly set, enforce it
  // is_rider: true means ONLY riders
  // is_rider: false means ONLY non-riders (full work orders)
  if (conditions.is_rider === true && !workOrder?.is_rider) {
    return false;
  }
  
  if (conditions.is_rider === false && workOrder?.is_rider) {
    return false;
  }
  
  return true;
};

// Get recipients for automation email action
const getAutomationRecipients = async (actionConfig, workOrder) => {
  const emails = new Set();
  const recipients = actionConfig.recipients || [];
  
  for (const recipient of recipients) {
    switch (recipient.type) {
      case "email":
        if (recipient.value) emails.add(recipient.value);
        break;
      case "assigned_user":
        if (workOrder?.assigned_to) {
          const users = await User.list();
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
        const admins = await User.filter({ role: "admin" });
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
      case "email_group":
        if (recipient.value) {
          try {
            const groups = await EmailGroup.list();
            const group = groups.find(g => g.id === recipient.value);
            if (group?.emails) {
              group.emails.forEach(email => emails.add(email));
            }
          } catch (e) {
            console.error("Error fetching email group:", e);
          }
        }
        break;
    }
  }
  
  return Array.from(emails);
};

// Main notification trigger function
export const triggerNotification = async (triggerType, workOrder, extraData = {}) => {
  try {
    // Check old EmailNotificationSettings rules
    const allRules = await EmailNotificationSettings.filter({ enabled: true });
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
    
    // Check new AutomationRule rules
    const allAutomations = await AutomationRule.filter({ enabled: true });
    const matchingAutomations = allAutomations
      .filter(automation => checkAutomationTriggers(automation, triggerType, workOrder, extraData))
      .sort((a, b) => (a.priority || 0) - (b.priority || 0));
    
    // Process automation rules
    for (const automation of matchingAutomations) {
      const actions = automation.actions || [];
      
      for (const action of actions) {
        if (action.action_type === "send_email") {
          const config = action.action_config || {};
          const recipients = await getAutomationRecipients(config, workOrder);

          if (recipients.length === 0) continue;

          const templateSubject = replaceVariables(config.subject || "", workOrder, extraData);
          const templateBody = replaceVariables(config.body || "", workOrder, extraData);

          // Generate AI-enhanced email
          const { subject, body } = await generateAIEmail(templateSubject, templateBody, workOrder, extraData);

          for (const email of recipients) {
            try {
              await base44.functions.invoke('sendGmail', {
                to: email,
                subject: subject,
                body: body
              });
              console.log(`Automation "${automation.name}" sent email to ${email}`);
            } catch (emailError) {
              console.error(`Failed to send automation email to ${email}:`, emailError);
            }
          }
        }
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
    await triggerNotification("order_created", null, { 
      changedBy, 
      eventDescription: "New order created",
      orderData: order
    });
  },
  
  orderOrdered: async (order, changedBy) => {
    await triggerNotification("order_ordered", null, { 
      changedBy, 
      eventDescription: "Order has been placed",
      orderData: order
    });
  },
  
  orderReceived: async (order, changedBy) => {
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
  }
};