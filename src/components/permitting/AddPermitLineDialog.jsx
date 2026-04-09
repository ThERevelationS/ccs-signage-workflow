import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { base44 } from "@/api/base44Client";

export default function AddPermitLineDialog({ isOpen, onClose, onSave, workOrders, localities, officeTypes }) {
  const [workOrderId, setWorkOrderId] = useState("");
  const [rowName, setRowName] = useState("");
  const [localityId, setLocalityId] = useState("");
  const [officeType, setOfficeType] = useState("");
  const [search, setSearch] = useState("");

  const filteredWOs = workOrders.filter(wo =>
    !search || wo.client_name?.toLowerCase().includes(search.toLowerCase()) ||
    wo.description?.toLowerCase().includes(search.toLowerCase())
  );

  const selectedWO = workOrders.find(wo => wo.id === workOrderId);
  const selectedLocality = localities.find(l => l.id === localityId);

  const handleSave = () => {
    if (!workOrderId) return;
    
    // Build steps from locality template if selected
    const steps = selectedLocality?.workflow_steps?.map(s => ({
      ...s,
      value: "",
      checked: false
    })) || [];

    onSave({
      work_order_id: workOrderId,
      work_order_title: selectedWO?.client_name || "",
      work_order_description: selectedWO?.description || "",
      row_name: rowName,
      locality_id: localityId || "",
      locality_name: selectedLocality?.name || "",
      office_type: officeType,
      status: "active",
      steps,
      priority: 0
    });
    
    // Reset
    setWorkOrderId("");
    setRowName("");
    setLocalityId("");
    setOfficeType("");
    setSearch("");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="clay-card border-none max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Permit Line Item</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-sm">Work Order / Client</Label>
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search work orders..."
              className="mb-2 h-8 text-sm"
            />
            <div className="max-h-40 overflow-y-auto border rounded-lg">
              {filteredWOs.length === 0 ? (
                <div className="p-3 text-center text-sm text-gray-500">No matching work orders</div>
              ) : (
                filteredWOs.slice(0, 20).map(wo => (
                  <div
                    key={wo.id}
                    onClick={() => setWorkOrderId(wo.id)}
                    className={`p-2 border-b last:border-0 cursor-pointer hover:bg-purple-50 text-sm ${workOrderId === wo.id ? 'bg-purple-100 border-purple-300' : ''}`}
                  >
                    <div className="font-medium">{wo.client_name}</div>
                    <div className="text-xs text-gray-500 truncate">{wo.description || "No description"}</div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div>
            <Label className="text-sm">Row Name (optional)</Label>
            <Input value={rowName} onChange={e => setRowName(e.target.value)} placeholder="e.g. Sign A, Building Permit..." className="h-8 text-sm" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-sm">Locality</Label>
              <Select value={localityId} onValueChange={setLocalityId}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Select locality..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {localities.map(l => (
                    <SelectItem key={l.id} value={l.id}>{l.name}{l.state ? ` (${l.state})` : ''}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">Office Type</Label>
              <Select value={officeType} onValueChange={setOfficeType}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Select type..." />
                </SelectTrigger>
                <SelectContent>
                  {officeTypes.map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={!workOrderId} className="bg-purple-600 hover:bg-purple-700">
            Add Line Item
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}