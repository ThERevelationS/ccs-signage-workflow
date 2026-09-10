import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2, ClipboardList, Loader2 } from "lucide-react";
import { deleteGeneralTaskIfUnchanged, updateGeneralTaskIfUnchanged } from "@/components/workflow/generalTaskPersistence";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";

const GeneralTask = base44.entities.GeneralTask;

// Displays general office tasks assigned to a specific workflow stage page,
// so the team working that stage sees stage-tagged tasks alongside their work orders.
export default function StageTasksPanel({ stage }) {
  const [tasks, setTasks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [persistenceError, setPersistenceError] = useState("");

  const load = async () => {
    try {
      const all = await loadAllEntityRows({
        entity: GeneralTask,
        query: { completed: false },
        sort: "created_date",
        label: `Open ${stage} office tasks`,
      });
      const filtered = (all || []).filter(t => t.stage === stage);
      setTasks(filtered);
    } catch (e) {
      console.error("Error loading stage tasks:", e);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    setIsLoading(true);
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, [stage]);

  const toggleComplete = async (task) => {
    setPersistenceError("");
    try {
      await updateGeneralTaskIfUnchanged({
        entity: GeneralTask,
        task,
        nextFields: { completed: !task.completed },
        label: `General task ${task.text || task.id}`,
      });
    } catch (error) {
      console.error("General task completion update blocked:", error);
      setPersistenceError(error?.message || "This task changed in another session. Reload before updating it.");
    }
    await load();
  };

  const handleDelete = async (task) => {
    setPersistenceError("");
    try {
      await deleteGeneralTaskIfUnchanged({
        entity: GeneralTask,
        task,
        label: `General task ${task.text || task.id} deletion`,
      });
    } catch (error) {
      console.error("General task deletion blocked:", error);
      setPersistenceError(error?.message || "This task changed in another session and was not deleted.");
    }
    await load();
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-3 text-xs text-gray-400">
        <Loader2 className="w-3 h-3 animate-spin" /> Loading office tasks…
      </div>
    );
  }

  if (tasks.length === 0 && !persistenceError) return null;

  return (
    <div className="clay-card p-3 mb-4">
      {persistenceError && (
        <div className="mb-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800">
          <div className="font-medium">Office task update blocked</div>
          <div className="mt-1">{persistenceError}</div>
        </div>
      )}
      <h3 className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-1.5">
        <ClipboardList className="w-4 h-4 text-purple-600" />
        Office Tasks ({tasks.length})
      </h3>
      <div className="space-y-1.5">
        {tasks.map(task => {
          const assignees = Array.isArray(task.assigned_to)
            ? task.assigned_to
            : (task.assigned_to ? [task.assigned_to] : []);
          return (
            <div key={task.id} className="flex items-start gap-2 p-2 rounded border bg-white border-gray-200">
              <Checkbox
                checked={!!task.completed}
                onCheckedChange={() => toggleComplete(task)}
                className="h-3.5 w-3.5 mt-0.5"
              />
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-medium ${task.completed ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                  {task.text}
                </p>
                {assignees.length > 0 && (
                  <p className="text-[10px] text-gray-400 mt-0.5">→ {assignees.join(', ')}</p>
                )}
                {(task.sub_tasks || []).length > 0 && (
                  <div className="mt-1 ml-2 space-y-0.5">
                    {(task.sub_tasks || []).map((st, i) => (
                      <p key={i} className={`text-[10px] ${st.completed ? 'line-through text-gray-400' : 'text-gray-500'}`}>
                        • {st.text}
                      </p>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={() => handleDelete(task)}
                className="text-red-400 hover:text-red-600 p-1"
                title="Delete task"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}