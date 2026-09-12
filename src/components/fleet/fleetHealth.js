const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** @param {any} input */
export function fleetHealthScore(input = {}) {
  const {
    equipment,
    tasks = [],
    workOrders = [],
    notifications = [],
    identityConflict = false,
    todayText = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date()),
  } = input;
  if (!equipment) return { score: 0, label: "Unknown", tone: "danger", deductions: [], signals: [] };
  if (equipment.status === "retired") return { score: null, label: "Retired", tone: "neutral", deductions: [], signals: ["Archived asset"] };

  let score = 100;
  const deductions = [];
  const signals = [];
  const deduct = (points, reason) => {
    if (points <= 0) return;
    score -= points;
    deductions.push({ points, reason });
  };

  if (equipment.status === "down") deduct(30, "Equipment is down");
  else if (equipment.status === "maintenance") deduct(12, "Equipment is in maintenance status");

  const activeOrders = workOrders.filter(order => !["completed", "cancelled"].includes(order.status));
  const criticalOrders = activeOrders.filter(order => order.priority === "critical").length;
  const highOrders = activeOrders.filter(order => order.priority === "high").length;
  deduct(Math.min(40, criticalOrders * 20), `${criticalOrders} critical work order${criticalOrders === 1 ? "" : "s"}`);
  deduct(Math.min(30, highOrders * 10), `${highOrders} high-priority work order${highOrders === 1 ? "" : "s"}`);

  const activeTasks = tasks.filter(task => ["pending", "overdue", "in_progress"].includes(task.status));
  const overdueTasks = activeTasks.filter(task => task.status === "overdue" || (task.status === "pending" && task.start_date && String(task.start_date) < todayText));
  deduct(Math.min(36, overdueTasks.length * 12), `${overdueTasks.length} overdue maintenance schedule${overdueTasks.length === 1 ? "" : "s"}`);

  const horizon = new Date(`${todayText}T12:00:00`);
  horizon.setDate(horizon.getDate() + 14);
  const dueSoon = activeTasks.filter(task => {
    if (!task.start_date || overdueTasks.includes(task)) return false;
    const due = new Date(`${task.start_date}T12:00:00`);
    return !Number.isNaN(due.getTime()) && due <= horizon;
  });
  deduct(Math.min(12, dueSoon.length * 4), `${dueSoon.length} maintenance item${dueSoon.length === 1 ? "" : "s"} due within 14 days`);

  const unread = notifications.filter(note => !note.is_read);
  const criticalAlerts = unread.filter(note => note.severity === "critical").length;
  const warningAlerts = unread.filter(note => note.severity === "warning").length;
  deduct(Math.min(16, criticalAlerts * 8), `${criticalAlerts} unread critical tracking alert${criticalAlerts === 1 ? "" : "s"}`);
  deduct(Math.min(12, warningAlerts * 4), `${warningAlerts} unread tracking warning${warningAlerts === 1 ? "" : "s"}`);

  if (identityConflict || equipment.bouncie_link_status === "ambiguous") deduct(12, "Bouncie identity needs review");

  score = clamp(Math.round(score), 0, 100);
  if (activeOrders.length) signals.push(`${activeOrders.length} active WO${activeOrders.length === 1 ? "" : "s"}`);
  if (overdueTasks.length) signals.push(`${overdueTasks.length} overdue`);
  if (dueSoon.length) signals.push(`${dueSoon.length} due soon`);
  if (unread.length) signals.push(`${unread.length} unread alert${unread.length === 1 ? "" : "s"}`);
  if (!signals.length) signals.push("No current maintenance exceptions");

  const label = score >= 90 ? "Excellent" : score >= 75 ? "Good" : score >= 60 ? "Watch" : score >= 40 ? "Poor" : "Critical";
  const tone = score >= 90 ? "excellent" : score >= 75 ? "good" : score >= 60 ? "attention" : "danger";
  return { score, label, tone, deductions, signals, activeOrders, overdueTasks, dueSoon, unreadAlerts: unread };
}

export function fleetHealthToneClasses(tone) {
  if (tone === "excellent") return "text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900";
  if (tone === "good") return "text-green-700 dark:text-green-300 border-green-200 dark:border-green-900";
  if (tone === "attention") return "text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900";
  if (tone === "danger") return "text-red-700 dark:text-red-300 border-red-200 dark:border-red-900";
  return "text-gray-600 dark:text-slate-300 border-gray-200 dark:border-slate-700";
}
