import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { Calendar as CalendarIcon, Plus, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";

const AuthorizedEmail = base44.entities.AuthorizedEmail;
const WorkOrder = base44.entities.WorkOrder;

const STAGES = [
  { value: "estimating", label: "Estimating" },
  { value: "sales", label: "Sales" },
  { value: "permitting", label: "Permitting" },
  { value: "design", label: "Design" },
  { value: "production", label: "Production" },
  { value: "fabrication", label: "Fabrication" },
  { value: "installation", label: "Installation" }
];

export default function CreateRiderDialog({ isOpen, onClose, parentWorkOrder, onCreated }) {
  const [title, setTitle] = useState("");
  const [stage, setStage] = useState(parentWorkOrder?.current_stage || "permitting");
  const [assignedTo, setAssignedTo] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [users, setUsers] = useState([]);
  const [isCreating, setIsCreating] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadUsers();
      // Reset form
      setTitle(`${parentWorkOrder?.title || ''} - Rider`);
      setStage(parentWorkOrder?.current_stage || "permitting");
      setAssignedTo("");
      setDueDate("");
      setNotes("");
    }
  }, [isOpen, parentWorkOrder]);

  const loadUsers = async () => {
    const usersData = await AuthorizedEmail.list();
    setUsers(usersData);
  };

  const handleCreate = async () => {
    if (!title.trim()) return;
    
    setIsCreating(true);
    try {
      const riderData = {
        title: title.trim(),
        client_name: parentWorkOrder?.client_name || "",
        description: notes || parentWorkOrder?.description || "",
        is_rider: true,
        parent_work_order_id: parentWorkOrder?.id,
        current_stage: stage,
        rider_stage: stage,
        assigned_to: assignedTo || "",
        due_date: dueDate || "",
        notes: notes ? [{
          text: notes,
          timestamp: new Date().toISOString(),
          created_by: "Rider Creation",
          completed: false,
          sub_tasks: []
        }] : []
      };

      const rider = await WorkOrder.create(riderData);
      
      if (onCreated) {
        onCreated(rider);
      }
      onClose();
    } catch (error) {
      console.error("Error creating rider:", error);
    }
    setIsCreating(false);
  };

  const parseLocalDate = (dateString) => {
    if (!dateString) return undefined;
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="clay-card border-none max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="w-5 h-5 text-purple-600" />
            Create Rider
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Title */}
          <div>
            <Label>Rider Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter rider title..."
              className="mt-1"
            />
          </div>

          {/* Parent Info */}
          <div className="bg-gray-50 p-3 rounded-lg text-sm">
            <div className="text-gray-500 text-xs mb-1">Parent Work Order</div>
            <div className="font-medium">{parentWorkOrder?.title}</div>
            <div className="text-gray-600">{parentWorkOrder?.client_name}</div>
          </div>

          {/* Stage */}
          <div>
            <Label>Assign to Page/Stage</Label>
            <Select value={stage} onValueChange={setStage}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STAGES.map(s => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Assigned To */}
          <div>
            <Label>Assign to Person</Label>
            <Select value={assignedTo} onValueChange={setAssignedTo}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select person (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={null}>Unassigned</SelectItem>
                {users.map(u => (
                  <SelectItem key={u.id} value={u.full_name || u.email}>
                    {u.full_name || u.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Due Date */}
          <div>
            <Label>Deadline</Label>
            <Popover open={showDatePicker} onOpenChange={setShowDatePicker}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full mt-1 justify-start text-left font-normal"
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dueDate ? format(parseLocalDate(dueDate), "PPP") : "Select date (optional)"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={parseLocalDate(dueDate)}
                  onSelect={(date) => {
                    setDueDate(date ? format(date, "yyyy-MM-dd") : "");
                    setShowDatePicker(false);
                  }}
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Notes */}
          <div>
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes for this rider (optional)..."
              className="mt-1 min-h-20"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button
              onClick={handleCreate}
              disabled={isCreating || !title.trim()}
              className="flex-1 bg-purple-600 hover:bg-purple-700"
            >
              {isCreating ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Plus className="w-4 h-4 mr-2" />
              )}
              Create Rider
            </Button>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}