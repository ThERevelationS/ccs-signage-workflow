import { base44 } from "@/api/base44Client";
import { NotificationTriggers } from "./NotificationService";

const ActivityLog = base44.entities.ActivityLog;

export async function getCurrentUser() {
  // Get user from localStorage (set by EmailGate)
  const storedEmail = localStorage.getItem("userEmail");
  if (storedEmail) {
    try {
      const users = await base44.entities.AuthorizedEmail.list();
      const user = users.find(u => u.email?.toLowerCase() === storedEmail.toLowerCase());
      if (user) {
        return user;
      }
    } catch (error) {
      console.error("Error getting current user:", error);
    }
  }
  return { email: "unknown", full_name: "Unknown User" };
}

export function getUserDisplayName(user) {
  if (user?.full_name) {
    return user.full_name.split(" ")[0]; // First name only
  }
  if (user?.email) {
    return user.email.split("@")[0];
  }
  return "Unknown";
}

export async function logActivity({
  workOrderId,
  workOrderTitle,
  actionType,
  actionDetails,
  previousValue = null,
  newValue = null
}) {
  const user = await getCurrentUser();
  const displayName = getUserDisplayName(user);
  
  await ActivityLog.create({
    work_order_id: workOrderId,
    work_order_title: workOrderTitle || "Unknown",
    action_type: actionType,
    action_details: actionDetails,
    previous_value: previousValue,
    new_value: newValue,
    performed_by_email: user.email,
    performed_by_name: displayName
  });
}

// Helper functions for common actions - logs activity AND triggers email notifications
export const ActivityActions = {
  workOrderCreated: async (wo) => {
    const user = await getCurrentUser();
    const displayName = getUserDisplayName(user);
    await logActivity({
      workOrderId: wo.id,
      workOrderTitle: wo.title,
      actionType: "work_order_created",
      actionDetails: `Created work order "${wo.title}" for ${wo.client_name}`
    });
    await NotificationTriggers.workOrderCreated(wo, displayName);
  },

  workOrderCompleted: async (wo) => {
    const user = await getCurrentUser();
    const displayName = getUserDisplayName(user);
    await logActivity({
      workOrderId: wo.id,
      workOrderTitle: wo.title,
      actionType: "work_order_completed",
      actionDetails: `Marked "${wo.title}" as completed`
    });
    await NotificationTriggers.workOrderCompleted(wo, displayName);
  },

  workOrderDeleted: async (wo) => {
    const user = await getCurrentUser();
    const displayName = getUserDisplayName(user);
    await logActivity({
      workOrderId: wo.id,
      workOrderTitle: wo.title,
      actionType: "work_order_deleted",
      actionDetails: `Deleted work order "${wo.title}"`
    });
    await NotificationTriggers.workOrderDeleted(wo, displayName);
  },

  riderCreated: async (wo, parentTitle) => {
    const user = await getCurrentUser();
    const displayName = getUserDisplayName(user);
    await logActivity({
      workOrderId: wo.id,
      workOrderTitle: wo.title,
      actionType: "rider_created",
      actionDetails: `Created rider "${wo.title}" for parent "${parentTitle}"`
    });
    await NotificationTriggers.riderCreated(wo, parentTitle, displayName);
  },

  stageChanged: async (wo, fromStage, toStage) => {
    const user = await getCurrentUser();
    const displayName = getUserDisplayName(user);
    await logActivity({
      workOrderId: wo.id,
      workOrderTitle: wo.title,
      actionType: "stage_changed",
      actionDetails: `Moved "${wo.title}" from ${fromStage} to ${toStage}`,
      previousValue: fromStage,
      newValue: toStage
    });
    await NotificationTriggers.stageChanged(wo, fromStage, toStage, displayName);
  },

  noteAdded: async (wo, noteText, noteType) => {
    const user = await getCurrentUser();
    const displayName = getUserDisplayName(user);
    await logActivity({
      workOrderId: wo.id,
      workOrderTitle: wo.title,
      actionType: "note_added",
      actionDetails: `Added ${noteType} note to "${wo.title}": "${noteText.substring(0, 50)}${noteText.length > 50 ? '...' : ''}"`
    });
    await NotificationTriggers.noteAdded(wo, noteText, noteType, displayName);
  },

  noteDeleted: async (wo) => {
    const user = await getCurrentUser();
    const displayName = getUserDisplayName(user);
    await logActivity({
      workOrderId: wo.id,
      workOrderTitle: wo.title,
      actionType: "note_deleted",
      actionDetails: `Deleted a note from "${wo.title}"`
    });
    await NotificationTriggers.noteDeleted(wo, displayName);
  },

  subNoteAdded: async (wo, text) => {
    await logActivity({
      workOrderId: wo.id,
      workOrderTitle: wo.title,
      actionType: "sub_note_added",
      actionDetails: `Added sub-note to "${wo.title}": "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`
    });
  },

  subNoteDeleted: async (wo) => {
    await logActivity({
      workOrderId: wo.id,
      workOrderTitle: wo.title,
      actionType: "sub_note_deleted",
      actionDetails: `Deleted a sub-note from "${wo.title}"`
    });
  },

  taskAdded: async (wo, taskText) => {
    const user = await getCurrentUser();
    const displayName = getUserDisplayName(user);
    await logActivity({
      workOrderId: wo.id,
      workOrderTitle: wo.title,
      actionType: "task_added",
      actionDetails: `Added task to "${wo.title}": "${taskText.substring(0, 50)}${taskText.length > 50 ? '...' : ''}"`
    });
    await NotificationTriggers.taskAdded(wo, taskText, displayName);
  },

  taskCompleted: async (wo, taskText) => {
    const user = await getCurrentUser();
    const displayName = getUserDisplayName(user);
    await logActivity({
      workOrderId: wo.id,
      workOrderTitle: wo.title,
      actionType: "task_completed",
      actionDetails: `Completed task on "${wo.title}": "${taskText.substring(0, 50)}${taskText.length > 50 ? '...' : ''}"`
    });
    await NotificationTriggers.taskCompleted(wo, taskText, displayName);
  },

  taskUncompleted: async (wo, taskText) => {
    await logActivity({
      workOrderId: wo.id,
      workOrderTitle: wo.title,
      actionType: "task_uncompleted",
      actionDetails: `Uncompleted task on "${wo.title}": "${taskText.substring(0, 50)}${taskText.length > 50 ? '...' : ''}"`
    });
  },

  taskDeleted: async (wo) => {
    const user = await getCurrentUser();
    const displayName = getUserDisplayName(user);
    await logActivity({
      workOrderId: wo.id,
      workOrderTitle: wo.title,
      actionType: "task_deleted",
      actionDetails: `Deleted a task from "${wo.title}"`
    });
    await NotificationTriggers.taskDeleted(wo, displayName);
  },

  taskEdited: async (wo, oldText, newText) => {
    await logActivity({
      workOrderId: wo.id,
      workOrderTitle: wo.title,
      actionType: "task_edited",
      actionDetails: `Edited task on "${wo.title}"`,
      previousValue: oldText,
      newValue: newText
    });
  },

  imageUploaded: async (wo) => {
    const user = await getCurrentUser();
    const displayName = getUserDisplayName(user);
    await logActivity({
      workOrderId: wo.id,
      workOrderTitle: wo.title,
      actionType: "image_uploaded",
      actionDetails: `Uploaded image to "${wo.title}"`
    });
    await NotificationTriggers.imageUploaded(wo, displayName);
  },

  asapToggled: async (wo, isAsap) => {
    const user = await getCurrentUser();
    const displayName = getUserDisplayName(user);
    await logActivity({
      workOrderId: wo.id,
      workOrderTitle: wo.title,
      actionType: "asap_toggled",
      actionDetails: `${isAsap ? 'Marked' : 'Unmarked'} "${wo.title}" as ASAP`,
      newValue: isAsap ? "ASAP" : "Normal"
    });
    await NotificationTriggers.asapToggled(wo, isAsap, displayName);
  },

  priorityChanged: async (wo, newPriority) => {
    const user = await getCurrentUser();
    const displayName = getUserDisplayName(user);
    await logActivity({
      workOrderId: wo.id,
      workOrderTitle: wo.title,
      actionType: "priority_changed",
      actionDetails: `Changed priority of "${wo.title}" to #${newPriority}`
    });
    await NotificationTriggers.priorityChanged(wo, displayName);
  },

  restored: async (wo, toStage) => {
    await logActivity({
      workOrderId: wo.id,
      workOrderTitle: wo.title,
      actionType: "restored",
      actionDetails: `Restored "${wo.title}" to ${toStage} stage`,
      newValue: toStage
    });
  },

  fieldUpdated: async (wo, fieldName, oldValue, newValue) => {
    const user = await getCurrentUser();
    const displayName = getUserDisplayName(user);
    await logActivity({
      workOrderId: wo.id,
      workOrderTitle: wo.title,
      actionType: "work_order_updated",
      actionDetails: `Updated ${fieldName} on "${wo.title}"`,
      previousValue: oldValue,
      newValue: newValue
    });
    if (fieldName === "assigned_to") {
      await NotificationTriggers.assignedToChanged(wo, oldValue, newValue, displayName);
    }
  }
};