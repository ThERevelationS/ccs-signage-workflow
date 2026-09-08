import React, { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, X, Check } from "lucide-react";
import { format } from "date-fns";
import { mutateWorkOrderArrayField } from "@/components/workflow/workOrderPersistence";

/**
 * Notes section for a permit line — mirrors the work order's work_notes UI.
 * Notes are saved into the work order's work_notes array so they appear
 * in the main client/project popup too. Each note is tagged with the office
 * type for context.
 */
export default function PermitLineNotesSection({
  workOrder,
  officeLabel,
  currentUser,
  disabled,
  onUpdated,
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [noteType, setNoteType] = useState("permitting");
  const [noteText, setNoteText] = useState("");
  const [addingSubFor, setAddingSubFor] = useState(null);
  const [newSubText, setNewSubText] = useState("");

  // Show all work_notes (same as main popup). Display entire list so user sees
  // full context; newly-added notes are tagged with [OfficeLabel] prefix.
  const workNotes = useMemo(() => {
    if (!workOrder?.work_notes) return [];
    return Array.isArray(workOrder.work_notes) ? workOrder.work_notes : [];
  }, [workOrder?.work_notes]);

  const persistMutation = async (mutate) => {
    const saved = await mutateWorkOrderArrayField({
      workOrderId: workOrder.id,
      field: "work_notes",
      label: "Permit Work Order notes",
      mutate,
    });
    Object.assign(workOrder, { work_notes: saved.work_notes || [], updated_date: saved.updated_date });
    if (onUpdated) onUpdated();
    return saved.work_notes || [];
  };

  const handleAdd = async () => {
    if (!noteText.trim()) return;
    const prefix = officeLabel ? `[${officeLabel}] ` : "";
    const newNote = {
      id: Date.now(),
      type: noteType,
      text: `${prefix}${noteText.trim()}`,
      timestamp: new Date().toISOString(),
      created_by: currentUser?.full_name || currentUser?.email || "Unknown",
      sub_tasks: [],
    };
    await persistMutation((currentNotes) => currentNotes.some((note) => note?.id === newNote.id)
      ? currentNotes
      : [...currentNotes, newNote]);
    setNoteText("");
    setNoteType("permitting");
    setAddOpen(false);
  };

  const handleDelete = async (noteId) => {
    await persistMutation((currentNotes) => currentNotes.filter((note) => note.id !== noteId));
  };

  const handleAddSub = async (noteId) => {
    if (!newSubText.trim()) return;
    const newSubTask = { id: Date.now(), text: newSubText.trim(), completed: false };
    await persistMutation((currentNotes) => currentNotes.map((note) => note.id === noteId
      ? {
          ...note,
          sub_tasks: (note.sub_tasks || []).some((subTask) => subTask?.id === newSubTask.id)
            ? (note.sub_tasks || [])
            : [...(note.sub_tasks || []), newSubTask],
        }
      : note));
    setNewSubText("");
    setAddingSubFor(null);
  };

  const handleToggleSub = async (noteId, subId) => {
    const originalSubTask = workNotes.find((note) => note.id === noteId)?.sub_tasks?.find((subTask) => subTask.id === subId);
    if (!originalSubTask) return;
    const targetCompleted = !originalSubTask.completed;
    await persistMutation((currentNotes) => currentNotes.map((note) => note.id === noteId
      ? {
          ...note,
          sub_tasks: (note.sub_tasks || []).map((subTask) => subTask.id === subId
            ? { ...subTask, completed: targetCompleted }
            : subTask),
        }
      : note));
  };

  const handleDeleteSub = async (noteId, subId) => {
    await persistMutation((currentNotes) => currentNotes.map((note) => note.id === noteId
      ? { ...note, sub_tasks: (note.sub_tasks || []).filter((subTask) => subTask.id !== subId) }
      : note));
  };

  const typeLabel = (t) => ({
    admin: 'Admin', fabrication: 'Fab', vinyl: 'Vinyl', permitting: 'Permit',
    design: 'Design', installation: 'Install', client: 'Client', other: 'Other'
  }[t] || t);

  return (
    <div className="bg-gray-50/60 border-t px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-semibold text-xs text-gray-700">
          Notes {officeLabel && <span className="text-gray-400 font-normal">· {officeLabel}</span>}
          <span className="text-gray-400 font-normal ml-1">(syncs to project notes)</span>
        </h4>
        <Popover open={addOpen} onOpenChange={setAddOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" disabled={disabled}>
              <Plus className="w-3 h-3 mr-1" /> Add Note
            </Button>
          </PopoverTrigger>
          <PopoverContent className="clay-card w-96">
            <div className="space-y-3">
              <div>
                <Label>Type</Label>
                <Select value={noteType} onValueChange={setNoteType}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Administrative Work</SelectItem>
                    <SelectItem value="fabrication">Sign Shop Fabrication</SelectItem>
                    <SelectItem value="vinyl">Vinyl Production</SelectItem>
                    <SelectItem value="permitting">Permitting Steps</SelectItem>
                    <SelectItem value="design">Design Work</SelectItem>
                    <SelectItem value="installation">Installation</SelectItem>
                    <SelectItem value="client">Client Communication</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Note</Label>
                <Textarea
                  placeholder="Enter note details..."
                  className="mt-1 min-h-24"
                  value={noteText}
                  onChange={e => setNoteText(e.target.value)}
                />
              </div>
              <Button size="sm" className="w-full" onClick={handleAdd} disabled={!noteText.trim()}>
                Add Note
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <div className="border rounded overflow-hidden bg-white" style={{ maxHeight: '180px', overflowY: 'auto' }}>
        <table className="w-full text-xs">
          <thead className="bg-gray-50 border-b sticky top-0">
            <tr>
              <th className="text-left px-2 py-1.5 font-medium text-gray-700" style={{ width: '80px' }}>Type</th>
              <th className="text-left px-2 py-1.5 font-medium text-gray-700" style={{ width: '70px' }}>Date</th>
              <th className="text-left px-2 py-1.5 font-medium text-gray-700" style={{ width: '80px' }}>By</th>
              <th className="text-left px-2 py-1.5 font-medium text-gray-700">Note</th>
              <th className="text-center px-2 py-1.5 font-medium text-gray-700" style={{ width: '40px' }}></th>
            </tr>
          </thead>
          <tbody>
            {workNotes.map((note, idx) => (
              <React.Fragment key={note.id}>
                <tr className={`border-b last:border-b-0 hover:bg-gray-50 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                  <td className="px-2 py-1.5">
                    <Badge variant="outline" className="text-xs px-1.5 py-0">{typeLabel(note.type)}</Badge>
                  </td>
                  <td className="px-2 py-1.5 text-gray-500">
                    {note.timestamp ? format(new Date(note.timestamp), "M/d/yy") : '—'}
                  </td>
                  <td className="px-2 py-1.5 text-gray-600 text-xs">
                    {note.created_by?.split(' ')[0] || '-'}
                  </td>
                  <td className="px-2 py-1.5 text-gray-700">
                    <div>{note.text}</div>
                    {note.sub_tasks && note.sub_tasks.length > 0 && (
                      <div className="mt-1 ml-2 space-y-0.5">
                        {note.sub_tasks.map(st => (
                          <div key={st.id} className="flex items-center gap-1.5 text-[11px]">
                            <Checkbox
                              checked={st.completed}
                              onCheckedChange={() => handleToggleSub(note.id, st.id)}
                              className="h-3 w-3"
                              disabled={disabled}
                            />
                            <span className={st.completed ? 'line-through text-gray-400' : 'text-gray-600'}>{st.text}</span>
                            <Button variant="ghost" size="icon" className="h-4 w-4 ml-auto" onClick={() => handleDeleteSub(note.id, st.id)} disabled={disabled}>
                              <X className="w-2.5 h-2.5 text-gray-400 hover:text-red-600" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                    {addingSubFor === note.id ? (
                      <div className="mt-1 ml-2 flex items-center gap-1">
                        <Input
                          value={newSubText}
                          onChange={e => setNewSubText(e.target.value)}
                          placeholder="Sub-task..."
                          className="h-6 text-[11px]"
                          autoFocus
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleAddSub(note.id);
                            if (e.key === 'Escape') { setAddingSubFor(null); setNewSubText(""); }
                          }}
                        />
                        <Button size="sm" className="h-6 px-1.5" onClick={() => handleAddSub(note.id)}>
                          <Check className="w-3 h-3" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-6 px-1.5" onClick={() => { setAddingSubFor(null); setNewSubText(""); }}>
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 px-1.5 mt-0.5 text-[10px] text-gray-500 hover:text-gray-700"
                        onClick={() => setAddingSubFor(note.id)}
                        disabled={disabled}
                      >
                        <Plus className="w-2.5 h-2.5 mr-0.5" /> Sub-task
                      </Button>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-center align-top">
                    <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => handleDelete(note.id)} disabled={disabled}>
                      <X className="w-3 h-3 text-gray-400 hover:text-red-600" />
                    </Button>
                  </td>
                </tr>
              </React.Fragment>
            ))}
            {workNotes.length === 0 && (
              <tr>
                <td colSpan={5} className="px-2 py-3 text-center text-gray-400">
                  No notes yet — notes added here sync with the project popup.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}