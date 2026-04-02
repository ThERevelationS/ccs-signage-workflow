import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp, ChevronRight, Save, ClipboardList, Loader2 } from "lucide-react";

const WorkOrder = base44.entities.WorkOrder;
const AuthorizedEmail = base44.entities.AuthorizedEmail;
const GlobalSettings = base44.entities.GlobalSettings;

export default function SipChecklistSection({ workOrder, onUpdate }) {
  const [isOpen, setIsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [checklist, setChecklist] = useState([]);
  const [users, setUsers] = useState([]);
  const [dropdownConditions, setDropdownConditions] = useState([]);
  const [expandedItems, setExpandedItems] = useState({});
  const [hasChanges, setHasChanges] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen && workOrder) {
      loadData();
    }
  }, [isOpen, workOrder?.id]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [freshWO, usersData, settings] = await Promise.all([
        WorkOrder.filter({ id: workOrder.id }),
        AuthorizedEmail.list(),
        GlobalSettings.list()
      ]);

      setUsers(usersData);

      // Load checklist FRESH from database (not from prop which may be stale)
      const currentWO = freshWO[0] || workOrder;
      const rawChecklist = currentWO.sip_checklist || [];
      // Reconstruct hierarchy from IDs if type/parent_id fields are missing
      const reconstructedChecklist = rawChecklist.map(item => {
        if (item.type) return item;
        
        const id = item.id || '';
        let type = 'checklist';
        let parent_id = null;
        
        if (id.includes('_subtask_')) {
          type = 'subtask';
          const subtaskIdx = id.lastIndexOf('_subtask_');
          parent_id = id.substring(0, subtaskIdx);
        } else if (id.includes('_detail_')) {
          const detailIdx = id.indexOf('_detail_');
          const afterDetail = id.substring(detailIdx);
          if (afterDetail.includes('_task_')) {
            type = 'task';
            const taskIdx = id.lastIndexOf('_task_');
            parent_id = id.substring(0, taskIdx);
          } else {
            type = 'detail';
            parent_id = id.substring(0, detailIdx);
          }
        } else if (id.includes('_task_')) {
          type = 'task';
          const taskIdx = id.lastIndexOf('_task_');
          parent_id = id.substring(0, taskIdx);
        }
        
        return { ...item, type, parent_id };
      });
      
      setChecklist(reconstructedChecklist);

      // Load dropdown conditions
      const dropdownsSetting = settings.find(s => s.setting_key === 'dropdownConditions');
      setDropdownConditions(dropdownsSetting?.setting_value?.items || []);
    } catch (error) {
      console.error("Error loading data:", error);
    }
    setIsLoading(false);
  };

  const updateChecklistItem = (itemId, updates) => {
    setChecklist(prev => prev.map(item => 
      item.id === itemId ? { ...item, ...updates } : item
    ));
    setHasChanges(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await WorkOrder.update(workOrder.id, { sip_checklist: checklist });
      Object.assign(workOrder, { sip_checklist: checklist });
      setHasChanges(false);
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error("Error saving:", error);
    }
    setSaving(false);
  };

  const toggleExpanded = (itemId) => {
    setExpandedItems(prev => ({ ...prev, [itemId]: !prev[itemId] }));
  };

  const getDropdownName = (dropdownId) => {
    if (!dropdownId) return null;
    const dd = dropdownConditions.find(d => d.id === dropdownId);
    return dd?.name || null;
  };

  // Group checklist items by product_name
  const getGroupedChecklist = () => {
    const groups = {};
    const itemMap = new Map();
    checklist.forEach(item => itemMap.set(item.id, item));
    
    const extractProductNameFromId = (id) => {
      if (!id) return null;
      
      if (id.includes('_sub_')) {
        const beforeSub = id.split('_sub_')[0];
        const parts = beforeSub.split('_');
        const nameparts = [];
        for (const part of parts) {
          if (/^\d{13}/.test(part) || /^[a-z0-9]{9}$/.test(part) || part === 'manual') break;
          nameparts.push(part);
        }
        if (nameparts.length > 0) return nameparts.join(' ');
      }
      
      const parts = id.split('_');
      const nameparts = [];
      for (const part of parts) {
        if (/^\d{10,}/.test(part) || /^[a-z0-9]{9}$/.test(part) || ['task', 'detail', 'manual', 'sub'].includes(part)) break;
        nameparts.push(part);
      }
      if (nameparts.length > 0) return nameparts.join(' ');
      
      return null;
    };
    
    const extractSubTemplateFromId = (id) => {
      if (!id || !id.includes('_sub_')) return null;
      const afterSub = id.split('_sub_')[1];
      if (!afterSub) return null;
      const parts = afterSub.split('_');
      const nameparts = [];
      for (const part of parts) {
        if (/^\d{10,}/.test(part) || /^[a-z0-9]{9}$/.test(part) || ['task', 'detail'].includes(part)) break;
        nameparts.push(part);
      }
      return nameparts.length > 0 ? nameparts.join(' ') : null;
    };
    
    const resolveProductName = (item, visited = new Set()) => {
      if (!item || visited.has(item.id)) return null;
      visited.add(item.id);
      
      if (item.product_name && !['undefined', 'General Items', 'Manual Items', 'Ungrouped'].includes(item.product_name)) {
        return item.product_name;
      }
      
      const fromId = extractProductNameFromId(item.id);
      if (fromId) return fromId;
      
      if (item.parent_id) {
        const parent = itemMap.get(item.parent_id);
        if (parent) return resolveProductName(parent, visited);
      }
      
      return null;
    };
    
    const resolveSubTemplateName = (item, visited = new Set()) => {
      if (!item || visited.has(item.id)) return null;
      visited.add(item.id);
      
      if (item.sub_template_name) return item.sub_template_name;
      
      const fromId = extractSubTemplateFromId(item.id);
      if (fromId) return fromId;
      
      if (item.parent_id) {
        const parent = itemMap.get(item.parent_id);
        if (parent) return resolveSubTemplateName(parent, visited);
      }
      
      return null;
    };
    
    const itemOrder = new Map();
    const itemsWithProduct = checklist.map((item, index) => {
      itemOrder.set(item.id, index);
      let productName = resolveProductName(item);
      if (!productName) productName = 'General Items';
      const subTemplateName = resolveSubTemplateName(item);
      return { item, productName, subTemplateName };
    });
    
    itemsWithProduct.forEach(({ item, productName, subTemplateName }) => {
      if (!groups[productName]) {
        groups[productName] = {
          productType: item.product_type || '',
          mainItems: [],
          subTemplates: {}
        };
      }
      
      if (subTemplateName) {
        if (!groups[productName].subTemplates[subTemplateName]) {
          groups[productName].subTemplates[subTemplateName] = [];
        }
        groups[productName].subTemplates[subTemplateName].push(item);
      } else {
        groups[productName].mainItems.push(item);
      }
    });
    
    Object.values(groups).forEach(group => {
      group.mainItems.sort((a, b) => (itemOrder.get(a.id) || 0) - (itemOrder.get(b.id) || 0));
      Object.values(group.subTemplates).forEach(stItems => {
        stItems.sort((a, b) => (itemOrder.get(a.id) || 0) - (itemOrder.get(b.id) || 0));
      });
    });
    
    return groups;
  };

  const getChecklistProgress = () => {
    if (checklist.length === 0) return { completed: 0, total: 0 };
    
    const mainCompleted = checklist.filter(item => item.approved_by && item.custom_dropdown_value).length;
    
    let subCompleted = 0;
    let subTotal = 0;
    checklist.forEach(item => {
      if (item.sub_items && item.sub_items.length > 0) {
        subTotal += item.sub_items.length;
        subCompleted += item.sub_items.filter(si => si.checked).length;
      }
    });
    
    return { 
      completed: mainCompleted + subCompleted, 
      total: checklist.length + subTotal 
    };
  };

  const groupedChecklist = getGroupedChecklist();
  const progress = getChecklistProgress();

  return (
    <div className="clay-card p-3">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <div className="flex items-center justify-between cursor-pointer hover:bg-gray-50 -m-3 p-3 rounded-lg">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-purple-600" />
              SIP Checklist
              {checklist.length > 0 && (
                <Badge variant="outline" className="ml-2 text-xs">
                  {progress.completed}/{progress.total}
                </Badge>
              )}
            </h3>
            <div className="flex items-center gap-2">
              {hasChanges && (
                <Button
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSave();
                  }}
                  disabled={saving}
                  className="h-7 px-3 bg-green-600 hover:bg-green-700 text-white"
                >
                  <Save className="w-3 h-3 mr-1" />
                  {saving ? "Saving..." : "Save"}
                </Button>
              )}
              {isOpen ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            </div>
          </div>
        </CollapsibleTrigger>
        
        <CollapsibleContent className="mt-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          ) : checklist.length === 0 ? (
            <div className="text-center py-6 text-gray-500">
              <ClipboardList className="w-8 h-8 mx-auto mb-2 text-gray-300" />
              <p className="text-sm">No SIP checklist created yet</p>
              <p className="text-xs text-gray-400 mt-1">Use the SIPs page to create and manage checklists</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {Object.entries(groupedChecklist).map(([productName, group]) => (
                <div key={productName} className="border-2 border-purple-200 rounded-lg p-2 bg-purple-50/20">
                  <h4 className="font-bold text-purple-800 text-sm mb-2 flex items-center gap-2">
                    📦 {productName}
                    {group.productType && (
                      <span className="text-xs font-normal bg-purple-200 px-1.5 py-0.5 rounded">
                        {group.productType}
                      </span>
                    )}
                  </h4>

                  {/* Main Items */}
                  {group.mainItems.length > 0 && (
                    <div className="space-y-1.5">
                      {group.mainItems.map(rawItem => {
                        if (rawItem.parent_id && (rawItem.type === 'task' || rawItem.type === 'detail' || rawItem.type === 'subtask')) return null;
                        
                        const item = rawItem.type ? rawItem : { ...rawItem, type: 'checklist' };
                        const itemTasks = group.mainItems.filter(i => i.type === 'task' && i.parent_id === item.id);
                        const itemDetails = group.mainItems.filter(i => i.type === 'detail' && i.parent_id === item.id).map(detail => ({
                          ...detail,
                          tasks: group.mainItems.filter(i => i.type === 'task' && i.parent_id === detail.id)
                        }));
                        
                        const hasChildren = itemTasks.length > 0 || itemDetails.length > 0;
                        const isExpanded = expandedItems[item.id] !== false;
                        const isCompleted = dropdownConditions.find(dd => dd.name === item.custom_dropdown_value)?.is_completed;
                        
                        return (
                          <div key={item.id} className="bg-white rounded p-2 border">
                            <div className="flex items-center gap-2">
                              {hasChildren ? (
                                <button 
                                  onClick={() => toggleExpanded(item.id)}
                                  className="p-0.5 hover:bg-gray-100 rounded"
                                >
                                  {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                                </button>
                              ) : <div className="w-4" />}
                              
                              <span className={`text-xs flex-1 ${isCompleted ? 'line-through text-gray-400' : ''}`}>
                                {item.text}
                              </span>
                              
                              <Select
                                value={item.approved_by || ""}
                                onValueChange={(val) => updateChecklistItem(item.id, { approved_by: val })}
                              >
                                <SelectTrigger className="h-6 text-xs w-24 px-1">
                                  <SelectValue placeholder="Approved..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {users.map(u => (
                                    <SelectItem key={u.email} value={u.full_name || u.email}>
                                      {u.full_name || u.email}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>

                              <Select
                                value={item.custom_dropdown_value || ""}
                                onValueChange={(val) => updateChecklistItem(item.id, { custom_dropdown_value: val })}
                              >
                                <SelectTrigger className="h-6 text-xs w-24 px-1">
                                  <SelectValue placeholder="Status..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {dropdownConditions
                                    .filter(dd => !item.dropdown_ids?.length || item.dropdown_ids.includes(dd.id))
                                    .map(dd => (
                                      <SelectItem key={dd.id} value={dd.name}>{dd.name}</SelectItem>
                                    ))}
                                </SelectContent>
                              </Select>
                            </div>

                            {/* Expanded children */}
                            {isExpanded && hasChildren && (
                              <div className="ml-5 mt-1.5 space-y-1 border-l-2 border-gray-200 pl-2">
                                {/* Tasks */}
                                {itemTasks.map(task => (
                                  <div key={task.id} className="flex items-center gap-1.5 bg-orange-50 p-1 rounded text-xs">
                                    <Checkbox 
                                      checked={!!task.approved_by}
                                      onCheckedChange={(checked) => updateChecklistItem(task.id, { approved_by: checked ? "Done" : "" })}
                                      className="h-3 w-3"
                                    />
                                    <span className="px-1 py-0.5 rounded bg-orange-100 text-orange-600 text-[10px]">T</span>
                                    <span className="flex-1">{task.text}</span>
                                    <Select
                                      value={task.assigned_to || ""}
                                      onValueChange={(val) => updateChecklistItem(task.id, { assigned_to: val })}
                                    >
                                      <SelectTrigger className="h-5 text-xs w-20 px-1">
                                        <SelectValue placeholder="Assign" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {users.map(u => (
                                          <SelectItem key={u.email} value={u.full_name || u.email}>
                                            {u.full_name || u.email}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                ))}

                                {/* Details */}
                                {itemDetails.map(detail => {
                                  const detailCompleted = dropdownConditions.find(dd => dd.name === detail.custom_dropdown_value)?.is_completed;
                                  return (
                                    <div key={detail.id} className="bg-gray-50 p-1.5 rounded">
                                      <div className="flex items-center gap-1.5 text-xs">
                                        <span className="px-1 py-0.5 rounded bg-purple-100 text-purple-700 text-[10px]">D</span>
                                        <span className={`flex-1 ${detailCompleted ? 'line-through text-gray-400' : ''}`}>{detail.text}</span>
                                        <Select
                                          value={detail.approved_by || ""}
                                          onValueChange={(val) => updateChecklistItem(detail.id, { approved_by: val })}
                                        >
                                          <SelectTrigger className="h-5 text-xs w-20 px-1">
                                            <SelectValue placeholder="Appr" />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {users.map(u => (
                                              <SelectItem key={u.email} value={u.full_name || u.email}>
                                                {u.full_name || u.email}
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                        <Select
                                          value={detail.custom_dropdown_value || ""}
                                          onValueChange={(val) => updateChecklistItem(detail.id, { custom_dropdown_value: val })}
                                        >
                                          <SelectTrigger className="h-5 text-xs w-20 px-1">
                                            <SelectValue placeholder="Status" />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {dropdownConditions
                                              .filter(dd => !detail.dropdown_ids?.length || detail.dropdown_ids.includes(dd.id))
                                              .map(dd => (
                                                <SelectItem key={dd.id} value={dd.name}>{dd.name}</SelectItem>
                                              ))}
                                          </SelectContent>
                                        </Select>
                                      </div>
                                      
                                      {/* Tasks under detail */}
                                      {detail.tasks?.length > 0 && (
                                        <div className="ml-4 mt-1 space-y-0.5">
                                          {detail.tasks.map(task => (
                                            <div key={task.id} className="flex items-center gap-1 bg-orange-50 p-0.5 rounded text-xs">
                                              <Checkbox 
                                                checked={!!task.approved_by}
                                                onCheckedChange={(checked) => updateChecklistItem(task.id, { approved_by: checked ? "Done" : "" })}
                                                className="h-2.5 w-2.5"
                                              />
                                              <span className="px-0.5 rounded bg-orange-100 text-orange-600 text-[9px]">T</span>
                                              <span className="flex-1">{task.text}</span>
                                              <Select
                                                value={task.assigned_to || ""}
                                                onValueChange={(val) => updateChecklistItem(task.id, { assigned_to: val })}
                                              >
                                                <SelectTrigger className="h-4 text-[10px] w-16 px-0.5">
                                                  <SelectValue placeholder="Assign" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                  {users.map(u => (
                                                    <SelectItem key={u.email} value={u.full_name || u.email}>
                                                      {u.full_name || u.email}
                                                    </SelectItem>
                                                  ))}
                                                </SelectContent>
                                              </Select>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Sub-templates */}
                  {Object.entries(group.subTemplates).map(([stName, stItems]) => (
                    <div key={stName} className="ml-3 mt-2 border-l-2 border-blue-300 pl-2">
                      <h5 className="text-xs font-semibold text-blue-700 mb-1">🔗 {stName}</h5>
                      <div className="space-y-1">
                        {stItems.map(rawItem => {
                          if (rawItem.parent_id && (rawItem.type === 'task' || rawItem.type === 'detail' || rawItem.type === 'subtask')) return null;
                          
                          const stItem = rawItem.type ? rawItem : { ...rawItem, type: 'checklist' };
                          const stItemTasks = stItems.filter(i => i.type === 'task' && i.parent_id === stItem.id);
                          const isCompleted = dropdownConditions.find(dd => dd.name === stItem.custom_dropdown_value)?.is_completed;
                          
                          return (
                            <div key={stItem.id} className="bg-white rounded p-1.5 border text-xs">
                              <div className="flex items-center gap-1.5">
                                <span className={`flex-1 ${isCompleted ? 'line-through text-gray-400' : ''}`}>{stItem.text}</span>
                                <Select
                                  value={stItem.approved_by || ""}
                                  onValueChange={(val) => updateChecklistItem(stItem.id, { approved_by: val })}
                                >
                                  <SelectTrigger className="h-5 text-[10px] w-20 px-1">
                                    <SelectValue placeholder="Appr" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {users.map(u => (
                                      <SelectItem key={u.email} value={u.full_name || u.email}>
                                        {u.full_name || u.email}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <Select
                                  value={stItem.custom_dropdown_value || ""}
                                  onValueChange={(val) => updateChecklistItem(stItem.id, { custom_dropdown_value: val })}
                                >
                                  <SelectTrigger className="h-5 text-[10px] w-20 px-1">
                                    <SelectValue placeholder="Status" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {dropdownConditions
                                      .filter(dd => !stItem.dropdown_ids?.length || stItem.dropdown_ids.includes(dd.id))
                                      .map(dd => (
                                        <SelectItem key={dd.id} value={dd.name}>{dd.name}</SelectItem>
                                      ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              
                              {/* Tasks under sub-template item */}
                              {stItemTasks.length > 0 && (
                                <div className="ml-3 mt-1 space-y-0.5">
                                  {stItemTasks.map(task => (
                                    <div key={task.id} className="flex items-center gap-1 bg-orange-50 p-0.5 rounded">
                                      <Checkbox 
                                        checked={!!task.approved_by}
                                        onCheckedChange={(checked) => updateChecklistItem(task.id, { approved_by: checked ? "Done" : "" })}
                                        className="h-2.5 w-2.5"
                                      />
                                      <span className="px-0.5 rounded bg-orange-100 text-orange-600 text-[9px]">T</span>
                                      <span className="flex-1">{task.text}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* Save Button at Bottom */}
          {hasChanges && (
            <div className="border-t pt-3 mt-3 flex justify-end">
              <Button
                onClick={handleSave}
                disabled={saving}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                <Save className="w-4 h-4 mr-2" />
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}