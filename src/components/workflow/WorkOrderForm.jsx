
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { User } from "@/entities/User";
import { UploadFile } from "@/integrations/Core";
import { Upload, X } from "lucide-react";
import { format } from "date-fns";

const TEAM_MEMBERS = [
  "Carl",
  "Twyla", 
  "Brett",
  "Kyle",
  "Joe",
  "Aidin",
  "Kay",
  "Brian",
  "Chris"
];

export default function WorkOrderForm({ 
  isOpen, 
  onClose, 
  onSave, 
  workOrder = null,
  isRider = false,
  parentWorkOrder = null,
  lockedStage = null
}) {
  const [users, setUsers] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [customName, setCustomName] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);
  
  const todayDate = format(new Date(), "yyyy-MM-dd");
  
  const [formData, setFormData] = useState({
    title: "",
    client_name: "",
    description: "",
    image_url: "",
    current_stage: "permitting",
    assigned_to: "",
    notes: [],
    due_date: "",
    start_date: todayDate,
    is_rider: isRider,
    parent_work_order_id: parentWorkOrder?.id || null,
    rider_stage: null
  });

  useEffect(() => {
    loadUsers();
    if (workOrder) {
      let notes = workOrder.notes || [];
      if (typeof notes === 'string' && notes.trim()) {
        notes = [{
          text: notes,
          timestamp: workOrder.created_date || new Date().toISOString(),
          created_by: workOrder.created_by || "Unknown"
        }];
      }
      
      setFormData({
        ...workOrder,
        notes: notes,
        is_rider: workOrder.is_rider || isRider,
        parent_work_order_id: workOrder.parent_work_order_id || parentWorkOrder?.id || null,
        rider_stage: workOrder.rider_stage || null
      });
      
      // Check if assigned_to is a custom name
      if (workOrder.assigned_to && !TEAM_MEMBERS.includes(workOrder.assigned_to)) {
        setShowCustomInput(true);
        setCustomName(workOrder.assigned_to);
      }
    } else if (isRider && parentWorkOrder) {
      // For riders, only copy title, client_name, description, and image_url
      setFormData({
        title: parentWorkOrder.title,
        client_name: parentWorkOrder.client_name,
        description: parentWorkOrder.description,
        image_url: parentWorkOrder.image_url,
        current_stage: lockedStage || "permitting",
        assigned_to: "",
        notes: [],
        due_date: "",
        start_date: todayDate,
        is_rider: true,
        parent_work_order_id: parentWorkOrder.id,
        rider_stage: lockedStage || "permitting"
      });
    }
  }, [workOrder, isRider, parentWorkOrder, lockedStage, todayDate]);

  const loadUsers = async () => {
    const usersList = await User.list();
    setUsers(usersList);
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    try {
      const result = await UploadFile({ file });
      setFormData({ ...formData, image_url: result.file_url });
    } catch (error) {
      console.error("Error uploading image:", error);
    }
    setUploading(false);
  };

  const handleAssignToChange = (value) => {
    if (value === "custom") {
      setShowCustomInput(true);
      setFormData({ ...formData, assigned_to: "" });
    } else {
      setShowCustomInput(false);
      setCustomName("");
      setFormData({ ...formData, assigned_to: value });
    }
  };

  const handleCustomNameChange = (e) => {
    const value = e.target.value;
    setCustomName(value);
    setFormData({ ...formData, assigned_to: value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    // For riders, set rider_stage to current_stage
    const submitData = isRider && !workOrder 
      ? { ...formData, rider_stage: formData.current_stage }
      : formData;
    onSave(submitData);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent role="dialog" className="clay-card border-none max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-gray-800">
            {workOrder ? "Edit" : "Create"} {isRider ? "Rider Task" : "Work Order"}
          </DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          {/* Image Upload */}
          <div>
            <Label className="text-gray-700 font-medium">Image</Label>
            <div className="mt-1 flex gap-3">
              {formData.image_url && (
                <div className="relative">
                  <img 
                    src={formData.image_url} 
                    alt="Preview" 
                    className="w-24 h-24 object-cover rounded-xl"
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="destructive"
                    className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
                    onClick={() => setFormData({ ...formData, image_url: "" })}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              )}
              <label className="flex-1">
                <div className="clay-button border-2 border-dashed border-gray-300 rounded-xl p-4 text-center cursor-pointer hover:border-gray-400 transition-colors">
                  <Upload className="w-8 h-8 mx-auto text-gray-400 mb-2" />
                  <p className="text-sm text-gray-600">
                    {uploading ? "Uploading..." : "Click to upload image"}
                  </p>
                </div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                  disabled={uploading}
                />
              </label>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-gray-700 font-medium">Title *</Label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({...formData, title: e.target.value})}
                required
                className="clay-button border-none mt-1"
              />
            </div>
            
            <div>
              <Label className="text-gray-700 font-medium">Client Name *</Label>
              <Input
                value={formData.client_name}
                onChange={(e) => setFormData({...formData, client_name: e.target.value})}
                required
                className="clay-button border-none mt-1"
              />
            </div>
          </div>

          <div>
            <Label className="text-gray-700 font-medium">Description *</Label>
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
              required
              className="clay-button border-none mt-1 min-h-20"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-gray-700 font-medium">
                {isRider && !workOrder ? "Select Stage for Rider" : "Current Stage"}
              </Label>
              <Select
                value={formData.current_stage}
                onValueChange={(value) => setFormData({...formData, current_stage: value})}
                disabled={isRider && workOrder}
              >
                <SelectTrigger className="clay-button border-none mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="clay-card border-none">
                  <SelectItem value="estimating">Estimating</SelectItem>
                  <SelectItem value="sales">Sales</SelectItem>
                  <SelectItem value="permitting">Permitting</SelectItem>
                  <SelectItem value="design">Design</SelectItem>
                  <SelectItem value="production">Production</SelectItem>
                  <SelectItem value="fabrication">Fabrication</SelectItem>
                  <SelectItem value="installation">Installation/Delivery</SelectItem>
                </SelectContent>
              </Select>
              {isRider && !workOrder && (
                <p className="text-xs text-gray-500 mt-1">Rider will stay in this stage</p>
              )}
            </div>

            <div>
              <Label className="text-gray-700 font-medium">Assign To *</Label>
              {showCustomInput ? (
                <div className="flex gap-2 mt-1">
                  <Input
                    value={customName}
                    onChange={handleCustomNameChange}
                    placeholder="Enter name"
                    required
                    className="clay-button border-none flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowCustomInput(false);
                      setCustomName("");
                      setFormData({ ...formData, assigned_to: "" });
                    }}
                    className="clay-button border-none"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <Select
                  value={formData.assigned_to}
                  onValueChange={handleAssignToChange}
                  required
                >
                  <SelectTrigger className="clay-button border-none mt-1">
                    <SelectValue placeholder="Select person" />
                  </SelectTrigger>
                  <SelectContent className="clay-card border-none">
                    {TEAM_MEMBERS.map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                    <SelectItem value="custom">+ Add Custom Name</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-gray-700 font-medium">Start Date</Label>
              <Input
                type="date"
                value={formData.start_date}
                onChange={(e) => setFormData({...formData, start_date: e.target.value})}
                className="clay-button border-none mt-1"
              />
            </div>
            
            <div>
              <Label className="text-gray-700 font-medium">Due Date *</Label>
              <Input
                type="date"
                value={formData.due_date}
                onChange={(e) => setFormData({...formData, due_date: e.target.value})}
                required
                className="clay-button border-none mt-1"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="clay-button border-none"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="clay-button border-none text-gray-800"
              style={{
                background: 'linear-gradient(135deg, #E0D4F7 0%, #D4E9F7 100%)'
              }}
            >
              {workOrder ? "Update" : "Create"} {isRider ? "Rider" : "Work Order"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
