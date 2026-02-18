import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Save, Plus, Pencil, AlertCircle, CheckCircle2, Trash2, List, ChevronDown, ChevronRight } from "lucide-react";
import MultiUserSelectInline from "@/components/shared/MultiUserSelectInline";
import { Dialog as OtherDialog, DialogContent as OtherDialogContent, DialogHeader as OtherDialogHeader, DialogTitle as OtherDialogTitle, DialogFooter as OtherDialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import MmmTemplateBuilder from "./MmmTemplateBuilder";

const WorkOrder = base44.entities.WorkOrder;
const AuthorizedEmail = base44.entities.AuthorizedEmail;
const GlobalSettings = base44.entities.GlobalSettings;

// MMM uses its own sip_checklist field (same field, different templates)
// but the data is stored on the work order's sip_checklist
// We use separate GlobalSettings keys: mmmProductTypeTemplates, mmmSubTemplateItems, mmmDropdownConditions, mmmProductTypes

export default function MmmChecklistDialog({
  isOpen,
  onClose,
  workOrder,
  onUpdate,
  isRegistered,
  isAdmin
}) {
  const [checklist, setChecklist] = useState([]);
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showTemplateBuilder, setShowTemplateBuilder] = useState(false);
  const [dropdownConditions, setDropdownConditions] = useState([]);
  const [incompleteWarning, setIncompleteWarning] = useState(null);
  const [noChecklistWarning, setNoChecklistWarning] = useState(null);
  const [showOtherPopup, setShowOtherPopup] = useState(null);
  const [customDropdownValue, setCustomDropdownValue] = useState("");
  const [expandedItems, setExpandedItems] = useState({});
  const [hoveredItem, setHoveredItem] = useState(null);
  const [hoveredProduct, setHoveredProduct] = useState(null);
  const [newItemInput, setNewItemInput] = useState({ show: false, parentId: null, type: null, productName: null });
  const [newItemText, setNewItemText] = useState("");
  const [showAddGeneralChecklist, setShowAddGeneralChecklist] = useState(false);
  const [newGeneralChecklistText, setNewGeneralChecklistText] = useState("");

  useEffect(() => {
    if (isOpen && workOrder) loadData();
  }, [isOpen, workOrder]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [freshWO, usersData, settings] = await Promise.all([
        WorkOrder.filter({ id: workOrder.id }),
        AuthorizedEmail.list(),
        GlobalSettings.list()
      ]);

      const currentWO = freshWO[0];
      if (!currentWO) return;

      setUsers(usersData);

      // MMM uses its own checklist field: mmm_sip_checklist
      const rawChecklist = currentWO.mmm_sip_checklist || [];
      const reconstructedChecklist = rawChecklist.map(item => {
        if (item.type) return item;
        const id = item.id || '';
        let type = 'checklist';
        let parent_id = null;
        if (id.includes('_subtask_')) {
          type = 'subtask';
          parent_id = id.substring(0, id.lastIndexOf('_subtask_'));
        } else if (id.includes('_detail_')) {
          const detailIdx = id.indexOf('_detail_');
          const afterDetail = id.substring(detailIdx);
          if (afterDetail.includes('_task_')) {
            type = 'task';
            parent_id = id.substring(0, id.lastIndexOf('_task_'));
          } else {
            type = 'detail';
            parent_id = id.substring(0, detailIdx);
          }
        } else if (id.includes('_task_')) {
          type = 'task';
          parent_id = id.substring(0, id.lastIndexOf('_task_'));
        }
        return { ...item, type, parent_id };
      });
      setChecklist(reconstructedChecklist);

      // MMM-specific dropdown conditions
      const dropdownsSetting = settings.find(s => s.setting_key === 'mmmDropdownConditions');
      setDropdownConditions(dropdownsSetting?.setting_value?.items || []);
    } catch (error) {
      console.error("Error loading MMM checklist data:", error);
    }
    setIsLoading(false);
  };

  const getDropdownName = (dropdownId) => {
    if (!dropdownId) return null;
    const dd = dropdownConditions.find(d => d.id === dropdownId);
    return dd?.name || null;
  };

  const handleApplyTemplate = (templateData) => {
    const newItems = [];
    const flattenItem = (item, productName, productType, subTemplateName = null) => {
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substr(2, 9);
      const baseId = subTemplateName
        ? `${productName}_sub_${subTemplateName}_${item.id}_${timestamp}_${randomSuffix}`
        : `${productName}_${item.id}_${timestamp}_${randomSuffix}`;
      const itemDropdownIds = item.dropdown_ids || (item.dropdown_id ? [item.dropdown_id] : []);
      newItems.push({ id: baseId, product_name: productName || 'Unnamed Product', product_type: productType || '', sub_template_name: subTemplateName, text: item.text, type: 'checklist', approved_by: "", dropdown_ids: itemDropdownIds, dropdown_id: itemDropdownIds[0] || "", custom_dropdown_value: "" });
      item.tasks?.forEach((task, tIdx) => {
        newItems.push({ id: `${baseId}_task_${task.id}_${tIdx}`, product_name: productName || 'Unnamed Product', product_type: productType || '', sub_template_name: subTemplateName, parent_id: baseId, text: task.text, type: 'task', approved_by: "", assigned_to: "", custom_dropdown_value: "" });
      });
      item.details?.forEach((detail, dIdx) => {
        const detailId = `${baseId}_detail_${detail.id}_${dIdx}`;
        const detailDropdownIds = detail.dropdown_ids || (detail.dropdown_id ? [detail.dropdown_id] : []);
        newItems.push({ id: detailId, product_name: productName || 'Unnamed Product', product_type: productType || '', sub_template_name: subTemplateName, parent_id: baseId, text: detail.text, type: 'detail', approved_by: "", dropdown_ids: detailDropdownIds, dropdown_id: detailDropdownIds[0] || "", custom_dropdown_value: "" });
        detail.tasks?.forEach((task, dtIdx) => {
          newItems.push({ id: `${detailId}_task_${task.id}_${dtIdx}`, product_name: productName || 'Unnamed Product', product_type: productType || '', sub_template_name: subTemplateName, parent_id: detailId, text: task.text, type: 'task', approved_by: "", assigned_to: "", custom_dropdown_value: "" });
        });
      });
    };
    templateData.forEach(section => {
      if (section.type === 'product_header') {
        section.items.forEach(item => flattenItem(item, section.productName, section.productType));
      } else if (section.type === 'sub_template') {
        section.items.forEach(item => flattenItem(item, section.parentProduct, null, section.subTemplateName));
      }
    });
    setChecklist(prev => [...prev, ...newItems]);
  };

  const updateChecklistItem = (itemId, updates) => {
    setChecklist(checklist.map(item => item.id === itemId ? { ...item, ...updates } : item));
  };

  const deleteChecklistItem = (itemId) => {
    setChecklist(checklist.filter(item => item.id !== itemId));
  };

  const areChildrenComplete = (itemId) => {
    const children = checklist.filter(c => c.parent_id === itemId);
    if (children.length === 0) return true;
    return children.every(child => {
      if (child.type === 'detail') return child.approved_by && child.custom_dropdown_value && areChildrenComplete(child.id);
      if (child.type === 'task' || child.type === 'subtask') return child.approved_by && areChildrenComplete(child.id);
      return true;
    });
  };

  const checkIfComplete = () => {
    if (!checklist || checklist.length === 0) return { complete: false, hasChecklist: false };
    const checklistItems = checklist.filter(item => item.type !== 'task' && item.type !== 'subtask');
    const allApproved = checklistItems.every(item => {
      if (!item.approved_by || !item.custom_dropdown_value) return false;
      const selectedCondition = dropdownConditions.find(dd => dd.name === item.custom_dropdown_value);
      if (selectedCondition && !selectedCondition.is_completed) return false;
      return true;
    });
    return { complete: allApproved, hasChecklist: true };
  };

  const handleCheckOff = async () => {
    const status = checkIfComplete();
    if (!status.hasChecklist) { setNoChecklistWarning(true); return; }
    if (!status.complete) { setIncompleteWarning(true); return; }
    await WorkOrder.update(workOrder.id, { sip_completed: true });
    if (onUpdate) onUpdate();
    onClose();
  };

  const proceedWithCheckOff = async () => {
    await WorkOrder.update(workOrder.id, { sip_completed: true });
    if (onUpdate) onUpdate();
    setNoChecklistWarning(false);
    onClose();
  };

  const saveChecklist = async () => {
    setIsSaving(true);
    try {
      const itemMap = new Map();
      checklist.forEach(item => itemMap.set(item.id, item));
      const findRootProductInfo = (itemId, visited = new Set()) => {
        if (!itemId || visited.has(itemId)) return null;
        visited.add(itemId);
        const item = itemMap.get(itemId);
        if (!item) return null;
        const hasValidProductName = item.product_name && !['undefined', 'General Items', 'Manual Items', 'Ungrouped'].includes(item.product_name);
        if (hasValidProductName) return { product_name: item.product_name, product_type: item.product_type || '', sub_template_name: item.sub_template_name || null };
        if (item.parent_id) return findRootProductInfo(item.parent_id, visited);
        return null;
      };
      const resolvedChecklist = checklist.map(item => {
        const rootInfo = findRootProductInfo(item.id);
        return {
          id: item.id, text: item.text, type: item.type || 'checklist', parent_id: item.parent_id || null,
          approved_by: item.approved_by || '', assigned_to: item.assigned_to || '',
          custom_dropdown_value: item.custom_dropdown_value || '', dropdown_id: item.dropdown_id || '',
          dropdown_ids: item.dropdown_ids || [],
          product_name: rootInfo?.product_name || item.product_name || 'General Items',
          product_type: item.product_type || rootInfo?.product_type || '',
          sub_template_name: item.sub_template_name || rootInfo?.sub_template_name || null,
          product_id: item.product_id || null, sub_items: item.sub_items || []
        };
      });
      await WorkOrder.update(workOrder.id, { mmm_sip_checklist: resolvedChecklist });
      if (onUpdate) onUpdate();
      onClose();
    } catch (error) {
      console.error("Error saving MMM checklist:", error);
    }
    setIsSaving(false);
  };

  const getGroupedChecklist = () => {
    const groups = {};
    const itemOrder = new Map();
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
      if (item.product_name && !['undefined', 'General Items', 'Manual Items', 'Ungrouped'].includes(item.product_name)) return item.product_name;
      const fromId = extractProductNameFromId(item.id);
      if (fromId) return fromId;
      if (item.parent_id) { const parent = itemMap.get(item.parent_id); if (parent) return resolveProductName(parent, visited); }
      return null;
    };

    const resolveSubTemplateName = (item, visited = new Set()) => {
      if (!item || visited.has(item.id)) return null;
      visited.add(item.id);
      if (item.sub_template_name) return item.sub_template_name;
      const fromId = extractSubTemplateFromId(item.id);
      if (fromId) return fromId;
      if (item.parent_id) { const parent = itemMap.get(item.parent_id); if (parent) return resolveSubTemplateName(parent, visited); }
      return null;
    };

    const itemsWithProduct = checklist.map((item, index) => {
      itemOrder.set(item.id, index);
      let productName = resolveProductName(item);
      if (!productName) productName = 'General Items';
      const subTemplateName = resolveSubTemplateName(item);
      return { item, productName, subTemplateName };
    });

    itemsWithProduct.forEach(({ item, productName, subTemplateName }) => {
      if (!groups[productName]) groups[productName] = { productType: item.product_type || '', mainItems: [], subTemplates: {} };
      if (subTemplateName) {
        if (!groups[productName].subTemplates[subTemplateName]) groups[productName].subTemplates[subTemplateName] = [];
        groups[productName].subTemplates[subTemplateName].push(item);
      } else {
        groups[productName].mainItems.push(item);
      }
    });

    Object.values(groups).forEach(group => {
      group.mainItems.sort((a, b) => (itemOrder.get(a.id) || 0) - (itemOrder.get(b.id) || 0));
      Object.values(group.subTemplates).forEach(stItems => stItems.sort((a, b) => (itemOrder.get(a.id) || 0) - (itemOrder.get(b.id) || 0)));
    });
    return groups;
  };

  const toggleExpanded = (itemId) => setExpandedItems(prev => ({ ...prev, [itemId]: !prev[itemId] }));

  const addNewItem = (type, parentId = null, productName = null) => {
    if (!newItemText.trim()) return;
    let actualProductName = productName;
    let subTemplateName = null;
    let productType = '';

    const getParentChainInfo = (itemId) => {
      const item = checklist.find(i => i.id === itemId);
      if (!item) return null;
      if (item.product_name && !['undefined', 'General Items', 'Manual Items'].includes(item.product_name)) return { product_name: item.product_name, product_type: item.product_type || '', sub_template_name: item.sub_template_name || null };
      if (item.parent_id) return getParentChainInfo(item.parent_id);
      return null;
    };

    if (parentId) {
      const parentInfo = getParentChainInfo(parentId);
      if (parentInfo) { actualProductName = parentInfo.product_name; productType = parentInfo.product_type; subTemplateName = parentInfo.sub_template_name; }
      else {
        const parentItem = checklist.find(item => item.id === parentId);
        if (parentItem) { actualProductName = parentItem.product_name || productName; subTemplateName = parentItem.sub_template_name || null; productType = parentItem.product_type || ''; }
      }
    }

    if (!actualProductName || actualProductName === 'Manual Items' || actualProductName === 'undefined') actualProductName = productName || 'General Items';
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substr(2, 9);
    const sanitizedProductName = (actualProductName || 'General Items').replace(/\s+/g, ' ');
    const newId = subTemplateName ? `${sanitizedProductName}_sub_${subTemplateName}_manual_${timestamp}_${randomSuffix}` : `${sanitizedProductName}_manual_${timestamp}_${randomSuffix}`;

    const newItem = { id: newId, text: newItemText.trim(), type, approved_by: "", custom_dropdown_value: "", product_name: actualProductName, product_type: productType, sub_template_name: subTemplateName, parent_id: parentId };

    if (parentId) {
      const parentIndex = checklist.findIndex(item => item.id === parentId);
      if (parentIndex !== -1) {
        let insertIndex = parentIndex + 1;
        for (let i = parentIndex + 1; i < checklist.length; i++) {
          if (checklist[i].parent_id === parentId) insertIndex = i + 1;
          else break;
        }
        setChecklist(prev => { const newList = [...prev]; newList.splice(insertIndex, 0, newItem); return newList; });
      } else {
        setChecklist(prev => [...prev, newItem]);
      }
    } else {
      setChecklist(prev => [...prev, newItem]);
    }

    setNewItemText("");
    setNewItemInput({ show: false, parentId: null, type: null, productName: null });
  };

  if (isLoading) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="clay-card border-none">
          <div className="flex items-center justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
        </DialogContent>
      </Dialog>
    );
  }

  const groupedChecklist = getGroupedChecklist();

  const separateCompletedItems = () => {
    const active = {};
    const completed = {};
    Object.entries(groupedChecklist).forEach(([productName, group]) => {
      active[productName] = { ...group, mainItems: [], subTemplates: {} };
      completed[productName] = { ...group, mainItems: [], subTemplates: {} };
      group.mainItems.forEach(item => {
        if (!item.parent_id && (item.type === 'checklist' || !item.type)) {
          const isCompleted = dropdownConditions.find(dd => dd.name === item.custom_dropdown_value)?.is_completed;
          const targetGroup = isCompleted ? completed : active;
          targetGroup[productName].mainItems.push(item);
        } else {
          const parent = group.mainItems.find(p => p.id === item.parent_id);
          if (parent) {
            const parentCompleted = dropdownConditions.find(dd => dd.name === parent.custom_dropdown_value)?.is_completed;
            const targetGroup = parentCompleted ? completed : active;
            targetGroup[productName].mainItems.push(item);
          } else {
            active[productName].mainItems.push(item);
          }
        }
      });
      Object.entries(group.subTemplates).forEach(([stName, stItems]) => {
        active[productName].subTemplates[stName] = [];
        completed[productName].subTemplates[stName] = [];
        stItems.forEach(item => {
          if (!item.parent_id && (item.type === 'checklist' || !item.type)) {
            const isCompleted = dropdownConditions.find(dd => dd.name === item.custom_dropdown_value)?.is_completed;
            const targetGroup = isCompleted ? completed : active;
            targetGroup[productName].subTemplates[stName].push(item);
          } else {
            const parent = stItems.find(p => p.id === item.parent_id);
            const parentCompleted = parent && dropdownConditions.find(dd => dd.name === parent.custom_dropdown_value)?.is_completed;
            const targetGroup = parentCompleted ? completed : active;
            targetGroup[productName].subTemplates[stName].push(item);
          }
        });
        if (active[productName].subTemplates[stName].length === 0) delete active[productName].subTemplates[stName];
        if (completed[productName].subTemplates[stName].length === 0) delete completed[productName].subTemplates[stName];
      });
      if (active[productName].mainItems.length === 0 && Object.keys(active[productName].subTemplates).length === 0) delete active[productName];
      if (completed[productName].mainItems.length === 0 && Object.keys(completed[productName].subTemplates).length === 0) delete completed[productName];
    });
    return { active, completed };
  };

  const { active: activeChecklist, completed: completedChecklist } = separateCompletedItems();

  const renderTaskRow = (task, productName) => (
    <div key={task.id} className="bg-orange-50 p-1 rounded border-l-2 border-orange-300 group">
      <div className="flex items-center gap-1.5">
        <Checkbox checked={!!task.approved_by} onCheckedChange={(checked) => updateChecklistItem(task.id, { approved_by: checked ? "Done" : "" })} disabled={!isRegistered} className="h-3 w-3" />
        <span className="text-xs px-1 py-0.5 rounded bg-orange-100 text-orange-600 font-medium">T</span>
        <span className="text-xs flex-1">{task.text}</span>
        <MultiUserSelectInline users={users} selectedUsers={task.assigned_to ? (Array.isArray(task.assigned_to) ? task.assigned_to : [task.assigned_to]) : []} onSelectionChange={(val) => updateChecklistItem(task.id, { assigned_to: val })} disabled={!isRegistered} />
        {isRegistered && <Button variant="ghost" size="sm" onClick={() => deleteChecklistItem(task.id)} className="h-4 w-4 p-0 text-red-500 opacity-0 group-hover:opacity-100"><Trash2 className="w-2.5 h-2.5" /></Button>}
      </div>
    </div>
  );

  const renderMainChecklistItem = (rawItem, group, productName) => {
    if (rawItem.parent_id && (rawItem.type === 'task' || rawItem.type === 'detail' || rawItem.type === 'subtask')) return null;
    const item = rawItem.type ? rawItem : { ...rawItem, type: 'checklist' };
    const itemTasks = group.mainItems.filter(i => i.type === 'task' && i.parent_id === item.id);
    const itemDetails = group.mainItems.filter(i => i.type === 'detail' && i.parent_id === item.id).map(detail => ({ ...detail, tasks: group.mainItems.filter(i => i.type === 'task' && i.parent_id === detail.id) }));
    const displayItem = { ...item, tasks: itemTasks, details: itemDetails };
    const isItemCompleted = dropdownConditions.find(dd => dd.name === displayItem.custom_dropdown_value)?.is_completed;

    return (
      <div key={displayItem.id} className={`clay-card p-3 ${isItemCompleted ? 'bg-green-100/70' : 'bg-white'}`}>
        <div className="flex items-center gap-2 group" onMouseEnter={() => setHoveredItem(displayItem.id)} onMouseLeave={() => setHoveredItem(null)}>
          <button onClick={() => toggleExpanded(displayItem.id)} className="p-1 hover:bg-gray-100 rounded">
            {(displayItem.details?.length > 0 || displayItem.tasks?.length > 0) ? ((expandedItems[displayItem.id] !== false) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />) : <div className="w-4" />}
          </button>
          <span className="text-xs px-2 py-0.5 rounded bg-orange-100 text-orange-700">Checklist</span>
          <span className={`font-medium text-sm flex-1 ${isItemCompleted ? 'line-through text-gray-400' : ''}`}>{displayItem.text}</span>

          {isRegistered && hoveredItem === displayItem.id && (
            <div className="flex gap-1">
              <button onClick={(e) => { e.stopPropagation(); setExpandedItems(prev => ({ ...prev, [displayItem.id]: true })); setNewItemInput({ show: true, parentId: displayItem.id, type: 'task', productName: displayItem.product_name || productName }); }} className="px-1.5 py-0.5 text-xs bg-orange-100 text-orange-700 rounded hover:bg-orange-200">+Task</button>
              <button onClick={(e) => { e.stopPropagation(); setExpandedItems(prev => ({ ...prev, [displayItem.id]: true })); setNewItemInput({ show: true, parentId: displayItem.id, type: 'detail', productName: displayItem.product_name || productName }); }} className="px-1.5 py-0.5 text-xs bg-purple-100 text-purple-700 rounded hover:bg-purple-200">+Detail</button>
            </div>
          )}

          <Select value={displayItem.approved_by || ""} onValueChange={(val) => updateChecklistItem(displayItem.id, { approved_by: val })} disabled={!isRegistered}>
            <SelectTrigger className="h-7 text-xs w-32"><SelectValue placeholder="Approved by..." /></SelectTrigger>
            <SelectContent>{users.map(u => <SelectItem key={u.email} value={u.full_name || u.email}>{u.full_name || u.email}</SelectItem>)}</SelectContent>
          </Select>

          <Select value={displayItem.custom_dropdown_value || "select_value"} onValueChange={(val) => {
            if (val === "other") { setShowOtherPopup({ itemId: displayItem.id }); }
            else if (val !== "select_value") {
              if (!displayItem.approved_by) { alert("Please select an approver first."); return; }
              const cond = dropdownConditions.find(dd => dd.name === val);
              if (cond?.is_completed && !areChildrenComplete(displayItem.id)) { alert("Please complete all tasks and details first."); return; }
              updateChecklistItem(displayItem.id, { custom_dropdown_value: val });
            }
          }} disabled={!isRegistered}>
            <SelectTrigger className="h-7 text-xs w-36"><SelectValue placeholder="Status...">{displayItem.custom_dropdown_value || "Status..."}</SelectValue></SelectTrigger>
            <SelectContent>
              {dropdownConditions.filter(dd => (displayItem.dropdown_ids || []).includes(dd.id)).map(dd => <SelectItem key={dd.id} value={dd.name}>{dd.name}{dd.is_completed ? ' (Completed)' : ''}</SelectItem>)}
              <SelectItem value="other" className="text-orange-600 font-medium">+ Other...</SelectItem>
            </SelectContent>
          </Select>

          {isRegistered && <Button variant="ghost" size="sm" onClick={() => deleteChecklistItem(displayItem.id)} className="h-7 w-7 p-0 text-red-500"><Trash2 className="w-3 h-3" /></Button>}
        </div>

        {(expandedItems[displayItem.id] !== false) && (
          <div className="ml-8 mt-2 space-y-2 border-l-2 border-gray-200 pl-3">
            {displayItem.tasks?.map(task => renderTaskRow(task, productName))}

            {newItemInput.show && newItemInput.parentId === displayItem.id && newItemInput.type === 'task' && (
              <div className="flex items-center gap-2 bg-orange-50 p-2 rounded border-l-4 border-orange-400">
                <Input value={newItemText} onChange={(e) => setNewItemText(e.target.value)} placeholder="New task..." className="h-6 text-xs flex-1" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') addNewItem('task', displayItem.id, displayItem.product_name || productName); if (e.key === 'Escape') setNewItemInput({ show: false, parentId: null, type: null, productName: null }); }} />
                <Button size="sm" className="h-6 px-2 text-xs" onClick={() => addNewItem('task', displayItem.id, displayItem.product_name || productName)}>Add</Button>
                <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setNewItemInput({ show: false, parentId: null, type: null, productName: null })}>Cancel</Button>
              </div>
            )}

            {newItemInput.show && newItemInput.parentId === displayItem.id && newItemInput.type === 'detail' && (
              <div className="bg-gray-50 p-2 rounded border">
                <div className="flex items-center gap-2">
                  <Input value={newItemText} onChange={(e) => setNewItemText(e.target.value)} placeholder="New detail..." className="h-6 text-xs flex-1" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') addNewItem('detail', displayItem.id, displayItem.product_name || productName); if (e.key === 'Escape') setNewItemInput({ show: false, parentId: null, type: null, productName: null }); }} />
                  <Button size="sm" className="h-6 px-2 text-xs" onClick={() => addNewItem('detail', displayItem.id, displayItem.product_name || productName)}>Add</Button>
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setNewItemInput({ show: false, parentId: null, type: null, productName: null })}>Cancel</Button>
                </div>
              </div>
            )}

            {displayItem.details?.map(detail => {
              const isDetailCompleted = dropdownConditions.find(dd => dd.name === detail.custom_dropdown_value)?.is_completed;
              return (
                <div key={detail.id} className={`p-2 rounded border group/detail ${isDetailCompleted ? 'bg-green-100/70' : 'bg-gray-50'}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">Detail</span>
                    <span className={`text-sm flex-1 ${isDetailCompleted ? 'line-through text-gray-400' : ''}`}>{detail.text}</span>
                    {isRegistered && <button onClick={(e) => { e.stopPropagation(); setNewItemInput({ show: true, parentId: detail.id, type: 'task', productName: displayItem.product_name || productName }); }} className="px-1.5 py-0.5 text-xs bg-orange-100 text-orange-700 rounded hover:bg-orange-200 opacity-0 group-hover/detail:opacity-100">+Task</button>}
                    <Select value={detail.approved_by || ""} onValueChange={(val) => updateChecklistItem(detail.id, { approved_by: val })} disabled={!isRegistered}>
                      <SelectTrigger className="h-6 text-xs w-28"><SelectValue placeholder="Approved..." /></SelectTrigger>
                      <SelectContent>{users.map(u => <SelectItem key={u.email} value={u.full_name || u.email}>{u.full_name || u.email}</SelectItem>)}</SelectContent>
                    </Select>
                    <Select value={detail.custom_dropdown_value || "select_value"} onValueChange={(val) => {
                      if (val === "other") { setShowOtherPopup({ itemId: detail.id }); }
                      else if (val !== "select_value") {
                        if (!detail.approved_by) { alert("Please select an approver first."); return; }
                        const cond = dropdownConditions.find(dd => dd.name === val);
                        if (cond?.is_completed && !areChildrenComplete(detail.id)) { alert("Please complete all tasks first."); return; }
                        updateChecklistItem(detail.id, { custom_dropdown_value: val });
                      }
                    }} disabled={!isRegistered}>
                      <SelectTrigger className="h-6 text-xs w-32"><SelectValue placeholder="Status...">{detail.custom_dropdown_value || "Status..."}</SelectValue></SelectTrigger>
                      <SelectContent>
                        {dropdownConditions.filter(dd => (detail.dropdown_ids || []).includes(dd.id)).map(dd => <SelectItem key={dd.id} value={dd.name}>{dd.name}{dd.is_completed ? ' (Completed)' : ''}</SelectItem>)}
                        <SelectItem value="other" className="text-orange-600 font-medium">+ Other...</SelectItem>
                      </SelectContent>
                    </Select>
                    {isRegistered && <Button variant="ghost" size="sm" onClick={() => deleteChecklistItem(detail.id)} className="h-6 w-6 p-0 text-red-500"><Trash2 className="w-3 h-3" /></Button>}
                  </div>
                  {newItemInput.show && newItemInput.parentId === detail.id && newItemInput.type === 'task' && (
                    <div className="ml-4 mt-2 flex items-center gap-2 bg-orange-50 p-1.5 rounded">
                      <Input value={newItemText} onChange={(e) => setNewItemText(e.target.value)} placeholder="New task..." className="h-5 text-xs flex-1" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') addNewItem('task', detail.id, displayItem.product_name || productName); if (e.key === 'Escape') setNewItemInput({ show: false, parentId: null, type: null, productName: null }); }} />
                      <Button size="sm" className="h-5 px-2 text-xs" onClick={() => addNewItem('task', detail.id, displayItem.product_name || productName)}>Add</Button>
                      <Button size="sm" variant="ghost" className="h-5 px-1 text-xs" onClick={() => setNewItemInput({ show: false, parentId: null, type: null, productName: null })}>×</Button>
                    </div>
                  )}
                  {detail.tasks?.length > 0 && (
                    <div className="ml-4 mt-1 space-y-0.5 border-l border-orange-200 pl-1.5">
                      {detail.tasks.map(task => (
                        <div key={task.id} className="bg-orange-50 p-0.5 rounded group/dtask">
                          <div className="flex items-center gap-1">
                            <Checkbox checked={!!task.approved_by} onCheckedChange={(checked) => updateChecklistItem(task.id, { approved_by: checked ? "Done" : "" })} disabled={!isRegistered} className="h-2.5 w-2.5" />
                            <span className="text-xs px-0.5 py-0.5 rounded bg-orange-100 text-orange-600">T</span>
                            <span className="text-xs flex-1">{task.text}</span>
                            <MultiUserSelectInline users={users} selectedUsers={task.assigned_to ? (Array.isArray(task.assigned_to) ? task.assigned_to : [task.assigned_to]) : []} onSelectionChange={(val) => updateChecklistItem(task.id, { assigned_to: val })} disabled={!isRegistered} className="h-4 min-w-[70px]" />
                            {isRegistered && <Button variant="ghost" size="sm" onClick={() => deleteChecklistItem(task.id)} className="h-3 w-3 p-0 text-red-500 opacity-0 group-hover/dtask:opacity-100"><Trash2 className="w-2 h-2" /></Button>}
                          </div>
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
  };

  return (
    <>
      <Dialog open={isOpen && !showTemplateBuilder} onOpenChange={() => {}}>
        <DialogContent className="clay-card border-none max-w-6xl max-h-[90vh] overflow-hidden flex flex-col [&>button]:hidden">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="text-xl font-bold">
                {workOrder?.client_name}
                {workOrder?.description && (
                  <span className="block text-sm font-normal text-gray-500 mt-0.5">{workOrder.description}</span>
                )}
              </DialogTitle>
              <div className="flex gap-2">
                {isAdmin && (
                  <Button variant="outline" size="sm" onClick={() => setShowTemplateBuilder(true)}>
                    <Pencil className="w-4 h-4 mr-1" />Checklist Builder
                  </Button>
                )}
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-3">
            {checklist.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>No checklist items yet</p>
                <p className="text-sm mt-1">Use Checklist Builder to create and apply checklists</p>
              </div>
            ) : (
              <>
                {Object.entries(activeChecklist)
                  .filter(([, group]) => group.mainItems.some(i => !i.parent_id && (i.type === 'checklist' || !i.type)) || Object.values(group.subTemplates).some(st => st.some(i => !i.parent_id && (i.type === 'checklist' || !i.type))))
                  .map(([productName, group]) => (
                    <div key={productName} className="border-2 border-orange-200 rounded-lg p-3 bg-orange-50/20" onMouseEnter={() => setHoveredProduct(productName)} onMouseLeave={() => setHoveredProduct(null)}>
                      <div className="flex items-center gap-2 mb-3">
                        {isRegistered && hoveredProduct === productName && (
                          <button onClick={(e) => { e.stopPropagation(); setNewItemInput({ show: true, parentId: null, type: 'checklist', productName }); }} className="px-1.5 py-0.5 text-xs bg-orange-100 text-orange-700 rounded hover:bg-orange-200">+Checklist</button>
                        )}
                        <h3 className="font-bold text-orange-800 flex items-center gap-2">
                          📋 {productName}
                          {group.productType && <span className="text-xs font-normal bg-orange-200 px-2 py-0.5 rounded">{group.productType}</span>}
                        </h3>
                      </div>

                      {newItemInput.show && newItemInput.parentId === null && newItemInput.type === 'checklist' && newItemInput.productName === productName && (
                        <div className="mb-3 p-2 bg-orange-50 rounded-lg border border-orange-200">
                          <div className="flex items-center gap-2">
                            <Input value={newItemText} onChange={(e) => setNewItemText(e.target.value)} placeholder="New checklist item..." className="h-7 text-sm flex-1" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') addNewItem('checklist', null, productName); if (e.key === 'Escape') { setNewItemInput({ show: false, parentId: null, type: null, productName: null }); setNewItemText(""); } }} />
                            <Button size="sm" className="h-7 px-3 text-xs" onClick={() => addNewItem('checklist', null, productName)}>Add</Button>
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => { setNewItemInput({ show: false, parentId: null, type: null, productName: null }); setNewItemText(""); }}>Cancel</Button>
                          </div>
                        </div>
                      )}

                      {group.mainItems.length > 0 && (
                        <div className="space-y-2 mb-3">
                          {group.mainItems.map(item => renderMainChecklistItem(item, group, productName))}
                        </div>
                      )}

                      {Object.entries(group.subTemplates).map(([stName, stItems]) => (
                        <div key={stName} className="ml-4 mt-2 border-l-2 border-orange-300 pl-3">
                          <h4 className="text-sm font-semibold text-orange-700 mb-2">🔗 {stName}</h4>
                          <div className="space-y-2">
                            {stItems.map(rawItem => {
                              if (rawItem.parent_id && (rawItem.type === 'task' || rawItem.type === 'detail' || rawItem.type === 'subtask')) return null;
                              const stItem = rawItem.type ? rawItem : { ...rawItem, type: 'checklist' };
                              const stItemTasks = stItems.filter(i => i.type === 'task' && i.parent_id === stItem.id);
                              const stDisplayItem = { ...stItem, tasks: stItemTasks, details: [] };
                              const isCompleted = dropdownConditions.find(dd => dd.name === stDisplayItem.custom_dropdown_value)?.is_completed;
                              return (
                                <div key={stDisplayItem.id} className={`clay-card p-2 ${isCompleted ? 'bg-green-100/70' : 'bg-white'}`}>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">Checklist</span>
                                    <span className={`text-sm flex-1 ${isCompleted ? 'line-through text-gray-400' : ''}`}>{stDisplayItem.text}</span>
                                    <Select value={stDisplayItem.approved_by || ""} onValueChange={(val) => updateChecklistItem(stDisplayItem.id, { approved_by: val })} disabled={!isRegistered}>
                                      <SelectTrigger className="h-6 text-xs w-28"><SelectValue placeholder="Approved..." /></SelectTrigger>
                                      <SelectContent>{users.map(u => <SelectItem key={u.email} value={u.full_name || u.email}>{u.full_name || u.email}</SelectItem>)}</SelectContent>
                                    </Select>
                                    <Select value={stDisplayItem.custom_dropdown_value || "select_value"} onValueChange={(val) => {
                                      if (val === "other") setShowOtherPopup({ itemId: stDisplayItem.id });
                                      else if (val !== "select_value") {
                                        if (!stDisplayItem.approved_by) { alert("Please select an approver first."); return; }
                                        updateChecklistItem(stDisplayItem.id, { custom_dropdown_value: val });
                                      }
                                    }} disabled={!isRegistered}>
                                      <SelectTrigger className="h-6 text-xs w-32"><SelectValue placeholder="Status...">{stDisplayItem.custom_dropdown_value || "Status..."}</SelectValue></SelectTrigger>
                                      <SelectContent>
                                        {dropdownConditions.filter(dd => (stDisplayItem.dropdown_ids || []).includes(dd.id)).map(dd => <SelectItem key={dd.id} value={dd.name}>{dd.name}</SelectItem>)}
                                        <SelectItem value="other" className="text-orange-600 font-medium">+ Other...</SelectItem>
                                      </SelectContent>
                                    </Select>
                                    {isRegistered && <Button variant="ghost" size="sm" onClick={() => deleteChecklistItem(stDisplayItem.id)} className="h-6 w-6 p-0 text-red-500"><Trash2 className="w-3 h-3" /></Button>}
                                  </div>
                                  {stDisplayItem.tasks?.map(task => renderTaskRow(task, productName))}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}

                {Object.keys(completedChecklist).length > 0 && (
                  <div className="mt-6 pt-4 border-t-4 border-green-300">
                    <h3 className="font-bold text-green-800 mb-3 flex items-center gap-2"><CheckCircle2 className="w-5 h-5" />Completed Items</h3>
                    {Object.entries(completedChecklist).map(([productName, group]) => (
                      <div key={productName} className="border-2 border-green-200 rounded-lg p-3 bg-green-50/20 mb-3">
                        <h3 className="font-bold text-green-800 flex items-center gap-2 mb-2">📋 {productName}</h3>
                        {group.mainItems.map(rawItem => {
                          if (rawItem.parent_id && (rawItem.type === 'task' || rawItem.type === 'detail' || rawItem.type === 'subtask')) return null;
                          const item = rawItem.type ? rawItem : { ...rawItem, type: 'checklist' };
                          return (
                            <div key={item.id} className="clay-card p-2 bg-green-100/70 mb-2">
                              <div className="flex items-center gap-2">
                                <span className="text-xs px-2 py-0.5 rounded bg-green-200 text-green-700">Checklist</span>
                                <span className="font-medium text-sm flex-1 line-through text-gray-500">{item.text}</span>
                                <Select value={item.approved_by || ""} onValueChange={(val) => updateChecklistItem(item.id, { approved_by: val })} disabled={!isRegistered}>
                                  <SelectTrigger className="h-6 text-xs w-28"><SelectValue placeholder="Approved..." /></SelectTrigger>
                                  <SelectContent>{users.map(u => <SelectItem key={u.email} value={u.full_name || u.email}>{u.full_name || u.email}</SelectItem>)}</SelectContent>
                                </Select>
                                <Select value={item.custom_dropdown_value || "select_value"} onValueChange={(val) => { if (val !== "select_value") updateChecklistItem(item.id, { custom_dropdown_value: val }); }} disabled={!isRegistered}>
                                  <SelectTrigger className="h-6 text-xs w-32"><SelectValue placeholder="Status...">{item.custom_dropdown_value || "Status..."}</SelectValue></SelectTrigger>
                                  <SelectContent>
                                    {dropdownConditions.filter(dd => (item.dropdown_ids || []).includes(dd.id)).map(dd => <SelectItem key={dd.id} value={dd.name}>{dd.name}</SelectItem>)}
                                    <SelectItem value="other" className="text-orange-600 font-medium">+ Other...</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {showAddGeneralChecklist && (
            <div className="p-3 bg-gray-50 rounded-lg border mb-3">
              <div className="flex items-center gap-2">
                <Input value={newGeneralChecklistText} onChange={(e) => setNewGeneralChecklistText(e.target.value)} placeholder="New general checklist item..." className="h-8 text-sm flex-1" autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newGeneralChecklistText.trim()) {
                      const newItem = { id: `General Items_manual_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, text: newGeneralChecklistText.trim(), type: 'checklist', approved_by: "", custom_dropdown_value: "", product_name: "General Items", product_type: "", parent_id: null };
                      setChecklist(prev => [...prev, newItem]);
                      setNewGeneralChecklistText("");
                      setShowAddGeneralChecklist(false);
                    }
                    if (e.key === 'Escape') { setShowAddGeneralChecklist(false); setNewGeneralChecklistText(""); }
                  }} />
                <Button size="sm" className="h-8 px-3" onClick={() => {
                  if (newGeneralChecklistText.trim()) {
                    const newItem = { id: `General Items_manual_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, text: newGeneralChecklistText.trim(), type: 'checklist', approved_by: "", custom_dropdown_value: "", product_name: "General Items", product_type: "", parent_id: null };
                    setChecklist(prev => [...prev, newItem]);
                    setNewGeneralChecklistText(""); setShowAddGeneralChecklist(false);
                  }
                }}>Add</Button>
                <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => { setShowAddGeneralChecklist(false); setNewGeneralChecklistText(""); }}>Cancel</Button>
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-4 border-t">
            <Button variant="outline" onClick={onClose} className="flex-1 h-10">Cancel</Button>
            {isRegistered && <Button variant="outline" onClick={() => setShowAddGeneralChecklist(true)} className="flex-1 h-10"><Plus className="w-4 h-4 mr-2" />Add Item</Button>}
            {isRegistered && !workOrder.sip_completed && (
              <Button onClick={handleCheckOff} className="flex-1 h-10 bg-green-600 hover:bg-green-700 text-white">
                <CheckCircle2 className="w-4 h-4 mr-2" />Complete
              </Button>
            )}
            <Button onClick={saveChecklist} disabled={isSaving || !isRegistered} className="flex-1 h-10 bg-orange-600 hover:bg-orange-700">
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {showTemplateBuilder && ReactDOM.createPortal(
        <MmmTemplateBuilder
          isOpen={showTemplateBuilder}
          onClose={() => setShowTemplateBuilder(false)}
          onApplyTemplate={(templateData) => { handleApplyTemplate(templateData); setShowTemplateBuilder(false); }}
          existingChecklist={checklist}
          isAdmin={isAdmin}
          workOrderProducts={[]}
        />,
        document.body
      )}

      <AlertDialog open={!!incompleteWarning} onOpenChange={() => setIncompleteWarning(null)}>
        <AlertDialogContent className="clay-card border-none">
          <AlertDialogHeader><AlertDialogTitle className="flex items-center gap-2"><AlertCircle className="w-5 h-5 text-orange-500" />Incomplete Checklist</AlertDialogTitle><AlertDialogDescription>Please complete all checklist items before marking as done.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>OK</AlertDialogCancel></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!noChecklistWarning} onOpenChange={() => setNoChecklistWarning(null)}>
        <AlertDialogContent className="clay-card border-none">
          <AlertDialogHeader><AlertDialogTitle className="flex items-center gap-2"><AlertCircle className="w-5 h-5 text-yellow-500" />No Checklist Created</AlertDialogTitle><AlertDialogDescription>No checklist created yet. Mark as complete anyway?</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={proceedWithCheckOff} className="bg-green-600 hover:bg-green-700">Yes, Mark Complete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <OtherDialog open={!!showOtherPopup} onOpenChange={() => setShowOtherPopup(null)}>
        <OtherDialogContent className="max-w-md clay-card border-none">
          <OtherDialogHeader><OtherDialogTitle className="flex items-center gap-2"><List className="w-5 h-5 text-orange-500" />Select or Create Value</OtherDialogTitle></OtherDialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium mb-2 block">Available Conditions</Label>
              <div className="max-h-48 overflow-y-auto border rounded-lg bg-gray-50">
                {dropdownConditions.length === 0 ? (
                  <div className="p-4 text-center text-gray-500 text-sm">No conditions created yet.</div>
                ) : dropdownConditions.map(dd => (
                  <div key={dd.id} onClick={() => { if (showOtherPopup?.itemId) { updateChecklistItem(showOtherPopup.itemId, { custom_dropdown_value: dd.name }); setShowOtherPopup(null); } }} className={`p-3 border-b last:border-b-0 hover:bg-orange-50 cursor-pointer flex items-center gap-2 ${dd.is_completed ? 'bg-green-50' : 'bg-yellow-50'}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${dd.is_completed ? 'bg-green-500' : 'bg-yellow-500'}`}>
                      {dd.is_completed ? <CheckCircle2 className="w-4 h-4 text-white" /> : <List className="w-4 h-4 text-white" />}
                    </div>
                    <div className="flex-1"><span className="font-medium">{dd.name}</span><span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${dd.is_completed ? 'bg-green-200 text-green-800' : 'bg-yellow-200 text-yellow-800'}`}>{dd.is_completed ? 'Completed' : 'Continued'}</span></div>
                  </div>
                ))}
              </div>
            </div>
            <div className="border-t pt-4">
              <Label className="text-sm font-medium mb-2 block">Or Enter Custom Value</Label>
              <div className="flex gap-2">
                <Input value={customDropdownValue} onChange={(e) => setCustomDropdownValue(e.target.value)} placeholder="Type custom value..." className="flex-1" onKeyDown={(e) => { if (e.key === 'Enter' && showOtherPopup?.itemId && customDropdownValue.trim()) { updateChecklistItem(showOtherPopup.itemId, { custom_dropdown_value: customDropdownValue.trim() }); setCustomDropdownValue(""); setShowOtherPopup(null); } }} />
                <Button onClick={() => { if (showOtherPopup?.itemId && customDropdownValue.trim()) { updateChecklistItem(showOtherPopup.itemId, { custom_dropdown_value: customDropdownValue.trim() }); setCustomDropdownValue(""); setShowOtherPopup(null); } }} disabled={!customDropdownValue.trim()} className="bg-orange-600 hover:bg-orange-700"><Plus className="w-4 h-4 mr-1" />Use</Button>
              </div>
            </div>
          </div>
          <OtherDialogFooter><Button variant="outline" onClick={() => setShowOtherPopup(null)}>Cancel</Button></OtherDialogFooter>
        </OtherDialogContent>
      </OtherDialog>
    </>
  );
}