import { ActivityLog } from "@/entities/ActivityLog";
import { User } from "@/entities/User";
import { NotificationTriggers } from "./NotificationService";

let cachedUser = null;

export async function getCurrentUser() {
  if (!cachedUser) {
    try {
      cachedUser = await User.me();
    } catch (error) {
      console.error("Error getting current user:", error);
      cachedUser = { email: "unknown", full_name: "Unknown User" };
    }
  }
  return cachedUser;
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
  
  await ActivityLog.create({
    work_order_id: workOrderId,
    work_order_title: workOrderTitle || "Unknown",
    action_type: actionType,
    action_details: actionDetails,
    previous_value: previousValue,
    new_value: newValue,
    performed_by_email: user.email,
    performed_by_name: user.full_name || user.email.split("@")[0]
  });
}

// Helper functions for common actions - logs activity AND triggers email notifications
export const ActivityActions = {
  workOrderCreated: async (wo) => {
    const user = await getCurrentUser();
    await logActivity({
      workOrderId: wo.id,
      workOrderTitle: wo.title,
      actionType: "work_order_created",
      actionDetails: `Created work order "${wo.title}" for ${wo.client_name}`
    });
    NotificationTriggers.workOrderCreated(wo, user.full_name || user.email);
  },

  workOrderCompleted: async (wo) => {
    const user = await getCurrentUser();
    await logActivity({
      workOrderId: wo.id,
      workOrderTitle: wo.title,
      actionType: "work_order_completed",
      actionDetails: `Marked "${wo.title}" as completed`
    });
    NotificationTriggers.workOrderCompleted(wo, user.full_name || user.email);
  },

  workOrderDeleted: async (wo) => {
    const user = await getCurrentUser();
    await logActivity({
      workOrderId: wo.id,
      workOrderTitle: wo.title,
      actionType: "work_order_deleted",
      actionDetails: `Deleted work order "${wo.title}"`
    });
    NotificationTriggers.workOrderDeleted(wo, user.full_name || user.email);
  },

  riderCreated: async (wo, parentTitle) => {
    const user = await getCurrentUser();
    await logActivity({
      workOrderId: wo.id,
      workOrderTitle: wo.title,
      actionType: "rider_created",
      actionDetails: `Created rider "${wo.title}" for parent "${parentTitle}"`
    });
    NotificationTriggers.riderCreated(wo, parentTitle, user.full_name || user.email);
  },

  stageChanged: async (wo, fromStage, toStage) => {
    const user = await getCurrentUser();
    await logActivity({
      workOrderId: wo.id,
      workOrderTitle: wo.title,
      actionType: "stage_changed",
      actionDetails: `Moved "${wo.title}" from ${fromStage} to ${toStage}`,
      previousValue: fromStage,
      newValue: toStage
    });
    NotificationTriggers.stageChanged(wo, fromStage, toStage, user.full_name || user.email);
  },

  noteAdded: async (wo, noteText, noteType) => {
    const user = await getCurrentUser();
    await logActivity({
      workOrderId: wo.id,
      workOrderTitle: wo.title,
      actionType: "note_added",
      actionDetails: `Added ${noteType} note to "${wo.title}": "${noteText.substring(0, 50)}${noteText.length > 50 ? '...' : ''}"`
    });
    NotificationTriggers.noteAdded(wo, noteText, noteType, user.full_name || user.email);
  },

  noteDeleted: async (wo) => {
    const user = await getCurrentUser();
    await logActivity({
      workOrderId: wo.id,
      workOrderTitle: wo.title,
      actionType: "note_deleted",
      actionDetails: `Deleted a note from "${wo.title}"`
    });
    NotificationTriggers.noteDeleted(wo, user.full_name || user.email);
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
    await logActivity({
      workOrderId: wo.id,
      workOrderTitle: wo.title,
      actionType: "task_added",
      actionDetails: `Added task to "${wo.title}": "${taskText.substring(0, 50)}${taskText.length > 50 ? '...' : ''}"`
    });
    NotificationTriggers.taskAdded(wo, taskText, user.full_name || user.email);
  },

  taskCompleted: async (wo, taskText) => {
    const user = await getCurrentUser();
    await logActivity({
      workOrderId: wo.id,
      workOrderTitle: wo.title,
      actionType: "task_completed",
      actionDetails: `Completed task on "${wo.title}": "${taskText.substring(0, 50)}${taskText.length > 50 ? '...' : ''}"`
    });
    NotificationTriggers.taskCompleted(wo, taskText, user.full_name || user.email);
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
    await logActivity({
      workOrderId: wo.id,
      workOrderTitle: wo.title,
      actionType: "task_deleted",
      actionDetails: `Deleted a task from "${wo.title}"`
    });
    NotificationTriggers.taskDeleted(wo, user.full_name || user.email);
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
    await logActivity({
      workOrderId: wo.id,
      workOrderTitle: wo.title,
      actionType: "image_uploaded",
      actionDetails: `Uploaded image to "${wo.title}"`
    });
    NotificationTriggers.imageUploaded(wo, user.full_name || user.email);
  },

  asapToggled: async (wo, isAsap) => {
    const user = await getCurrentUser();
    await logActivity({
      workOrderId: wo.id,
      workOrderTitle: wo.title,
      actionType: "asap_toggled",
      actionDetails: `${isAsap ? 'Marked' : 'Unmarked'} "${wo.title}" as ASAP`,
      newValue: isAsap ? "ASAP" : "Normal"
    });
    NotificationTriggers.asapToggled(wo, isAsap, user.full_name || user.email);
  },

  priorityChanged: async (wo, newPriority) => {
    const user = await getCurrentUser();
    await logActivity({
      workOrderId: wo.id,
      workOrderTitle: wo.title,
      actionType: "priority_changed",
      actionDetails: `Changed priority of "${wo.title}" to #${newPriority}`
    });
    NotificationTriggers.priorityChanged(wo, user.full_name || user.email);
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
    await logActivity({
      workOrderId: wo.id,
      workOrderTitle: wo.title,
      actionType: "work_order_updated",
      actionDetails: `Updated ${fieldName} on "${wo.title}"`,
      previousValue: oldValue,
      newValue: newValue
    });
    if (fieldName === "assigned_to") {
      NotificationTriggers.assignedToChanged(wo, oldValue, newValue, user.full_name || user.email);
    }
  }
};