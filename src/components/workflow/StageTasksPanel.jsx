import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2, ClipboardList, Loader2 } from "lucide-react";

const GeneralTask = base44.entities.GeneralTask;

// Displays general office tasks assigned to a specific workflow stage page,
// so the team working that stage sees stage-tagged tasks alongside their work orders.
export default function StageTasksPanel({ stage }) {
  const [tasks, setTasks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = async () => {
    try {
      const all = await GeneralTask.filter({ completed: false });
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
    await GeneralTask.update(task.id, { completed: !task.completed });
    load();
  };

  const handleDelete = async (task) => {
    await GeneralTask.delete(task.id);
    load();
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-3 text-xs text-gray-400">
        <Loader2 className="w-3 h-3 animate-spin" /> Loading office tasks…
      </div>
    );
  }

  if (tasks.length === 0) return null;

  return (
    <div className="clay-card p-3 mb-4">
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