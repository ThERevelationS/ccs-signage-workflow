import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar as CalendarIcon, Save } from "lucide-react";

export default function DeadlineGradientDialog({ open, onClose, settings, onSave }) {
  const parseHex = (hex) => {
    hex = (hex || "#ffffff").replace('#', '');
    return { r: parseInt(hex.substring(0,2),16), g: parseInt(hex.substring(2,4),16), b: parseInt(hex.substring(4,6),16) };
  };
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="clay-card border-none max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><CalendarIcon className="w-5 h-5 text-blue-600" />Due Date Gradient Settings</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Enable Gradient</label>
            <Checkbox checked={settings.enabled} onCheckedChange={(checked) => onSave({ ...settings, enabled: checked })} />
          </div>
          {[
            { label: "Base Color (Far from deadline)", key: "baseColor" },
            { label: "Due Today Color", key: "dueColor" },
            { label: "Overdue Color (Past deadline)", key: "overdueColor", default: "#ef4444" },
          ].map(({ label, key, default: def }) => (
            <div key={key}>
              <label className="text-sm font-medium block mb-2">{label}</label>
              <div className="flex items-center gap-2">
                <input type="color" value={settings[key] || def || "#ffffff"} onChange={(e) => onSave({ ...settings, [key]: e.target.value })} className="w-10 h-10 rounded cursor-pointer border-0 p-0" />
                <Input value={settings[key] || def || ""} onChange={(e) => onSave({ ...settings, [key]: e.target.value })} className="flex-1" />
              </div>
            </div>
          ))}
          <div>
            <label className="text-sm font-medium block mb-2">Gradient Start (days before deadline)</label>
            <div className="flex items-center gap-4">
              <input type="range" min="1" max="60" value={settings.gradientDays} onChange={(e) => onSave({ ...settings, gradientDays: parseInt(e.target.value) })} className="flex-1" />
              <span className="text-sm font-medium w-16 text-center">{settings.gradientDays} days</span>
            </div>
          </div>
          <div className="border-t pt-4">
            <label className="text-sm font-medium block mb-2">Preview</label>
            <div className="flex h-8 rounded overflow-hidden border">
              {[...Array(10)].map((_, i) => {
                const ratio = i / 9;
                const base = parseHex(settings.baseColor);
                const due = parseHex(settings.dueColor);
                const r = Math.round(due.r + (base.r - due.r) * ratio);
                const g = Math.round(due.g + (base.g - due.g) * ratio);
                const b = Math.round(due.b + (base.b - due.b) * ratio);
                return <div key={i} className="flex-1" style={{ backgroundColor: `rgb(${r},${g},${b})` }} />;
              })}
            </div>
            <div className="flex justify-between text-xs text-gray-500 mt-1"><span>Due date</span><span>{settings.gradientDays}+ days away</span></div>
          </div>
          <Button onClick={onClose} className="w-full"><Save className="w-4 h-4 mr-2" />Save & Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}