import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2, Pencil, Save } from "lucide-react";
import SalesPipelineDialogs from "@/components/sales/SalesPipelineDialogs";

export default function SalesPipelineDialogsAndEditList({
  editDialog, setEditDialog,
  editInput, setEditInput,
  addToList, editingItem, setEditingItem,
  updateListItem, moveListItem, removeFromList,
  updateTaskPage, updateTaskStyle,
  WORKFLOW_PAGES, TASK_COLORS,
  ...dialogProps
}) {
  return (
    <>
      <Dialog open={editDialog.open} onOpenChange={(open) => !open && setEditDialog({ open: false, field: "", items: [], storageKey: "" })}>
        <DialogContent className={`clay-card border-none ${editDialog.storageKey === "salesTaskDescriptions" ? "max-w-4xl" : "max-w-md"} [&>button]:hidden`}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5 text-blue-600" />
              Edit {editDialog.field === "lead_source" || editDialog.field === "lead_source2" ? "Lead Sources" :
                    editDialog.field === "project_type" ? "Project Types" :
                    editDialog.field === "task_description" ? "Task Descriptions" : "Items"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input value={editInput} onChange={(e) => setEditInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addToList()} placeholder="Add new item..." className="flex-1" />
              <Button onClick={addToList} size="sm" className="clay-button"><Plus className="w-4 h-4" /></Button>
            </div>
            {editDialog.storageKey === "salesTaskDescriptions" && (
              <>
                <p className="text-xs text-gray-500 mb-2">Assign a page to show on workflow boards. Set color, opacity, and mark out to style rows with this task description.</p>
                <div className="flex items-center p-2 bg-gray-200 rounded font-medium text-xs text-gray-700 sticky top-0 border border-gray-300">
                  <div className="w-[32px] flex-shrink-0 text-center border-r border-gray-400">↕</div>
                  <div className="flex-1 text-center border-r border-gray-400 min-w-[150px]">Task Description</div>
                  <div className="w-[128px] flex-shrink-0 text-center border-r border-gray-400">Page</div>
                  <div className="w-[80px] flex-shrink-0 text-center border-r border-gray-400">Color</div>
                  <div className="w-[72px] flex-shrink-0 text-center border-r border-gray-400">Opacity</div>
                  <div className="w-[40px] flex-shrink-0 text-center border-r border-gray-400" title="Mark out row">Mark</div>
                  <div className="w-[56px] flex-shrink-0 text-center border-r border-gray-400" title="WIP items appear on SIPs page">WIP/SIP</div>
                  <div className="w-[24px] flex-shrink-0 text-center"></div>
                </div>
              </>
            )}
            <div className="space-y-1 max-h-80 overflow-y-auto">
              {editDialog.items.map((item, idx) => {
                const isTaskDesc = editDialog.storageKey === "salesTaskDescriptions";
                const displayText = isTaskDesc ? (item.text || item) : item;
                const itemPage = isTaskDesc ? (item.page || "") : "";
                return (
                  <div key={idx} className={`flex items-center p-2 rounded border ${isTaskDesc ? 'border-gray-200' : 'bg-gray-50'}`}>
                    <div className="w-[32px] flex-shrink-0 flex flex-col items-center gap-0.5 border-r border-gray-200 pr-1">
                      <Button variant="ghost" size="icon" onClick={() => moveListItem(idx, 'up')} disabled={idx === 0} className="h-4 w-4 p-0"><span className="text-xs">▲</span></Button>
                      <Button variant="ghost" size="icon" onClick={() => moveListItem(idx, 'down')} disabled={idx === editDialog.items.length - 1} className="h-4 w-4 p-0"><span className="text-xs">▼</span></Button>
                    </div>
                    {editingItem.index === idx ? (
                      <div className="flex-1 min-w-[150px] border-r border-gray-200 px-1">
                        <Input value={editingItem.value} onChange={(e) => setEditingItem({ ...editingItem, value: e.target.value })}
                          onBlur={() => { updateListItem(item, editingItem.value); setEditingItem({ index: null, value: "" }); }}
                          onKeyDown={(e) => { if (e.key === 'Enter') { updateListItem(item, editingItem.value); setEditingItem({ index: null, value: "" }); } }}
                          className="h-7 text-sm w-full" autoFocus />
                      </div>
                    ) : (
                      <div className={`text-sm flex-1 min-w-[150px] cursor-pointer hover:text-blue-600 px-1 ${isTaskDesc ? 'border-r border-gray-200' : ''}`}
                        onClick={() => setEditingItem({ index: idx, value: displayText })}>
                        {displayText}
                      </div>
                    )}
                    {isTaskDesc && (
                      <>
                        <div className="w-[128px] flex-shrink-0 border-r border-gray-200 px-1">
                          <Select value={itemPage || "none"} onValueChange={(val) => updateTaskPage(item, val === "none" ? "" : val)}>
                            <SelectTrigger className="h-7 text-xs w-full"><SelectValue placeholder="Page" /></SelectTrigger>
                            <SelectContent>{WORKFLOW_PAGES.map(page => <SelectItem key={page.value} value={page.value}>{page.label}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <div className="w-[80px] flex-shrink-0 border-r border-gray-200 px-1">
                          <Popover>
                            <PopoverTrigger asChild>
                              <button className="h-7 w-20 text-xs border rounded px-2 flex items-center gap-1 hover:bg-gray-100">
                                {item.color ? (<><div className="w-3 h-3 rounded border" style={{ backgroundColor: item.color }} /><span className="truncate text-[10px]">{TASK_COLORS.find(c => c.value === item.color)?.label || "Custom"}</span></>) : (<span className="text-gray-500">Color</span>)}
                              </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-48 p-2" align="start">
                              <div className="space-y-2">
                                <div className="text-xs font-medium text-gray-600 mb-1">Preset Colors</div>
                                <div className="grid grid-cols-4 gap-1">
                                  {TASK_COLORS.map(c => (
                                    <button key={c.value} onClick={() => updateTaskStyle(item, "color", c.value === "none" ? "" : c.value)}
                                      className={`w-8 h-8 rounded border-2 flex items-center justify-center transition-all ${(item.color || "") === (c.value === "none" ? "" : c.value) ? "border-blue-500 ring-2 ring-blue-200" : "border-gray-200 hover:border-gray-400"}`}
                                      style={{ backgroundColor: c.value === "none" ? "#ffffff" : c.value }} title={c.label}>
                                      {c.value === "none" && <span className="text-xs text-gray-400">✕</span>}
                                    </button>
                                  ))}
                                </div>
                                <div className="border-t pt-2 mt-2">
                                  <div className="text-xs font-medium text-gray-600 mb-1">Custom Color</div>
                                  <div className="flex items-center gap-2">
                                    <input type="color" value={item.color || "#ffffff"} onChange={(e) => updateTaskStyle(item, "color", e.target.value)} className="w-8 h-8 rounded cursor-pointer border-0 p-0" />
                                    <Input value={item.color || ""} onChange={(e) => updateTaskStyle(item, "color", e.target.value)} placeholder="#hex" className="h-7 text-xs flex-1" />
                                  </div>
                                </div>
                              </div>
                            </PopoverContent>
                          </Popover>
                        </div>
                        <div className="w-[72px] flex-shrink-0 flex items-center gap-1 border-r border-gray-200 px-1">
                          <span className="text-[10px] text-gray-500">{item.opacity ?? 100}%</span>
                          <input type="range" min="20" max="100" step="10" value={item.opacity ?? 100} onChange={(e) => updateTaskStyle(item, "opacity", parseInt(e.target.value))} className="w-8 h-4" />
                        </div>
                        <div className="w-[40px] flex-shrink-0 flex items-center justify-center border-r border-gray-200">
                          <Checkbox checked={item.markOut ?? false} onCheckedChange={(checked) => updateTaskStyle(item, "markOut", checked)} className="h-4 w-4" />
                        </div>
                        <div className="w-[56px] flex-shrink-0 flex items-center justify-center border-r border-gray-200">
                          <Checkbox checked={item.wip ?? false} onCheckedChange={(checked) => updateTaskStyle(item, "wip", checked)} className="h-4 w-4" />
                        </div>
                      </>
                    )}
                    <div className="w-[24px] flex-shrink-0 flex items-center justify-center">
                      <Button variant="ghost" size="icon" onClick={() => removeFromList(item)} className="h-6 w-6 p-0"><Trash2 className="w-3 h-3 text-red-500" /></Button>
                    </div>
                  </div>
                );
              })}
            </div>
            <Button onClick={() => setEditDialog({ open: false, field: "", items: [], storageKey: "" })} className="w-full">
              <Save className="w-4 h-4 mr-2" />Save & Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <SalesPipelineDialogs {...dialogProps} />
    </>
  );
}