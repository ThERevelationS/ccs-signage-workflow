import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Save, Edit, Check, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

const TaskTemplate = base44.entities.TaskTemplate;

export default function TaskTemplateDialog({ isOpen, onClose, onUseTemplate }) {
  const [templates, setTemplates] = useState([]);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [templateName, setTemplateName] = useState("");
  const [templateTasks, setTemplateTasks] = useState([{ text: "", sub_tasks: [] }]);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  useEffect(() => {
    if (isOpen) {
      loadTemplates();
    }
  }, [isOpen]);

  const loadTemplates = async () => {
    const allTemplates = await TaskTemplate.list();
    setTemplates(allTemplates);
  };

  const handleSaveTemplate = async () => {
    if (!templateName.trim()) {
      alert("Please enter a template name");
      return;
    }
    
    const validTasks = templateTasks.filter(t => t.text.trim());
    if (validTasks.length === 0) {
      alert("Please add at least one task");
      return;
    }

    const templateData = {
      name: templateName,
      tasks: validTasks.map(t => ({
        text: t.text,
        sub_tasks: t.sub_tasks
          .filter(st => (typeof st === 'string' ? st.trim() : st.text?.trim()))
          .map(st => typeof st === 'string' 
            ? { text: st, details: [] }
            : { text: st.text, details: (st.details || []).filter(d => d.trim()) }
          )
      }))
    };

    if (editingTemplate) {
      await TaskTemplate.update(editingTemplate.id, templateData);
    } else {
      await TaskTemplate.create(templateData);
    }

    setTemplateName("");
    setTemplateTasks([{ text: "", sub_tasks: [] }]);
    setEditingTemplate(null);
    await loadTemplates();
  };

  const handleEditTemplate = (template) => {
    setEditingTemplate(template);
    setTemplateName(template.name);
    setTemplateTasks(template.tasks.map(t => ({
      text: t.text,
      sub_tasks: (t.sub_tasks || []).map(st => 
        typeof st === 'string' ? { text: st, details: [] } : { text: st.text || st, details: st.details || [] }
      )
    })));
  };

  const handleDeleteTemplate = async () => {
    await TaskTemplate.delete(deleteConfirm.id);
    setDeleteConfirm(null);
    await loadTemplates();
  };

  const handleUseTemplate = (template) => {
    onUseTemplate(template);
    onClose();
  };

  const addTask = () => {
    setTemplateTasks([...templateTasks, { text: "", sub_tasks: [] }]);
  };

  const removeTask = (index) => {
    setTemplateTasks(templateTasks.filter((_, i) => i !== index));
  };

  const updateTask = (index, text) => {
    const updated = [...templateTasks];
    updated[index].text = text;
    setTemplateTasks(updated);
  };

  const addSubTask = (taskIndex) => {
    const updated = [...templateTasks];
    updated[taskIndex].sub_tasks.push({ text: "", details: [] });
    setTemplateTasks(updated);
  };

  const updateSubTask = (taskIndex, subTaskIndex, text) => {
    const updated = [...templateTasks];
    if (typeof updated[taskIndex].sub_tasks[subTaskIndex] === 'string') {
      updated[taskIndex].sub_tasks[subTaskIndex] = { text, details: [] };
    } else {
      updated[taskIndex].sub_tasks[subTaskIndex].text = text;
    }
    setTemplateTasks(updated);
  };

  const removeSubTask = (taskIndex, subTaskIndex) => {
    const updated = [...templateTasks];
    updated[taskIndex].sub_tasks.splice(subTaskIndex, 1);
    setTemplateTasks(updated);
  };

  const addSubTaskDetail = (taskIndex, subTaskIndex) => {
    const updated = [...templateTasks];
    const subTask = updated[taskIndex].sub_tasks[subTaskIndex];
    if (typeof subTask === 'string') {
      updated[taskIndex].sub_tasks[subTaskIndex] = { text: subTask, details: [""] };
    } else {
      subTask.details = subTask.details || [];
      subTask.details.push("");
    }
    setTemplateTasks(updated);
  };

  const updateSubTaskDetail = (taskIndex, subTaskIndex, detailIndex, text) => {
    const updated = [...templateTasks];
    updated[taskIndex].sub_tasks[subTaskIndex].details[detailIndex] = text;
    setTemplateTasks(updated);
  };

  const removeSubTaskDetail = (taskIndex, subTaskIndex, detailIndex) => {
    const updated = [...templateTasks];
    updated[taskIndex].sub_tasks[subTaskIndex].details.splice(detailIndex, 1);
    setTemplateTasks(updated);
  };

  const cancelEdit = () => {
    setEditingTemplate(null);
    setTemplateName("");
    setTemplateTasks([{ text: "", sub_tasks: [] }]);
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose} onPointerDownOutside={(e) => e.preventDefault()} onInteractOutside={(e) => e.preventDefault()}>
        <DialogContent className="clay-card border-none max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Task Templates</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-6">
            {/* Left: Template List */}
            <div>
              <h3 className="font-semibold mb-3">Saved Templates</h3>
              {templates.length === 0 ? (
                <p className="text-sm text-gray-500">No templates yet</p>
              ) : (
                <div className="space-y-2">
                  {templates.map(template => (
                    <div key={template.id} className="clay-card p-3 flex items-center justify-between">
                      <div className="flex-1">
                        <p className="font-medium text-sm">{template.name}</p>
                        <p className="text-xs text-gray-500">{template.tasks.length} tasks</p>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleUseTemplate(template)}
                          className="h-7 w-7">
                          <Check className="w-3 h-3 text-green-600" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEditTemplate(template)}
                          className="h-7 w-7">
                          <Edit className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteConfirm(template)}
                          className="h-7 w-7">
                          <Trash2 className="w-3 h-3 text-red-600" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Right: Create/Edit Template */}
            <div>
              <h3 className="font-semibold mb-3">
                {editingTemplate ? "Edit Template" : "Create Template"}
              </h3>
              <div className="space-y-4">
                <div>
                  <Label>Template Name</Label>
                  <Input
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder="e.g., Sign Installation Checklist"
                    className="mt-1"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label>Tasks</Label>
                    <Button size="sm" variant="ghost" onClick={addTask} className="h-6 px-2">
                      <Plus className="w-3 h-3 mr-1" />
                      Add Task
                    </Button>
                  </div>
                  <div className="space-y-3 max-h-64 overflow-y-auto">
                    {templateTasks.map((task, idx) => (
                      <div key={idx} className="bg-gray-50 p-2 rounded">
                        <div className="flex gap-2 mb-2">
                          <Input
                            value={task.text}
                            onChange={(e) => updateTask(idx, e.target.value)}
                            placeholder="Task name..."
                            className="flex-1 h-8 text-sm"
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeTask(idx)}
                            className="h-8 w-8">
                            <Trash2 className="w-3 h-3 text-red-600" />
                          </Button>
                        </div>
                        {/* Sub-tasks */}
                        {task.sub_tasks.length > 0 && (
                          <div className="ml-4 space-y-2 mb-2">
                            {task.sub_tasks.map((subTask, subIdx) => {
                              const subTaskText = typeof subTask === 'string' ? subTask : subTask.text;
                              const subTaskDetails = typeof subTask === 'string' ? [] : (subTask.details || []);
                              return (
                                <div key={subIdx} className="bg-white/50 rounded p-1.5">
                                  <div className="flex gap-2">
                                    <Input
                                      value={subTaskText}
                                      onChange={(e) => updateSubTask(idx, subIdx, e.target.value)}
                                      placeholder="Sub-task..."
                                      className="flex-1 h-6 text-xs"
                                    />
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => removeSubTask(idx, subIdx)}
                                      className="h-6 w-6">
                                      <X className="w-2 h-2 text-red-500" />
                                    </Button>
                                  </div>
                                  {/* Subtask Details */}
                                  {subTaskDetails.length > 0 && (
                                    <div className="ml-4 mt-1 space-y-1">
                                      {subTaskDetails.map((detail, detailIdx) => (
                                        <div key={detailIdx} className="flex gap-1">
                                          <Input
                                            value={detail}
                                            onChange={(e) => updateSubTaskDetail(idx, subIdx, detailIdx, e.target.value)}
                                            placeholder="Detail..."
                                            className="flex-1 h-5 text-xs"
                                          />
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => removeSubTaskDetail(idx, subIdx, detailIdx)}
                                            className="h-5 w-5">
                                            <X className="w-2 h-2 text-red-500" />
                                          </Button>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => addSubTaskDetail(idx, subIdx)}
                                    className="h-4 px-1 text-xs ml-4 mt-1"
                                    style={{ fontSize: '9px' }}>
                                    <Plus className="w-2 h-2 mr-0.5" />
                                    Detail
                                  </Button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => addSubTask(idx)}
                          className="h-5 px-2 text-xs ml-4">
                          <Plus className="w-2 h-2 mr-1" />
                          Add Sub-task
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button onClick={handleSaveTemplate} className="flex-1">
                    <Save className="w-4 h-4 mr-2" />
                    {editingTemplate ? "Update" : "Save"} Template
                  </Button>
                  {editingTemplate && (
                    <Button variant="outline" onClick={cancelEdit}>
                      Cancel
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent className="clay-card border-none">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteConfirm?.name}"? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteTemplate} className="bg-red-600">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}