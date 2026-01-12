import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Check, X, Plus, Trash2, Pencil, Save, 
  ClipboardList, FileText, Copy, Star 
} from "lucide-react";

const SipChecklistTemplate = base44.entities.SipChecklistTemplate;

// Default checklist items if no template exists
const DEFAULT_CHECKLIST = [
  { id: 1, text: "Design Approved" },
  { id: 2, text: "Materials Ordered" },
  { id: 3, text: "Permit Submitted" },
  { id: 4, text: "Permit Approved" },
  { id: 5, text: "Production Started" },
  { id: 6, text: "Production Complete" },
  { id: 7, text: "QC Passed" },
  { id: 8, text: "Ready for Install" },
  { id: 9, text: "Install Scheduled" },
  { id: 10, text: "Install Complete" }
];

export default function SipChecklistDialog({ 
  isOpen, 
  onClose, 
  workOrder, 
  checklist, 
  setChecklist, 
  onSave,
  isRegistered,
  title = "SIP Checklist",
  checklistField = "sip_checklist",
  accentColor = "blue"
}) {
  const [activeTab, setActiveTab] = useState("checklist");
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [newItemText, setNewItemText] = useState("");
  const [editingItemId, setEditingItemId] = useState(null);
  const [editingItemText, setEditingItemText] = useState("");
  const [newTemplateName, setNewTemplateName] = useState("");
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [editingTemplateName, setEditingTemplateName] = useState("");

  useEffect(() => {
    if (isOpen) {
      loadTemplates();
    }
  }, [isOpen]);

  const loadTemplates = async () => {
    try {
      const allTemplates = await SipChecklistTemplate.list();
      setTemplates(allTemplates);
    } catch (error) {
      console.error("Error loading templates:", error);
    }
  };

  const toggleChecklistItem = (itemId) => {
    setChecklist(prev => 
      prev.map(item => item.id === itemId ? { ...item, checked: !item.checked } : item)
    );
  };

  const addChecklistItem = () => {
    if (!newItemText.trim()) return;
    const newItem = {
      id: Date.now(),
      text: newItemText.trim(),
      checked: false
    };
    setChecklist(prev => [...prev, newItem]);
    setNewItemText("");
  };

  const deleteChecklistItem = (itemId) => {
    setChecklist(prev => prev.filter(item => item.id !== itemId));
  };

  const startEditItem = (item) => {
    setEditingItemId(item.id);
    setEditingItemText(item.text);
  };

  const saveEditItem = () => {
    if (!editingItemText.trim()) return;
    setChecklist(prev => 
      prev.map(item => item.id === editingItemId ? { ...item, text: editingItemText.trim() } : item)
    );
    setEditingItemId(null);
    setEditingItemText("");
  };

  const moveItem = (index, direction) => {
    const newChecklist = [...checklist];
    if (direction === 'up' && index > 0) {
      [newChecklist[index], newChecklist[index - 1]] = [newChecklist[index - 1], newChecklist[index]];
    } else if (direction === 'down' && index < newChecklist.length - 1) {
      [newChecklist[index], newChecklist[index + 1]] = [newChecklist[index + 1], newChecklist[index]];
    }
    setChecklist(newChecklist);
  };

  const applyTemplate = (template) => {
    const newChecklist = template.items.map(item => ({
      ...item,
      checked: false
    }));
    setChecklist(newChecklist);
    setSelectedTemplate(template.id);
  };

  const saveAsTemplate = async () => {
    if (!newTemplateName.trim()) return;
    try {
      const templateItems = checklist.map(item => ({
        id: item.id,
        text: item.text
      }));
      await SipChecklistTemplate.create({
        name: newTemplateName.trim(),
        items: templateItems,
        is_default: false
      });
      setNewTemplateName("");
      await loadTemplates();
    } catch (error) {
      console.error("Error saving template:", error);
    }
  };

  const deleteTemplate = async (templateId) => {
    try {
      await SipChecklistTemplate.delete(templateId);
      await loadTemplates();
    } catch (error) {
      console.error("Error deleting template:", error);
    }
  };

  const setDefaultTemplate = async (template) => {
    try {
      // Remove default from all templates
      for (const t of templates) {
        if (t.is_default) {
          await SipChecklistTemplate.update(t.id, { is_default: false });
        }
      }
      // Set new default
      await SipChecklistTemplate.update(template.id, { is_default: true });
      await loadTemplates();
    } catch (error) {
      console.error("Error setting default template:", error);
    }
  };

  const startEditTemplate = (template) => {
    setEditingTemplate(template);
    setEditingTemplateName(template.name);
  };

  const saveTemplateEdit = async () => {
    if (!editingTemplate || !editingTemplateName.trim()) return;
    try {
      await SipChecklistTemplate.update(editingTemplate.id, { name: editingTemplateName.trim() });
      setEditingTemplate(null);
      setEditingTemplateName("");
      await loadTemplates();
    } catch (error) {
      console.error("Error updating template:", error);
    }
  };

  const updateTemplateItems = async (template) => {
    try {
      const templateItems = checklist.map(item => ({
        id: item.id,
        text: item.text
      }));
      await SipChecklistTemplate.update(template.id, { items: templateItems });
      await loadTemplates();
    } catch (error) {
      console.error("Error updating template items:", error);
    }
  };

  const completedCount = checklist.filter(i => i.checked).length;
  const progressPercent = checklist.length > 0 ? (completedCount / checklist.length) * 100 : 0;

  const colorClasses = {
    blue: {
      accent: "text-blue-600",
      bg: "bg-blue-600 hover:bg-blue-700",
      gradient: "from-blue-500 to-green-500",
      hover: "hover:border-blue-300 hover:bg-blue-50"
    },
    orange: {
      accent: "text-orange-600",
      bg: "bg-orange-600 hover:bg-orange-700",
      gradient: "from-orange-500 to-yellow-500",
      hover: "hover:border-orange-300 hover:bg-orange-50"
    }
  };

  const colors = colorClasses[accentColor] || colorClasses.blue;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="clay-card border-none max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold flex items-center gap-3">
            <ClipboardList className={`w-7 h-7 ${colors.accent}`} />
            {title} - {workOrder?.client_name}
          </DialogTitle>
        </DialogHeader>
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="checklist">Checklist</TabsTrigger>
            <TabsTrigger value="templates">Templates</TabsTrigger>
          </TabsList>

          <TabsContent value="checklist" className="flex-1 overflow-hidden flex flex-col mt-4">
            {/* Progress Bar */}
            <div className="mb-4">
              <div className="flex justify-between text-sm text-gray-600 mb-2">
                <span>Progress</span>
                <span className="font-bold text-lg">
                  {completedCount} / {checklist.length} Complete
                </span>
              </div>
              <div className="w-full h-4 bg-gray-200 rounded-full overflow-hidden">
                <div 
                  className={`h-full bg-gradient-to-r ${colors.gradient} transition-all duration-300`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            {/* Add New Item */}
            {isRegistered && (
              <div className="flex gap-2 mb-4">
                <Input
                  value={newItemText}
                  onChange={(e) => setNewItemText(e.target.value)}
                  placeholder="Add new checklist item..."
                  className="flex-1"
                  onKeyDown={(e) => e.key === 'Enter' && addChecklistItem()}
                />
                <Button onClick={addChecklistItem} size="sm" className={colors.bg}>
                  <Plus className="w-4 h-4 mr-1" />
                  Add
                </Button>
              </div>
            )}

            {/* Checklist Items */}
            <div className="space-y-2 flex-1 overflow-y-auto pr-2">
              {checklist.map((item, index) => (
                <div 
                  key={item.id}
                  className={`flex items-center gap-3 p-3 rounded-xl transition-all border-2 ${
                    item.checked 
                      ? 'bg-green-50 border-green-300' 
                      : `bg-white border-gray-200 ${colors.hover}`
                  }`}
                >
                  {/* Reorder buttons */}
                  {isRegistered && (
                    <div className="flex flex-col gap-0.5">
                      <button 
                        onClick={() => moveItem(index, 'up')}
                        disabled={index === 0}
                        className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-30"
                      >
                        ▲
                      </button>
                      <button 
                        onClick={() => moveItem(index, 'down')}
                        disabled={index === checklist.length - 1}
                        className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-30"
                      >
                        ▼
                      </button>
                    </div>
                  )}

                  {/* Checkbox */}
                  <div 
                    onClick={() => isRegistered && toggleChecklistItem(item.id)}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 cursor-pointer ${
                      item.checked ? 'bg-green-500' : 'bg-gray-200'
                    }`}
                  >
                    {item.checked ? (
                      <Check className="w-5 h-5 text-white" />
                    ) : (
                      <span className="text-gray-500 font-bold">{index + 1}</span>
                    )}
                  </div>

                  {/* Text or Edit Input */}
                  {editingItemId === item.id ? (
                    <div className="flex-1 flex gap-2">
                      <Input
                        value={editingItemText}
                        onChange={(e) => setEditingItemText(e.target.value)}
                        className="flex-1"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveEditItem();
                          if (e.key === 'Escape') setEditingItemId(null);
                        }}
                      />
                      <Button size="sm" onClick={saveEditItem} className="bg-green-600 hover:bg-green-700">
                        <Check className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingItemId(null)}>
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <span 
                        className={`text-lg font-medium flex-1 cursor-pointer ${
                          item.checked ? 'text-green-700 line-through' : 'text-gray-800'
                        }`}
                        onClick={() => isRegistered && toggleChecklistItem(item.id)}
                      >
                        {item.text}
                      </span>

                      {/* Action buttons */}
                      {isRegistered && (
                        <div className="flex gap-1">
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            onClick={() => startEditItem(item)}
                            className="h-8 w-8 p-0"
                          >
                            <Pencil className="w-4 h-4 text-gray-500" />
                          </Button>
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            onClick={() => deleteChecklistItem(item.id)}
                            className="h-8 w-8 p-0"
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </div>
                      )}

                      {item.checked && (
                        <span className="text-green-600 text-sm font-medium">✓ Done</span>
                      )}
                    </>
                  )}
                </div>
              ))}

              {checklist.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  No checklist items. Add items above or apply a template.
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="templates" className="flex-1 overflow-hidden flex flex-col mt-4">
            {/* Save Current as Template */}
            {isRegistered && (
              <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                <h3 className="font-medium mb-2 flex items-center gap-2">
                  <Save className="w-4 h-4" />
                  Save Current Checklist as Template
                </h3>
                <div className="flex gap-2">
                  <Input
                    value={newTemplateName}
                    onChange={(e) => setNewTemplateName(e.target.value)}
                    placeholder="Template name..."
                    className="flex-1"
                    onKeyDown={(e) => e.key === 'Enter' && saveAsTemplate()}
                  />
                  <Button onClick={saveAsTemplate} size="sm" className={colors.bg}>
                    <Save className="w-4 h-4 mr-1" />
                    Save
                  </Button>
                </div>
              </div>
            )}

            {/* Template List */}
            <div className="flex-1 overflow-y-auto space-y-2">
              <h3 className="font-medium mb-2 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Available Templates
              </h3>

              {templates.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  No templates saved yet. Create your first template above.
                </div>
              )}

              {templates.map(template => (
                <div 
                  key={template.id}
                  className={`p-3 border-2 rounded-lg ${
                    selectedTemplate === template.id ? 'border-blue-400 bg-blue-50' : 'border-gray-200'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {template.is_default && (
                      <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                    )}
                    
                    {editingTemplate?.id === template.id ? (
                      <div className="flex-1 flex gap-2">
                        <Input
                          value={editingTemplateName}
                          onChange={(e) => setEditingTemplateName(e.target.value)}
                          className="flex-1 h-8"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveTemplateEdit();
                            if (e.key === 'Escape') setEditingTemplate(null);
                          }}
                        />
                        <Button size="sm" onClick={saveTemplateEdit} className="h-8">
                          <Check className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingTemplate(null)} className="h-8">
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <span className="font-medium flex-1">{template.name}</span>
                        <span className="text-xs text-gray-500">{template.items?.length || 0} items</span>
                      </>
                    )}

                    {!editingTemplate && isRegistered && (
                      <div className="flex gap-1">
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => applyTemplate(template)}
                          className="h-8"
                          title="Apply template"
                        >
                          <Copy className="w-4 h-4 mr-1" />
                          Apply
                        </Button>
                        <Button 
                          size="sm" 
                          variant="ghost"
                          onClick={() => setDefaultTemplate(template)}
                          className="h-8 w-8 p-0"
                          title="Set as default"
                        >
                          <Star className={`w-4 h-4 ${template.is_default ? 'text-yellow-500 fill-yellow-500' : 'text-gray-400'}`} />
                        </Button>
                        <Button 
                          size="sm" 
                          variant="ghost"
                          onClick={() => updateTemplateItems(template)}
                          className="h-8 w-8 p-0"
                          title="Update template with current checklist"
                        >
                          <Save className="w-4 h-4 text-blue-500" />
                        </Button>
                        <Button 
                          size="sm" 
                          variant="ghost"
                          onClick={() => startEditTemplate(template)}
                          className="h-8 w-8 p-0"
                          title="Edit name"
                        >
                          <Pencil className="w-4 h-4 text-gray-500" />
                        </Button>
                        <Button 
                          size="sm" 
                          variant="ghost"
                          onClick={() => deleteTemplate(template.id)}
                          className="h-8 w-8 p-0"
                          title="Delete template"
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Preview items */}
                  <div className="mt-2 text-xs text-gray-500">
                    {template.items?.slice(0, 3).map((item, i) => (
                      <span key={item.id}>
                        {i > 0 && " • "}
                        {item.text}
                      </span>
                    ))}
                    {template.items?.length > 3 && ` • +${template.items.length - 3} more`}
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-4 border-t mt-4">
          <Button 
            variant="outline" 
            onClick={onClose}
            className="flex-1 h-12 text-lg"
          >
            <X className="w-5 h-5 mr-2" />
            Cancel
          </Button>
          <Button 
            onClick={onSave}
            className={`flex-1 h-12 text-lg ${colors.bg}`}
            disabled={!isRegistered}
          >
            <Check className="w-5 h-5 mr-2" />
            Save Checklist
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}