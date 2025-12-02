import { ActivityLog } from "@/entities/ActivityLog";
import { User } from "@/entities/User";

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

// Helper functions for common actions
export const ActivityActions = {
  workOrderCreated: (wo) => logActivity({
    workOrderId: wo.id,
    workOrderTitle: wo.title,
    actionType: "work_order_created",
    actionDetails: `Created work order "${wo.title}" for ${wo.client_name}`
  }),

  workOrderCompleted: (wo) => logActivity({
    workOrderId: wo.id,
    workOrderTitle: wo.title,
    actionType: "work_order_completed",
    actionDetails: `Marked "${wo.title}" as completed`
  }),

  workOrderDeleted: (wo) => logActivity({
    workOrderId: wo.id,
    workOrderTitle: wo.title,
    actionType: "work_order_deleted",
    actionDetails: `Deleted work order "${wo.title}"`
  }),

  riderCreated: (wo, parentTitle) => logActivity({
    workOrderId: wo.id,
    workOrderTitle: wo.title,
    actionType: "rider_created",
    actionDetails: `Created rider "${wo.title}" for parent "${parentTitle}"`
  }),

  stageChanged: (wo, fromStage, toStage) => logActivity({
    workOrderId: wo.id,
    workOrderTitle: wo.title,
    actionType: "stage_changed",
    actionDetails: `Moved "${wo.title}" from ${fromStage} to ${toStage}`,
    previousValue: fromStage,
    newValue: toStage
  }),

  noteAdded: (wo, noteText, noteType) => logActivity({
    workOrderId: wo.id,
    workOrderTitle: wo.title,
    actionType: "note_added",
    actionDetails: `Added ${noteType} note to "${wo.title}": "${noteText.substring(0, 50)}${noteText.length > 50 ? '...' : ''}"`
  }),

  noteDeleted: (wo) => logActivity({
    workOrderId: wo.id,
    workOrderTitle: wo.title,
    actionType: "note_deleted",
    actionDetails: `Deleted a note from "${wo.title}"`
  }),

  subNoteAdded: (wo, text) => logActivity({
    workOrderId: wo.id,
    workOrderTitle: wo.title,
    actionType: "sub_note_added",
    actionDetails: `Added sub-note to "${wo.title}": "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`
  }),

  subNoteDeleted: (wo) => logActivity({
    workOrderId: wo.id,
    workOrderTitle: wo.title,
    actionType: "sub_note_deleted",
    actionDetails: `Deleted a sub-note from "${wo.title}"`
  }),

  taskAdded: (wo, taskText) => logActivity({
    workOrderId: wo.id,
    workOrderTitle: wo.title,
    actionType: "task_added",
    actionDetails: `Added task to "${wo.title}": "${taskText.substring(0, 50)}${taskText.length > 50 ? '...' : ''}"`
  }),

  taskCompleted: (wo, taskText) => logActivity({
    workOrderId: wo.id,
    workOrderTitle: wo.title,
    actionType: "task_completed",
    actionDetails: `Completed task on "${wo.title}": "${taskText.substring(0, 50)}${taskText.length > 50 ? '...' : ''}"`
  }),

  taskUncompleted: (wo, taskText) => logActivity({
    workOrderId: wo.id,
    workOrderTitle: wo.title,
    actionType: "task_uncompleted",
    actionDetails: `Uncompleted task on "${wo.title}": "${taskText.substring(0, 50)}${taskText.length > 50 ? '...' : ''}"`
  }),

  taskDeleted: (wo) => logActivity({
    workOrderId: wo.id,
    workOrderTitle: wo.title,
    actionType: "task_deleted",
    actionDetails: `Deleted a task from "${wo.title}"`
  }),

  taskEdited: (wo, oldText, newText) => logActivity({
    workOrderId: wo.id,
    workOrderTitle: wo.title,
    actionType: "task_edited",
    actionDetails: `Edited task on "${wo.title}"`,
    previousValue: oldText,
    newValue: newText
  }),

  imageUploaded: (wo) => logActivity({
    workOrderId: wo.id,
    workOrderTitle: wo.title,
    actionType: "image_uploaded",
    actionDetails: `Uploaded image to "${wo.title}"`
  }),

  asapToggled: (wo, isAsap) => logActivity({
    workOrderId: wo.id,
    workOrderTitle: wo.title,
    actionType: "asap_toggled",
    actionDetails: `${isAsap ? 'Marked' : 'Unmarked'} "${wo.title}" as ASAP`,
    newValue: isAsap ? "ASAP" : "Normal"
  }),

  priorityChanged: (wo, newPriority) => logActivity({
    workOrderId: wo.id,
    workOrderTitle: wo.title,
    actionType: "priority_changed",
    actionDetails: `Changed priority of "${wo.title}" to #${newPriority}`
  }),

  restored: (wo, toStage) => logActivity({
    workOrderId: wo.id,
    workOrderTitle: wo.title,
    actionType: "restored",
    actionDetails: `Restored "${wo.title}" to ${toStage} stage`,
    newValue: toStage
  }),

  fieldUpdated: (wo, fieldName, oldValue, newValue) => logActivity({
    workOrderId: wo.id,
    workOrderTitle: wo.title,
    actionType: "work_order_updated",
    actionDetails: `Updated ${fieldName} on "${wo.title}"`,
    previousValue: oldValue,
    newValue: newValue
  })
};