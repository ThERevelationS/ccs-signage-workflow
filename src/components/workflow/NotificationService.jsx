import { EmailNotificationSettings } from "@/entities/EmailNotificationSettings";
import { User } from "@/entities/User";
import { SendEmail } from "@/integrations/Core";

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

// Main notification trigger function
export const triggerNotification = async (triggerType, workOrder, extraData = {}) => {
  try {
    // Get all enabled notification rules for this trigger type
    const allRules = await EmailNotificationSettings.filter({ enabled: true });
    const matchingRules = allRules
      .filter(rule => rule.trigger_type === triggerType)
      .filter(rule => matchesConditions(rule, workOrder, extraData))
      .sort((a, b) => (a.priority || 0) - (b.priority || 0));
    
    if (matchingRules.length === 0) return;
    
    // Process each matching rule
    for (const rule of matchingRules) {
      const recipients = await getRecipients(rule, workOrder);
      
      if (recipients.length === 0) continue;
      
      const subject = replaceVariables(rule.email_subject, workOrder, extraData);
      const body = replaceVariables(rule.email_body, workOrder, extraData);
      
      // Send to each recipient
      for (const email of recipients) {
        try {
          await SendEmail({
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
  } catch (error) {
    console.error("Error triggering notification:", error);
  }
};

// Convenience functions for specific triggers
export const NotificationTriggers = {
  workOrderCreated: (workOrder, changedBy) => 
    triggerNotification("work_order_created", workOrder, { changedBy }),
  
  workOrderCompleted: (workOrder, changedBy) => 
    triggerNotification("work_order_completed", workOrder, { changedBy }),
  
  workOrderDeleted: (workOrder, changedBy) => 
    triggerNotification("work_order_deleted", workOrder, { changedBy }),
  
  riderCreated: (workOrder, parentTitle, changedBy) => 
    triggerNotification("rider_created", workOrder, { parentTitle, changedBy }),
  
  stageChanged: (workOrder, previousStage, newStage, changedBy) => {
    triggerNotification("stage_changed", workOrder, { previousStage, newStage, changedBy });
    triggerNotification("stage_exited", workOrder, { previousStage, newStage, changedBy });
    triggerNotification("stage_entered", workOrder, { previousStage, newStage, changedBy });
  },
  
  taskAdded: (workOrder, taskText, changedBy) => 
    triggerNotification("task_added", workOrder, { taskText, changedBy }),
  
  taskCompleted: (workOrder, taskText, changedBy) => 
    triggerNotification("task_completed", workOrder, { taskText, changedBy }),
  
  taskDeleted: (workOrder, changedBy) => 
    triggerNotification("task_deleted", workOrder, { changedBy }),
  
  noteAdded: (workOrder, noteText, noteType, changedBy) => 
    triggerNotification("note_added", workOrder, { noteText, noteType, changedBy }),
  
  noteDeleted: (workOrder, changedBy) => 
    triggerNotification("note_deleted", workOrder, { changedBy }),
  
  imageUploaded: (workOrder, changedBy) => 
    triggerNotification("image_uploaded", workOrder, { changedBy }),
  
  asapToggled: (workOrder, isAsap, changedBy) => 
    triggerNotification(isAsap ? "asap_toggled_on" : "asap_toggled_off", workOrder, { changedBy }),
  
  assignedToChanged: (workOrder, previousAssignee, newAssignee, changedBy) => 
    triggerNotification("assigned_to_changed", workOrder, { previousAssignee, newAssignee, changedBy }),
  
  priorityChanged: (workOrder, changedBy) => 
    triggerNotification("priority_changed", workOrder, { changedBy }),
  
  automationTriggered: (workOrder, automationName, changedBy) => 
    triggerNotification("automation_triggered", workOrder, { automationName, changedBy })
};