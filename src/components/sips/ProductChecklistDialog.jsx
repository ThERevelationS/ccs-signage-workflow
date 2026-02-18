import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Save, Plus, Pencil, AlertCircle, CheckCircle2, Trash2, List, MoreHorizontal, ChevronDown, ChevronRight, Users } from "lucide-react";
import MultiUserSelectInline from "@/components/shared/MultiUserSelectInline";
import { Dialog as OtherDialog, DialogContent as OtherDialogContent, DialogHeader as OtherDialogHeader, DialogTitle as OtherDialogTitle, DialogFooter as OtherDialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import TemplateBuilder from "./TemplateBuilder";

const WorkOrder = base44.entities.WorkOrder;
const AuthorizedEmail = base44.entities.AuthorizedEmail;
const GlobalSettings = base44.entities.GlobalSettings;

export default function ProductChecklistDialog({ 
  isOpen, 
  onClose, 
  workOrder, 
  onUpdate,
  isRegistered,
  isAdmin
}) {
  const [checklist, setChecklist] = useState([]);
  const [products, setProducts] = useState([]);
  const [users, setUsers] = useState([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showTemplateBuilder, setShowTemplateBuilder] = useState(false);
  const [dropdownConditions, setDropdownConditions] = useState([]);
  const [incompleteWarning, setIncompleteWarning] = useState(null);
  const [noChecklistWarning, setNoChecklistWarning] = useState(null);
  const [productTypes, setProductTypes] = useState([]);
  const [showOtherPopup, setShowOtherPopup] = useState(null);
  const [customDropdownValue, setCustomDropdownValue] = useState("");

  useEffect(() => {
    if (isOpen && workOrder) {
      loadData();
    }
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

      // Load products from new structure or migrate old
      if (currentWO.products && Array.isArray(currentWO.products)) {
        setProducts(currentWO.products);
      } else {
        // Migrate old product_1...product_6 to new structure
        const migratedProducts = [];
        for (let i = 1; i <= 6; i++) {
          const desc = currentWO[`product_${i}`];
          if (desc && desc.trim()) {
            migratedProducts.push({
              id: `prod_${i}`,
              description: desc,
              product_type: ""
            });
          }
        }
        setProducts(migratedProducts);
      }

      // Reconstruct hierarchy from IDs if type/parent_id fields are missing
      const rawChecklist = currentWO.sip_checklist || [];
      const reconstructedChecklist = rawChecklist.map(item => {
        // If item already has type, use it
        if (item.type) return item;
        
        // Otherwise, infer type and parent_id from ID structure
        const id = item.id || '';
        let type = 'checklist';
        let parent_id = null;
        
        // Check for subtask pattern: contains "_task_" AND has another "_task_" or ends differently
        // Pattern for subtask: parentId_task_xxx (where parentId itself contains _task_)
        if (id.includes('_subtask_')) {
          type = 'subtask';
          // Parent is everything before _subtask_
          const subtaskIdx = id.lastIndexOf('_subtask_');
          parent_id = id.substring(0, subtaskIdx);
        } else if (id.includes('_detail_')) {
          // Check if this is a task under a detail
          const detailIdx = id.indexOf('_detail_');
          const afterDetail = id.substring(detailIdx);
          if (afterDetail.includes('_task_')) {
            // This is a task under a detail
            type = 'task';
            // Parent is up to and including the detail portion
            const taskIdx = id.lastIndexOf('_task_');
            parent_id = id.substring(0, taskIdx);
          } else {
            type = 'detail';
            // Parent is everything before _detail_
            parent_id = id.substring(0, detailIdx);
          }
        } else if (id.includes('_task_')) {
          type = 'task';
          // Parent is everything before _task_
          const taskIdx = id.lastIndexOf('_task_');
          parent_id = id.substring(0, taskIdx);
        }
        
        return {
          ...item,
          type,
          parent_id
        };
      });
      
      console.log("Loaded checklist with reconstructed hierarchy:", 
        reconstructedChecklist.map(i => ({ 
          id: i.id?.substring(0, 40), 
          text: i.text?.substring(0, 20),
          type: i.type,
          parent_id: i.parent_id?.substring(0, 40)
        }))
      );
      
      setChecklist(reconstructedChecklist);

      // Load dropdown conditions
      const dropdownsSetting = settings.find(s => s.setting_key === 'dropdownConditions');
      setDropdownConditions(dropdownsSetting?.setting_value?.items || []);
      
      const productTypesSetting = settings.find(s => s.setting_key === 'productTypes');
      const loadedProductTypes = productTypesSetting?.setting_value?.items || 
        ["Channel Letters", "Cabinet Sign", "Monument", "Pylon", "Wall Sign", "Window Graphics", "Vehicle Wrap"];
      setProductTypes(loadedProductTypes);
    } catch (error) {
      console.error("Error loading data:", error);
    }
    setIsLoading(false);
  };

  const getDropdownName = (dropdownId) => {
    if (!dropdownId) return null;
    const dd = dropdownConditions.find(d => d.id === dropdownId);
    return dd?.name || null;
  };

  const handleOtherDropdownSelect = (itemId, selectedDropdownId) => {
    updateChecklistItem(itemId, { dropdown_id: selectedDropdownId, custom_dropdown_value: "" });
    setShowOtherPopup(null);
  };

  const handleCreateCustomValue = (itemId) => {
    if (!customDropdownValue.trim()) return;
    updateChecklistItem(itemId, { custom_dropdown_value: customDropdownValue.trim() });
    setCustomDropdownValue("");
    setShowOtherPopup(null);
  };

  // Handle template application from TemplateBuilder - APPENDS to existing checklist
  const handleApplyTemplate = (templateData) => {
    console.log("handleApplyTemplate called with:", templateData);
    const newItems = [];
    
    // Helper to flatten hierarchical items
    const flattenItem = (item, productName, productType, subTemplateName = null) => {
      // Generate unique ID with timestamp to avoid conflicts
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substr(2, 9);
      const baseId = subTemplateName 
        ? `${productName}_sub_${subTemplateName}_${item.id}_${timestamp}_${randomSuffix}`
        : `${productName}_${item.id}_${timestamp}_${randomSuffix}`;
      
      // Get dropdown_ids (support both old dropdown_id and new dropdown_ids array)
      const itemDropdownIds = item.dropdown_ids || (item.dropdown_id ? [item.dropdown_id] : []);
      
      // Add main checklist item - ensure product_name is always set
      newItems.push({
        id: baseId,
        product_name: productName || 'Unnamed Product',
        product_type: productType || '',
        sub_template_name: subTemplateName,
        text: item.text,
        type: 'checklist',
        approved_by: "",
        dropdown_ids: itemDropdownIds,
        dropdown_id: itemDropdownIds[0] || "",
        custom_dropdown_value: ""
      });
      
      // Add tasks under main item
      item.tasks?.forEach((task, tIdx) => {
        newItems.push({
          id: `${baseId}_task_${task.id}_${tIdx}`,
          product_name: productName || 'Unnamed Product',
          product_type: productType || '',
          sub_template_name: subTemplateName,
          parent_id: baseId,
          text: task.text,
          type: 'task',
          approved_by: "",
          assigned_to: "",
          custom_dropdown_value: ""
        });
      });
      
      // Add detail items and their tasks
      item.details?.forEach((detail, dIdx) => {
        const detailId = `${baseId}_detail_${detail.id}_${dIdx}`;
        const detailDropdownIds = detail.dropdown_ids || (detail.dropdown_id ? [detail.dropdown_id] : []);
        
        newItems.push({
          id: detailId,
          product_name: productName || 'Unnamed Product',
          product_type: productType || '',
          sub_template_name: subTemplateName,
          parent_id: baseId,
          text: detail.text,
          type: 'detail',
          approved_by: "",
          dropdown_ids: detailDropdownIds,
          dropdown_id: detailDropdownIds[0] || "",
          custom_dropdown_value: ""
        });
        
        // Add tasks under detail
        detail.tasks?.forEach((task, dtIdx) => {
          newItems.push({
            id: `${detailId}_task_${task.id}_${dtIdx}`,
            product_name: productName || 'Unnamed Product',
            product_type: productType || '',
            sub_template_name: subTemplateName,
            parent_id: detailId,
            text: task.text,
            type: 'task',
            approved_by: "",
            assigned_to: "",
            custom_dropdown_value: ""
          });
        });
      });
    };
    
    templateData.forEach(section => {
      if (section.type === 'product_header') {
        section.items.forEach(item => {
          flattenItem(item, section.productName, section.productType);
        });
      } else if (section.type === 'sub_template') {
        section.items.forEach(item => {
          // Use parentProduct as the product_name for sub-template items
          flattenItem(item, section.parentProduct, null, section.subTemplateName);
        });
      }
    });

    // Append to existing checklist instead of replacing
    console.log("Setting checklist with", newItems.length, "new items, total:", checklist.length + newItems.length);
    setChecklist(prev => [...prev, ...newItems]);
  };

  const updateChecklistItem = (itemId, updates) => {
    setChecklist(checklist.map(item => 
      item.id === itemId ? { ...item, ...updates } : item
    ));
  };

  const deleteChecklistItem = (itemId) => {
    // Get the item being deleted to find its product_name
    const deletedItem = checklist.find(item => item.id === itemId);
    const newChecklist = checklist.filter(item => item.id !== itemId);
    
    // If item had a product_name, check if any items remain for that product
    if (deletedItem?.product_name) {
      const productName = deletedItem.product_name;
      const remainingItemsForProduct = newChecklist.filter(item => {
        // Check if item belongs to this product (direct or via parent chain)
        if (item.product_name === productName) return true;
        // Check parent chain
        let current = item;
        while (current?.parent_id) {
          const parent = newChecklist.find(p => p.id === current.parent_id);
          if (parent?.product_name === productName) return true;
          current = parent;
        }
        return false;
      });
      
      // If no items remain for this product, the product group will naturally disappear
      // No additional cleanup needed as grouping is dynamic
    }
    
    setChecklist(newChecklist);
  };

  // Check if an item's children are all complete
  const areChildrenComplete = (itemId) => {
    const children = checklist.filter(c => c.parent_id === itemId);
    if (children.length === 0) return true;
    
    return children.every(child => {
      if (child.type === 'detail') {
        // Detail must have both approved_by and condition
        if (!child.approved_by || !child.custom_dropdown_value) return false;
        // Check if detail's children (tasks) are complete
        return areChildrenComplete(child.id);
      } else if (child.type === 'task' || child.type === 'subtask') {
        // Task/subtask must have approved_by (checked)
        if (!child.approved_by) return false;
        // Check if task's children (subtasks) are complete
        return areChildrenComplete(child.id);
      }
      return true;
    });
  };

  const checkIfComplete = () => {
    if (!checklist || checklist.length === 0) {
      return { complete: false, hasChecklist: false };
    }
    
    // Check if all checklist items (not tasks/subtasks) have both approved_by and custom_dropdown_value
    // AND that all selected conditions are "completed" type conditions
    const checklistItems = checklist.filter(item => item.type !== 'task' && item.type !== 'subtask');
    const allApproved = checklistItems.every(item => {
      if (!item.approved_by || !item.custom_dropdown_value) return false;
      
      // Find the selected condition and check if it's a "completed" condition
      const selectedCondition = dropdownConditions.find(dd => dd.name === item.custom_dropdown_value);
      // If condition exists and is NOT marked as completed, the item is not complete
      if (selectedCondition && !selectedCondition.is_completed) return false;
      
      return true;
    });

    return { 
      complete: allApproved, 
      hasChecklist: true 
    };
  };

  const handleCheckOff = async () => {
    const status = checkIfComplete();
    
    if (!status.hasChecklist) {
      setNoChecklistWarning(true);
      return;
    }
    
    if (!status.complete) {
      setIncompleteWarning(true);
      return;
    }

    // Mark as completed
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
      // Build a map for quick parent lookup
      const itemMap = new Map();
      checklist.forEach(item => itemMap.set(item.id, item));
      
      // Recursive function to find root product info by traversing parent chain
      const findRootProductInfo = (itemId, visited = new Set()) => {
        if (!itemId || visited.has(itemId)) return null;
        visited.add(itemId);
        
        const item = itemMap.get(itemId);
        if (!item) return null;
        
        // Check if this item has valid product info
        const hasValidProductName = item.product_name && 
            item.product_name !== 'undefined' && 
            item.product_name !== 'General Items' &&
            item.product_name !== 'Manual Items' &&
            item.product_name !== 'Ungrouped';
        
        if (hasValidProductName) {
          return {
            product_name: item.product_name,
            product_type: item.product_type || '',
            sub_template_name: item.sub_template_name || null
          };
        }
        
        // Traverse up to parent
        if (item.parent_id) {
          return findRootProductInfo(item.parent_id, visited);
        }
        
        return null;
      };
      
      // Before saving, ensure ALL items have proper product_name by resolving from parent chain
      // IMPORTANT: Preserve ALL fields including type, parent_id, etc.
      const resolvedChecklist = checklist.map(item => {
        // Always try to resolve from parent chain first
        const rootInfo = findRootProductInfo(item.id);
        
        // Build the complete item with all fields preserved
        const savedItem = {
          id: item.id,
          text: item.text,
          type: item.type || 'checklist', // Preserve type
          parent_id: item.parent_id || null, // Preserve parent_id
          approved_by: item.approved_by || '',
          assigned_to: item.assigned_to || '',
          custom_dropdown_value: item.custom_dropdown_value || '',
          dropdown_id: item.dropdown_id || '',
          dropdown_ids: item.dropdown_ids || [],
          product_name: rootInfo?.product_name || item.product_name || 'General Items',
          product_type: item.product_type || rootInfo?.product_type || '',
          sub_template_name: item.sub_template_name || rootInfo?.sub_template_name || null,
          product_id: item.product_id || null,
          sub_items: item.sub_items || []
        };
        
        return savedItem;
      });
      
      console.log("Saving checklist - items:", 
        resolvedChecklist.map(i => ({ 
          id: i.id?.substring(0, 30), 
          text: i.text?.substring(0, 20),
          type: i.type,
          parent_id: i.parent_id?.substring(0, 30),
          product_name: i.product_name
        }))
      );
      
      await WorkOrder.update(workOrder.id, { 
        sip_checklist: resolvedChecklist,
        products: products
      });
      if (onUpdate) onUpdate();
      onClose();
    } catch (error) {
      console.error("Error saving checklist:", error);
    }
    setIsSaving(false);
  };

  // Group checklist items by product_name extracted from item ID or product_name field
  const getGroupedChecklist = () => {
    const groups = {};
    const itemOrder = new Map();
    
    // Build item map for parent lookups
    const itemMap = new Map();
    checklist.forEach(item => itemMap.set(item.id, item));
    
    // Extract product name from item ID (e.g., "Channel Letters_123_abc" -> "Channel Letters")
    const extractProductNameFromId = (id) => {
      if (!id) return null;
      
      // Check for sub-template pattern first: "ProductName_sub_SubTemplateName_..."
      if (id.includes('_sub_')) {
        const beforeSub = id.split('_sub_')[0];
        // The product name is everything before _sub_, but we need to handle the timestamp/random suffix
        // Pattern: "ProductName_timestamp_random_sub_..."
        // Find where the product name ends (before first numeric timestamp)
        const parts = beforeSub.split('_');
        const nameparts = [];
        for (const part of parts) {
          // Stop when we hit a timestamp (long number) or random string pattern or "manual"
          if (/^\d{13}/.test(part) || /^[a-z0-9]{9}$/.test(part) || part === 'manual') break;
          nameparts.push(part);
        }
        if (nameparts.length > 0) return nameparts.join(' ');
      }
      
      // Standard pattern: "ProductName_timestamp_random_..." or "ProductName_manual_timestamp_random_..."
      const parts = id.split('_');
      const nameparts = [];
      for (const part of parts) {
        // Stop when we hit a timestamp (long number) or random string, or "task", "detail", "manual", "sub"
        if (/^\d{10,}/.test(part) || /^[a-z0-9]{9}$/.test(part) || ['task', 'detail', 'manual', 'sub'].includes(part)) break;
        nameparts.push(part);
      }
      if (nameparts.length > 0) return nameparts.join(' ');
      
      return null;
    };
    
    // Extract sub-template name from ID
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
    
    // Resolve product name - check field first, then extract from ID, then parent chain
    const resolveProductName = (item, visited = new Set()) => {
      if (!item || visited.has(item.id)) return null;
      visited.add(item.id);
      
      // 1. Check if item has explicit product_name field
      if (item.product_name && !['undefined', 'General Items', 'Manual Items', 'Ungrouped'].includes(item.product_name)) {
        return item.product_name;
      }
      
      // 2. Try to extract from ID
      const fromId = extractProductNameFromId(item.id);
      if (fromId) return fromId;
      
      // 3. Try parent chain
      if (item.parent_id) {
        const parent = itemMap.get(item.parent_id);
        if (parent) return resolveProductName(parent, visited);
      }
      
      return null;
    };
    
    // Resolve sub-template name
    const resolveSubTemplateName = (item, visited = new Set()) => {
      if (!item || visited.has(item.id)) return null;
      visited.add(item.id);
      
      // 1. Check explicit field
      if (item.sub_template_name) return item.sub_template_name;
      
      // 2. Extract from ID
      const fromId = extractSubTemplateFromId(item.id);
      if (fromId) return fromId;
      
      // 3. Parent chain
      if (item.parent_id) {
        const parent = itemMap.get(item.parent_id);
        if (parent) return resolveSubTemplateName(parent, visited);
      }
      
      return null;
    };
    
    // First pass: collect all items with their resolved product names
    const itemsWithProduct = checklist.map((item, index) => {
      itemOrder.set(item.id, index);
      let productName = resolveProductName(item);
      if (!productName) productName = 'General Items';
      const subTemplateName = resolveSubTemplateName(item);
      return { item, productName, subTemplateName };
    });
    
    // Second pass: group items - but keep parent_id relationships intact
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
    
    // Sort items within each group by their original order
    Object.values(groups).forEach(group => {
      group.mainItems.sort((a, b) => (itemOrder.get(a.id) || 0) - (itemOrder.get(b.id) || 0));
      Object.values(group.subTemplates).forEach(stItems => {
        stItems.sort((a, b) => (itemOrder.get(a.id) || 0) - (itemOrder.get(b.id) || 0));
      });
    });
    
    return groups;
  };
  
  // Build hierarchy for items
  const buildItemHierarchy = (items) => {
    // Get main items: either type='checklist', no type (legacy), or items without parent_id that aren't tasks/details/subtasks
    const mainItems = items.filter(i => {
      // If it has no type, it's a legacy main item
      if (!i.type) return !i.parent_id;
      // Otherwise, it's a checklist item without a parent
      return i.type === 'checklist' && !i.parent_id;
    });
    
    return mainItems.map(main => {
      const details = items.filter(i => i.type === 'detail' && i.parent_id === main.id);
      const mainTasks = items.filter(i => i.type === 'task' && i.parent_id === main.id);
      
      return {
        ...main,
        tasks: mainTasks,
        details: details.map(detail => ({
          ...detail,
          tasks: items.filter(i => i.type === 'task' && i.parent_id === detail.id)
        }))
      };
    });
  };
  
  // All items expanded by default - using a ref to track
  const [expandedItems, setExpandedItems] = useState({});
  const [hoveredItem, setHoveredItem] = useState(null);
  const [hoveredProduct, setHoveredProduct] = useState(null);
  const [newItemInput, setNewItemInput] = useState({ show: false, parentId: null, type: null, productName: null });
  const [newItemText, setNewItemText] = useState("");
  const [showAddGeneralChecklist, setShowAddGeneralChecklist] = useState(false);
  const [newGeneralChecklistText, setNewGeneralChecklistText] = useState("");
  const [editingItemId, setEditingItemId] = useState(null);
  const [editingItemText, setEditingItemText] = useState("");

  const startEditItem = (item, e) => {
    e.stopPropagation();
    setEditingItemId(item.id);
    setEditingItemText(item.text);
  };

  const saveEditItem = () => {
    if (!editingItemText.trim()) return;
    updateChecklistItem(editingItemId, { text: editingItemText.trim() });
    setEditingItemId(null);
    setEditingItemText("");
  };
  
  const toggleExpanded = (itemId) => {
    setExpandedItems(prev => ({ ...prev, [itemId]: !prev[itemId] }));
  };

  const addNewItem = (type, parentId = null, productName = null) => {
    if (!newItemText.trim()) return;
    
    // Find the parent item to get its product_name and sub_template_name for proper grouping
    let actualProductName = productName;
    let subTemplateName = null;
    let productType = '';
    
    // Helper to traverse parent chain and get the root product info
    const getParentChainInfo = (itemId) => {
      const item = checklist.find(i => i.id === itemId);
      if (!item) return null;
      
      // If this item has valid product_name, use it
      if (item.product_name && 
          item.product_name !== 'undefined' && 
          item.product_name !== 'General Items' &&
          item.product_name !== 'Manual Items') {
        return {
          product_name: item.product_name,
          product_type: item.product_type || '',
          sub_template_name: item.sub_template_name || null
        };
      }
      
      // Otherwise, traverse up to parent
      if (item.parent_id) {
        return getParentChainInfo(item.parent_id);
      }
      
      return null;
    };
    
    if (parentId) {
      // Get info from parent chain - this will find the original checklist item's product_name
      const parentInfo = getParentChainInfo(parentId);
      if (parentInfo) {
        actualProductName = parentInfo.product_name;
        productType = parentInfo.product_type;
        subTemplateName = parentInfo.sub_template_name;
      } else {
        // Direct parent lookup as fallback
        const parentItem = checklist.find(item => item.id === parentId);
        if (parentItem) {
          actualProductName = parentItem.product_name || productName;
          subTemplateName = parentItem.sub_template_name || null;
          productType = parentItem.product_type || '';
        }
      }
    }
    
    // Ensure we have a valid product name - but NEVER default to General Items if we have productName passed in
    if (!actualProductName || actualProductName === 'Manual Items' || actualProductName === 'undefined') {
      actualProductName = productName || 'General Items';
    }
    
    console.log("Adding new item with product_name:", actualProductName, "parent_id:", parentId, "type:", type);
    
    // Create ID that includes product name for proper grouping (matching template item pattern)
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substr(2, 9);
    const sanitizedProductName = (actualProductName || 'General Items').replace(/\s+/g, ' ');
    const newId = subTemplateName 
      ? `${sanitizedProductName}_sub_${subTemplateName}_manual_${timestamp}_${randomSuffix}`
      : `${sanitizedProductName}_manual_${timestamp}_${randomSuffix}`;
    
    const newItem = {
      id: newId,
      text: newItemText.trim(),
      type: type,
      approved_by: "",
      custom_dropdown_value: "",
      product_name: actualProductName,
      product_type: productType,
      sub_template_name: subTemplateName,
      parent_id: parentId
    };
    
    console.log("New item created:", JSON.stringify(newItem));
    
    // Insert the new item right after its parent in the checklist array
    // This ensures the item stays in the correct position
    if (parentId) {
      const parentIndex = checklist.findIndex(item => item.id === parentId);
      if (parentIndex !== -1) {
        // Find the last child of this parent to insert after
        let insertIndex = parentIndex + 1;
        for (let i = parentIndex + 1; i < checklist.length; i++) {
          if (checklist[i].parent_id === parentId) {
            insertIndex = i + 1;
          } else if (checklist[i].parent_id !== parentId && 
                     checklist.find(p => p.id === checklist[i].parent_id)?.parent_id === parentId) {
            // This is a grandchild (e.g., subtask under a task), continue
            insertIndex = i + 1;
          } else {
            break;
          }
        }
        setChecklist(prev => {
          const newList = [...prev];
          newList.splice(insertIndex, 0, newItem);
          return newList;
        });
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
          <div className="flex items-center justify-center p-8">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const groupedChecklist = getGroupedChecklist();
  
  // Separate active and completed checklists
  const separateCompletedItems = () => {
    const active = {};
    const completed = {};
    
    Object.entries(groupedChecklist).forEach(([productName, group]) => {
      active[productName] = { ...group, mainItems: [], subTemplates: {} };
      completed[productName] = { ...group, mainItems: [], subTemplates: {} };
      
      // Separate main items
      group.mainItems.forEach(item => {
        if (!item.parent_id && (item.type === 'checklist' || !item.type)) {
          // Main checklist item - check if completed
          const isCompleted = dropdownConditions.find(dd => dd.name === item.custom_dropdown_value)?.is_completed;
          const targetGroup = isCompleted ? completed : active;
          
          // Add the item and ALL its children
          targetGroup[productName].mainItems.push(item);
        } else {
          // Child item - add to same group as its parent
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
      
      // Separate sub-template items
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
            if (parent) {
              const parentCompleted = dropdownConditions.find(dd => dd.name === parent.custom_dropdown_value)?.is_completed;
              const targetGroup = parentCompleted ? completed : active;
              targetGroup[productName].subTemplates[stName].push(item);
            } else {
              active[productName].subTemplates[stName].push(item);
            }
          }
        });
        
        // Remove empty sub-template groups
        if (active[productName].subTemplates[stName].length === 0) {
          delete active[productName].subTemplates[stName];
        }
        if (completed[productName].subTemplates[stName].length === 0) {
          delete completed[productName].subTemplates[stName];
        }
      });
      
      // Remove empty product groups
      if (active[productName].mainItems.length === 0 && Object.keys(active[productName].subTemplates).length === 0) {
        delete active[productName];
      }
      if (completed[productName].mainItems.length === 0 && Object.keys(completed[productName].subTemplates).length === 0) {
        delete completed[productName];
      }
    });
    
    return { active, completed };
  };
  
  const { active: activeChecklist, completed: completedChecklist } = separateCompletedItems();

  return (
    <>
      <Dialog open={isOpen && !showTemplateBuilder} onOpenChange={() => {}}>
        <DialogContent className="clay-card border-none max-w-6xl max-h-[90vh] overflow-hidden flex flex-col [&>button]:hidden">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="text-xl font-bold">
                SIP Checklist - {workOrder?.client_name}
              </DialogTitle>
              <div className="flex gap-2">
                {isAdmin && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowTemplateBuilder(true)}
                  >
                    <Pencil className="w-4 h-4 mr-1" />
                    Checklist Builder
                  </Button>
                )}
              </div>
            </div>
          </DialogHeader>

          {/* Checklist Items */}
          <div className="flex-1 overflow-y-auto space-y-3">
            {checklist.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>No checklist items yet</p>
                <p className="text-sm mt-1">Use Checklist Builder to create and apply checklists</p>
              </div>
            ) : (
              <>
                {/* Active Items */}
                {Object.entries(activeChecklist)
                  .filter(([productName, group]) => {
                    const hasMainChecklistItems = group.mainItems.some(item => 
                      !item.parent_id && (item.type === 'checklist' || !item.type)
                    );
                    const hasSubTemplateItems = Object.values(group.subTemplates).some(stItems => 
                      stItems.some(item => !item.parent_id && (item.type === 'checklist' || !item.type))
                    );
                    return hasMainChecklistItems || hasSubTemplateItems;
                  })
                  .map(([productName, group]) => (
                <div 
                  key={productName} 
                  className="border-2 border-purple-200 rounded-lg p-3 bg-purple-50/20"
                  onMouseEnter={() => setHoveredProduct(productName)}
                  onMouseLeave={() => setHoveredProduct(null)}
                >
                  <div className="flex items-center gap-2 mb-3">
                    {/* Add Checklist button on hover */}
                    {isRegistered && hoveredProduct === productName && (
                      <button
                        onClick={(e) => { 
                          e.stopPropagation(); 
                          setNewItemInput({ show: true, parentId: null, type: 'checklist', productName: productName }); 
                        }}
                        className="px-1.5 py-0.5 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                        title="Add Checklist Item"
                      >
                        +Checklist
                      </button>
                    )}
                    <h3 className="font-bold text-purple-800 flex items-center gap-2">
                      📦 {productName}
                      {group.productType && (
                        <span className="text-xs font-normal bg-purple-200 px-2 py-0.5 rounded">
                          {group.productType}
                        </span>
                      )}
                    </h3>
                  </div>
                  
                  {/* Inline add checklist item for this product */}
                  {newItemInput.show && newItemInput.parentId === null && newItemInput.type === 'checklist' && newItemInput.productName === productName && (
                    <div className="mb-3 p-2 bg-blue-50 rounded-lg border border-blue-200">
                      <div className="flex items-center gap-2">
                        <Input
                          value={newItemText}
                          onChange={(e) => setNewItemText(e.target.value)}
                          placeholder="New checklist item..."
                          className="h-7 text-sm flex-1"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') addNewItem('checklist', null, productName);
                            if (e.key === 'Escape') { setNewItemInput({ show: false, parentId: null, type: null, productName: null }); setNewItemText(""); }
                          }}
                        />
                        <Button size="sm" className="h-7 px-3 text-xs" onClick={() => addNewItem('checklist', null, productName)}>Add</Button>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => { setNewItemInput({ show: false, parentId: null, type: null, productName: null }); setNewItemText(""); }}>Cancel</Button>
                      </div>
                    </div>
                  )}

                  {/* Main Items with hierarchy */}
                  {group.mainItems.length > 0 && (
                    <div className="space-y-2 mb-3">
                      {/* Build hierarchy - treat all items as main items if no type field */}
                      {group.mainItems.map(rawItem => {
                        // Skip child items - they'll be rendered under their parent
                        if (rawItem.parent_id && (rawItem.type === 'task' || rawItem.type === 'detail' || rawItem.type === 'subtask')) return null;
                        
                        // Treat items without type as checklist items
                        const item = rawItem.type ? rawItem : { ...rawItem, type: 'checklist' };
                        // Find associated tasks/details from the SAME group
                        const itemTasks = group.mainItems.filter(i => i.type === 'task' && i.parent_id === item.id);
                        const itemDetails = group.mainItems.filter(i => i.type === 'detail' && i.parent_id === item.id).map(detail => ({
                          ...detail,
                          tasks: group.mainItems.filter(i => i.type === 'task' && i.parent_id === detail.id)
                        }));
                        
                        const displayItem = { ...item, tasks: itemTasks, details: itemDetails };
                        const isItemCompleted = dropdownConditions.find(dd => dd.name === displayItem.custom_dropdown_value)?.is_completed;
                        return (
                        <div key={displayItem.id} className={`clay-card p-3 ${isItemCompleted ? 'bg-green-100/70' : 'bg-white'}`}>
                          {/* Main checklist item */}
                          <div 
                            className="flex items-center gap-2 group"
                            onMouseEnter={() => setHoveredItem(displayItem.id)}
                            onMouseLeave={() => setHoveredItem(null)}
                          >
                            <button 
                              onClick={() => toggleExpanded(displayItem.id)}
                              className="p-1 hover:bg-gray-100 rounded"
                            >
                              {(displayItem.details?.length > 0 || displayItem.tasks?.length > 0) ? (
                                (expandedItems[displayItem.id] !== false) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />
                              ) : <div className="w-4" />}
                            </button>
                            <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-700">Checklist</span>
                            {editingItemId === displayItem.id ? (
                              <div className="flex-1 flex gap-1">
                                <Input value={editingItemText} onChange={(e) => setEditingItemText(e.target.value)} className="h-6 text-sm flex-1" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') saveEditItem(); if (e.key === 'Escape') { setEditingItemId(null); } }} />
                                <Button size="sm" className="h-6 px-2 text-xs bg-green-600 hover:bg-green-700" onClick={saveEditItem}>✓</Button>
                                <Button size="sm" variant="ghost" className="h-6 px-1 text-xs" onClick={() => setEditingItemId(null)}>✕</Button>
                              </div>
                            ) : (
                              <span className={`font-medium text-sm flex-1 cursor-pointer hover:bg-gray-100 rounded px-1 ${dropdownConditions.find(dd => dd.name === displayItem.custom_dropdown_value)?.is_completed ? 'line-through text-gray-400' : ''}`} onDoubleClick={(e) => isRegistered && startEditItem(displayItem, e)} title="Double-click to edit">{displayItem.text}</span>
                            )}
                            
                            {/* Quick add buttons on hover */}
                            {isRegistered && hoveredItem === displayItem.id && (
                              <div className="flex gap-1">
                                <button
                                  onClick={(e) => { 
                                    e.stopPropagation(); 
                                    setExpandedItems(prev => ({ ...prev, [displayItem.id]: true }));
                                    setNewItemInput({ show: true, parentId: displayItem.id, type: 'task', productName: displayItem.product_name || productName }); 
                                  }}
                                  className="px-1.5 py-0.5 text-xs bg-orange-100 text-orange-700 rounded hover:bg-orange-200"
                                  title="Add Task"
                                >
                                  +Task
                                </button>
                                <button
                                  onClick={(e) => { 
                                    e.stopPropagation(); 
                                    setExpandedItems(prev => ({ ...prev, [displayItem.id]: true }));
                                    setNewItemInput({ show: true, parentId: displayItem.id, type: 'detail', productName: displayItem.product_name || productName }); 
                                  }}
                                  className="px-1.5 py-0.5 text-xs bg-purple-100 text-purple-700 rounded hover:bg-purple-200"
                                  title="Add Detail"
                                >
                                  +Detail
                                </button>
                              </div>
                            )}
                            
                            <Select
                              value={displayItem.approved_by || ""}
                              onValueChange={(val) => updateChecklistItem(displayItem.id, { approved_by: val })}
                              disabled={!isRegistered}
                            >
                              <SelectTrigger className="h-7 text-xs w-32">
                                <SelectValue placeholder="Approved by..." />
                              </SelectTrigger>
                              <SelectContent>
                                {users.map(u => (
                                  <SelectItem key={u.email} value={u.full_name || u.email}>
                                    {u.full_name || u.email}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>

                            {/* Dropdown with Other option */}
                            <Select
                              value={displayItem.custom_dropdown_value || "select_value"}
                              onValueChange={(val) => {
                                if (val === "other") {
                                  setShowOtherPopup({ itemId: displayItem.id });
                                } else if (val !== "select_value") {
                                  // Require approved_by before allowing any status selection
                                  if (!displayItem.approved_by) {
                                    alert("Please select an approver first before setting the status.");
                                    return;
                                  }
                                  // Check if children are complete before allowing completion
                                  const selectedCondition = dropdownConditions.find(dd => dd.name === val);
                                  if (selectedCondition?.is_completed && !areChildrenComplete(displayItem.id)) {
                                    alert("Please complete all tasks and details under this checklist item first.");
                                    return;
                                  }
                                  updateChecklistItem(displayItem.id, { custom_dropdown_value: val });
                                }
                              }}
                              disabled={!isRegistered}
                            >
                              <SelectTrigger className="h-7 text-xs w-36">
                                <SelectValue placeholder={getDropdownName(displayItem.dropdown_id) || "Status..."}>
                                  {displayItem.custom_dropdown_value || "Status..."}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                {dropdownConditions
                                  .filter(dd => (displayItem.dropdown_ids || []).includes(dd.id))
                                  .map(dd => (
                                    <SelectItem key={dd.id} value={dd.name}>
                                      {dd.name} {dd.is_completed && '(Completed)'}
                                    </SelectItem>
                                  ))}
                                <SelectItem value="other" className="text-purple-600 font-medium">+ Other...</SelectItem>
                              </SelectContent>
                            </Select>

                            {isRegistered && (
                              <Button variant="ghost" size="sm" onClick={() => deleteChecklistItem(displayItem.id)} className="h-7 w-7 p-0 text-red-500">
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            )}
                          </div>

                          {/* Expanded: Tasks and Details - expanded by default */}
                          {(expandedItems[displayItem.id] !== false) && (
                            <div className="ml-8 mt-2 space-y-2 border-l-2 border-gray-200 pl-3">
                              {/* Tasks under main item */}
                              {displayItem.tasks?.map(task => (
                              <div key={task.id} className="bg-orange-50 p-1 rounded border-l-2 border-orange-300 group">
                                <div className="flex items-center gap-1.5">
                                  <Checkbox 
                                    checked={!!task.approved_by}
                                    onCheckedChange={(checked) => updateChecklistItem(task.id, { approved_by: checked ? "Done" : "" })}
                                    disabled={!isRegistered}
                                    className="h-3 w-3"
                                  />
                                  <span className="text-xs px-1 py-0.5 rounded bg-orange-100 text-orange-600 font-medium">T</span>
                                  <span className="text-xs flex-1">{task.text}</span>
                                                  <MultiUserSelectInline
                                    users={users}
                                    selectedUsers={task.assigned_to ? (Array.isArray(task.assigned_to) ? task.assigned_to : [task.assigned_to]) : []}
                                    onSelectionChange={(val) => updateChecklistItem(task.id, { assigned_to: val })}
                                    disabled={!isRegistered}
                                  />
                                  {isRegistered && (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setNewItemInput({ show: true, parentId: task.id, type: 'subtask', productName: displayItem.product_name || productName }); }}
                                      className="px-1 py-0.5 text-xs bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200 opacity-0 group-hover:opacity-100"
                                      title="Add Subtask"
                                    >
                                      +Sub
                                    </button>
                                  )}
                                  {isRegistered && (
                                    <Button variant="ghost" size="sm" onClick={() => deleteChecklistItem(task.id)} className="h-4 w-4 p-0 text-red-500 opacity-0 group-hover:opacity-100">
                                      <Trash2 className="w-2.5 h-2.5" />
                                    </Button>
                                  )}
                                </div>
                                {/* Subtasks */}
                                {checklist.filter(st => st.type === 'subtask' && st.parent_id === task.id).map(subtask => (
                                  <div key={subtask.id} className="ml-4 mt-0.5 flex items-center gap-1 bg-yellow-50 p-0.5 rounded text-xs group/subtask">
                                    <Checkbox 
                                      checked={!!subtask.approved_by}
                                      onCheckedChange={(checked) => updateChecklistItem(subtask.id, { approved_by: checked ? "Done" : "" })}
                                      disabled={!isRegistered}
                                      className="h-2.5 w-2.5"
                                    />
                                    <span className="px-0.5 py-0.5 rounded bg-yellow-100 text-yellow-700">S</span>
                                    <span className="flex-1">{subtask.text}</span>
                                    {isRegistered && (
                                      <Button variant="ghost" size="sm" onClick={() => deleteChecklistItem(subtask.id)} className="h-3 w-3 p-0 text-red-500 opacity-0 group-hover/subtask:opacity-100">
                                        <Trash2 className="w-2 h-2" />
                                      </Button>
                                    )}
                                  </div>
                                ))}
                                {/* Inline add subtask */}
                                {newItemInput.show && newItemInput.parentId === task.id && newItemInput.type === 'subtask' && (
                                  <div className="ml-4 mt-0.5 flex items-center gap-1 bg-yellow-50 p-0.5 rounded">
                                    <Input
                                      value={newItemText}
                                      onChange={(e) => setNewItemText(e.target.value)}
                                      placeholder="New subtask..."
                                      className="h-4 text-xs flex-1"
                                      autoFocus
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') addNewItem('subtask', task.id, displayItem.product_name || productName);
                                        if (e.key === 'Escape') setNewItemInput({ show: false, parentId: null, type: null, productName: null });
                                      }}
                                    />
                                    <Button size="sm" className="h-4 px-1 text-xs" onClick={() => addNewItem('subtask', task.id, displayItem.product_name || productName)}>Add</Button>
                                    <Button size="sm" variant="ghost" className="h-4 px-0.5 text-xs" onClick={() => setNewItemInput({ show: false, parentId: null, type: null, productName: null })}>×</Button>
                                  </div>
                                )}
                              </div>
                              ))}

                              {/* Inline add task input */}
                              {newItemInput.show && newItemInput.parentId === displayItem.id && newItemInput.type === 'task' && (
                              <div className="flex items-center gap-2 bg-orange-50 p-2 rounded border-l-4 border-orange-400">
                                <Input
                                  value={newItemText}
                                  onChange={(e) => setNewItemText(e.target.value)}
                                  placeholder="New task..."
                                  className="h-6 text-xs flex-1"
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') addNewItem('task', displayItem.id, displayItem.product_name || productName);
                                    if (e.key === 'Escape') setNewItemInput({ show: false, parentId: null, type: null, productName: null });
                                  }}
                                />
                                <Button size="sm" className="h-6 px-2 text-xs" onClick={() => addNewItem('task', displayItem.id, displayItem.product_name || productName)}>Add</Button>
                                <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setNewItemInput({ show: false, parentId: null, type: null, productName: null })}>Cancel</Button>
                              </div>
                              )}

                              {/* Inline add detail input */}
                              {newItemInput.show && newItemInput.parentId === displayItem.id && newItemInput.type === 'detail' && (
                                <div className="bg-gray-50 p-2 rounded border">
                                  <div className="flex items-center gap-2">
                                    <Input
                                      value={newItemText}
                                      onChange={(e) => setNewItemText(e.target.value)}
                                      placeholder="New detail..."
                                      className="h-6 text-xs flex-1"
                                      autoFocus
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') addNewItem('detail', displayItem.id, displayItem.product_name || productName);
                                        if (e.key === 'Escape') setNewItemInput({ show: false, parentId: null, type: null, productName: null });
                                      }}
                                    />
                                    <Button size="sm" className="h-6 px-2 text-xs" onClick={() => addNewItem('detail', displayItem.id, displayItem.product_name || productName)}>Add</Button>
                                    <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setNewItemInput({ show: false, parentId: null, type: null, productName: null })}>Cancel</Button>
                                  </div>
                                </div>
                              )}

                              {/* Detail items */}
                              {displayItem.details?.map(detail => {
                                const isDetailCompleted = dropdownConditions.find(dd => dd.name === detail.custom_dropdown_value)?.is_completed;
                                return (
                                <div key={detail.id} className={`p-2 rounded border group/detail ${isDetailCompleted ? 'bg-green-100/70' : 'bg-gray-50'}`}>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">Detail</span>
                                    <span className={`text-sm flex-1 ${dropdownConditions.find(dd => dd.name === detail.custom_dropdown_value)?.is_completed ? 'line-through text-gray-400' : ''}`}>{detail.text}</span>
                                    
                                    {/* Quick add task button for detail */}
                                    {isRegistered && (
                                      <button
                                        onClick={(e) => { e.stopPropagation(); setNewItemInput({ show: true, parentId: detail.id, type: 'task', productName: displayItem.product_name || productName }); }}
                                        className="px-1.5 py-0.5 text-xs bg-orange-100 text-orange-700 rounded hover:bg-orange-200 opacity-0 group-hover/detail:opacity-100"
                                        title="Add Task"
                                      >
                                        +Task
                                      </button>
                                    )}
                                    
                                    <Select
                                      value={detail.approved_by || ""}
                                      onValueChange={(val) => updateChecklistItem(detail.id, { approved_by: val })}
                                      disabled={!isRegistered}
                                    >
                                      <SelectTrigger className="h-6 text-xs w-28">
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
                                      value={detail.custom_dropdown_value || "select_value"}
                                      onValueChange={(val) => {
                                        if (val === "other") {
                                          setShowOtherPopup({ itemId: detail.id });
                                        } else if (val !== "select_value") {
                                          // Require approved_by before allowing any status selection
                                          if (!detail.approved_by) {
                                            alert("Please select an approver first before setting the status.");
                                            return;
                                          }
                                          // Check if it's switching TO a continued condition - allow bringing back
                                          const selectedCondition = dropdownConditions.find(dd => dd.name === val);

                                          // Check if children are complete before allowing completion
                                          if (selectedCondition?.is_completed && !areChildrenComplete(detail.id)) {
                                            alert("Please complete all tasks under this detail first.");
                                            return;
                                          }
                                          updateChecklistItem(detail.id, { custom_dropdown_value: val });
                                        }
                                      }}
                                      disabled={!isRegistered}
                                    >
                                      <SelectTrigger className="h-6 text-xs w-32">
                                        <SelectValue placeholder={getDropdownName(detail.dropdown_id) || "Status..."}>
                                          {detail.custom_dropdown_value || "Status..."}
                                        </SelectValue>
                                      </SelectTrigger>
                                      <SelectContent>
                                        {dropdownConditions
                                          .filter(dd => (detail.dropdown_ids || []).includes(dd.id))
                                          .map(dd => (
                                            <SelectItem key={dd.id} value={dd.name}>
                                              {dd.name} {dd.is_completed && '(Completed)'}
                                            </SelectItem>
                                          ))}
                                        <SelectItem value="other" className="text-purple-600 font-medium">+ Other...</SelectItem>
                                      </SelectContent>
                                    </Select>

                                    {isRegistered && (
                                      <Button variant="ghost" size="sm" onClick={() => deleteChecklistItem(detail.id)} className="h-6 w-6 p-0 text-red-500">
                                        <Trash2 className="w-3 h-3" />
                                      </Button>
                                    )}
                                  </div>

                                  {/* Inline add task for detail */}
                                  {newItemInput.show && newItemInput.parentId === detail.id && newItemInput.type === 'task' && (
                                    <div className="ml-4 mt-2 flex items-center gap-2 bg-orange-50 p-1.5 rounded">
                                      <Input
                                        value={newItemText}
                                        onChange={(e) => setNewItemText(e.target.value)}
                                        placeholder="New task..."
                                        className="h-5 text-xs flex-1"
                                        autoFocus
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') addNewItem('task', detail.id, displayItem.product_name || productName);
                                          if (e.key === 'Escape') setNewItemInput({ show: false, parentId: null, type: null, productName: null });
                                        }}
                                      />
                                      <Button size="sm" className="h-5 px-2 text-xs" onClick={() => addNewItem('task', detail.id, displayItem.product_name || productName)}>Add</Button>
                                      <Button size="sm" variant="ghost" className="h-5 px-1 text-xs" onClick={() => setNewItemInput({ show: false, parentId: null, type: null, productName: null })}>×</Button>
                                    </div>
                                  )}

                                  {/* Tasks under detail */}
                                  {detail.tasks?.length > 0 && (
                                    <div className="ml-4 mt-1 space-y-0.5 border-l border-orange-200 pl-1.5">
                                      {detail.tasks.map(task => (
                                        <div key={task.id} className="bg-orange-50 p-0.5 rounded group/dtask">
                                          <div className="flex items-center gap-1">
                                            <Checkbox 
                                              checked={!!task.approved_by}
                                              onCheckedChange={(checked) => updateChecklistItem(task.id, { approved_by: checked ? "Done" : "" })}
                                              disabled={!isRegistered}
                                              className="h-2.5 w-2.5"
                                            />
                                            <span className="text-xs px-0.5 py-0.5 rounded bg-orange-100 text-orange-600">T</span>
                                            <span className="text-xs flex-1">{task.text}</span>
                                            <MultiUserSelectInline
                                              users={users}
                                              selectedUsers={task.assigned_to ? (Array.isArray(task.assigned_to) ? task.assigned_to : [task.assigned_to]) : []}
                                              onSelectionChange={(val) => updateChecklistItem(task.id, { assigned_to: val })}
                                              disabled={!isRegistered}
                                              className="h-4 min-w-[70px]"
                                            />
                                            {isRegistered && (
                                              <button
                                                onClick={(e) => { e.stopPropagation(); setNewItemInput({ show: true, parentId: task.id, type: 'subtask', productName: displayItem.product_name || productName }); }}
                                                className="px-0.5 py-0.5 text-xs bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200 opacity-0 group-hover/dtask:opacity-100"
                                                title="Add Subtask"
                                              >
                                                +S
                                              </button>
                                            )}
                                            {isRegistered && (
                                              <Button variant="ghost" size="sm" onClick={() => deleteChecklistItem(task.id)} className="h-3 w-3 p-0 text-red-500 opacity-0 group-hover/dtask:opacity-100">
                                                <Trash2 className="w-2 h-2" />
                                              </Button>
                                            )}
                                          </div>
                                          {/* Subtasks under detail task */}
                                          {checklist.filter(st => st.type === 'subtask' && st.parent_id === task.id).map(subtask => (
                                            <div key={subtask.id} className="ml-3 mt-0.5 flex items-center gap-1 bg-yellow-50 p-0.5 rounded text-xs group/dsub">
                                              <Checkbox 
                                                checked={!!subtask.approved_by}
                                                onCheckedChange={(checked) => updateChecklistItem(subtask.id, { approved_by: checked ? "Done" : "" })}
                                                disabled={!isRegistered}
                                                className="h-2 w-2"
                                              />
                                              <span className="px-0.5 rounded bg-yellow-100 text-yellow-700">S</span>
                                              <span className="flex-1">{subtask.text}</span>
                                              {isRegistered && (
                                                <Button variant="ghost" size="sm" onClick={() => deleteChecklistItem(subtask.id)} className="h-3 w-3 p-0 text-red-500 opacity-0 group-hover/dsub:opacity-100">
                                                  <Trash2 className="w-2 h-2" />
                                                </Button>
                                              )}
                                            </div>
                                          ))}
                                          {/* Inline add subtask for detail task */}
                                          {newItemInput.show && newItemInput.parentId === task.id && newItemInput.type === 'subtask' && (
                                            <div className="ml-3 mt-0.5 flex items-center gap-1 bg-yellow-50 p-0.5 rounded">
                                              <Input
                                                value={newItemText}
                                                onChange={(e) => setNewItemText(e.target.value)}
                                                placeholder="New subtask..."
                                                className="h-4 text-xs flex-1"
                                                autoFocus
                                                onKeyDown={(e) => {
                                                  if (e.key === 'Enter') addNewItem('subtask', task.id, displayItem.product_name || productName);
                                                  if (e.key === 'Escape') setNewItemInput({ show: false, parentId: null, type: null, productName: null });
                                                }}
                                              />
                                              <Button size="sm" className="h-4 px-1 text-xs" onClick={() => addNewItem('subtask', task.id, displayItem.product_name || productName)}>Add</Button>
                                              <Button size="sm" variant="ghost" className="h-4 px-0.5 text-xs" onClick={() => setNewItemInput({ show: false, parentId: null, type: null, productName: null })}>×</Button>
                                            </div>
                                          )}
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

                  {/* Sub-templates with hierarchy */}
                  {Object.entries(group.subTemplates).map(([stName, stItems]) => (
                    <div key={stName} className="ml-4 mt-2 border-l-2 border-blue-300 pl-3">
                      <h4 className="text-sm font-semibold text-blue-700 mb-2">🔗 {stName}</h4>
                      <div className="space-y-2">
                        {stItems.map(rawItem => {
                          const stItem = rawItem.type ? rawItem : { ...rawItem, type: 'checklist' };
                          const stItemTasks = stItems.filter(i => i.type === 'task' && i.parent_id === stItem.id);
                          const stItemDetails = stItems.filter(i => i.type === 'detail' && i.parent_id === stItem.id).map(detail => ({
                            ...detail,
                            tasks: stItems.filter(i => i.type === 'task' && i.parent_id === detail.id)
                          }));
                          if (rawItem.parent_id && (rawItem.type === 'task' || rawItem.type === 'detail' || rawItem.type === 'subtask')) return null;
                          
                          const stDisplayItem = { ...stItem, tasks: stItemTasks, details: stItemDetails };
                          const isStItemCompleted = dropdownConditions.find(dd => dd.name === stDisplayItem.custom_dropdown_value)?.is_completed;
                          return (
                          <div key={stDisplayItem.id} className={`clay-card p-2 ${isStItemCompleted ? 'bg-green-100/70' : 'bg-white'}`}>
                            <div 
                              className="flex items-center gap-2 group"
                              onMouseEnter={() => setHoveredItem(stDisplayItem.id)}
                              onMouseLeave={() => setHoveredItem(null)}
                            >
                              <button 
                                onClick={() => toggleExpanded(stDisplayItem.id)}
                                className="p-1 hover:bg-gray-100 rounded"
                              >
                                {(stDisplayItem.details?.length > 0 || stDisplayItem.tasks?.length > 0) ? (
                                  (expandedItems[stDisplayItem.id] !== false) ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />
                                ) : <div className="w-3" />}
                              </button>
                              <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">Checklist</span>
                              <span className={`text-sm flex-1 ${dropdownConditions.find(dd => dd.name === stDisplayItem.custom_dropdown_value)?.is_completed ? 'line-through text-gray-400' : ''}`}>{stDisplayItem.text}</span>
                              
                              {/* Quick add buttons on hover for sub-templates */}
                              {isRegistered && hoveredItem === stDisplayItem.id && (
                                <div className="flex gap-1">
                                  <button
                                    onClick={(e) => { 
                                      e.stopPropagation(); 
                                      setExpandedItems(prev => ({ ...prev, [stDisplayItem.id]: true }));
                                      setNewItemInput({ show: true, parentId: stDisplayItem.id, type: 'task', productName: stDisplayItem.product_name || productName }); 
                                    }}
                                    className="px-1.5 py-0.5 text-xs bg-orange-100 text-orange-700 rounded hover:bg-orange-200"
                                    title="Add Task"
                                  >
                                    +Task
                                  </button>
                                  <button
                                    onClick={(e) => { 
                                      e.stopPropagation(); 
                                      setExpandedItems(prev => ({ ...prev, [stDisplayItem.id]: true }));
                                      setNewItemInput({ show: true, parentId: stDisplayItem.id, type: 'detail', productName: stDisplayItem.product_name || productName }); 
                                    }}
                                    className="px-1.5 py-0.5 text-xs bg-purple-100 text-purple-700 rounded hover:bg-purple-200"
                                    title="Add Detail"
                                  >
                                    +Detail
                                  </button>
                                </div>
                              )}
                              
                              <Select
                                value={stDisplayItem.approved_by || ""}
                                onValueChange={(val) => updateChecklistItem(stDisplayItem.id, { approved_by: val })}
                                disabled={!isRegistered}
                              >
                                <SelectTrigger className="h-6 text-xs w-28">
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
                                value={stDisplayItem.custom_dropdown_value || "select_value"}
                                onValueChange={(val) => {
                                  if (val === "other") {
                                    setShowOtherPopup({ itemId: stDisplayItem.id });
                                  } else if (val !== "select_value") {
                                    // Require approved_by before allowing any status selection
                                    if (!stDisplayItem.approved_by) {
                                      alert("Please select an approver first before setting the status.");
                                      return;
                                    }
                                    // Allow switching TO continued conditions (bringing back from completed)
                                    const selectedCondition = dropdownConditions.find(dd => dd.name === val);
                                    
                                    // Check if children are complete before allowing completion
                                    if (selectedCondition?.is_completed && !areChildrenComplete(stDisplayItem.id)) {
                                      alert("Please complete all tasks and details under this checklist item first.");
                                      return;
                                    }
                                    updateChecklistItem(stDisplayItem.id, { custom_dropdown_value: val });
                                  }
                                }}
                                disabled={!isRegistered}
                              >
                                <SelectTrigger className="h-6 text-xs w-32">
                                  <SelectValue placeholder={getDropdownName(stDisplayItem.dropdown_id) || "Status..."}>
                                    {stDisplayItem.custom_dropdown_value || "Status..."}
                                  </SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                  {dropdownConditions
                                    .filter(dd => (stDisplayItem.dropdown_ids || []).includes(dd.id))
                                    .map(dd => (
                                      <SelectItem key={dd.id} value={dd.name}>
                                        {dd.name} {dd.is_completed ? '(Completed)' : '(Continued)'}
                                      </SelectItem>
                                    ))}
                                  <SelectItem value="other" className="text-purple-600 font-medium">+ Other...</SelectItem>
                                </SelectContent>
                              </Select>

                              {isRegistered && (
                                <Button variant="ghost" size="sm" onClick={() => deleteChecklistItem(stDisplayItem.id)} className="h-6 w-6 p-0 text-red-500">
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              )}
                            </div>

                            {/* Expanded content for sub-template items - expanded by default */}
                            {(expandedItems[stDisplayItem.id] !== false) && (
                              <div className="ml-6 mt-2 space-y-1 border-l-2 border-gray-200 pl-2">
                                {stDisplayItem.tasks?.map(task => (
                                  <div key={task.id} className="flex items-center gap-2 bg-orange-50 p-1.5 rounded border-l-4 border-orange-400 group/sttask">
                                    <Checkbox 
                                      checked={!!task.approved_by}
                                      onCheckedChange={(checked) => updateChecklistItem(task.id, { approved_by: checked ? "Done" : "" })}
                                      disabled={!isRegistered}
                                      className="h-3 w-3"
                                    />
                                    <span className="text-xs px-1 py-0.5 rounded bg-orange-100 text-orange-700">Task</span>
                                    <span className="text-xs flex-1">{task.text}</span>
                                    <MultiUserSelectInline
                                      users={users}
                                      selectedUsers={task.assigned_to ? (Array.isArray(task.assigned_to) ? task.assigned_to : [task.assigned_to]) : []}
                                      onSelectionChange={(val) => updateChecklistItem(task.id, { assigned_to: val })}
                                      disabled={!isRegistered}
                                    />
                                    {isRegistered && (
                                      <Button variant="ghost" size="sm" onClick={() => deleteChecklistItem(task.id)} className="h-4 w-4 p-0 text-red-500 opacity-0 group-hover/sttask:opacity-100">
                                        <Trash2 className="w-2.5 h-2.5" />
                                      </Button>
                                    )}
                                  </div>
                                ))}
                                
                                {/* Inline add task for sub-template */}
                                {newItemInput.show && newItemInput.parentId === stDisplayItem.id && newItemInput.type === 'task' && (
                                  <div className="flex items-center gap-2 bg-orange-50 p-1.5 rounded border-l-4 border-orange-400">
                                    <Input
                                      value={newItemText}
                                      onChange={(e) => setNewItemText(e.target.value)}
                                      placeholder="New task..."
                                      className="h-5 text-xs flex-1"
                                      autoFocus
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') addNewItem('task', stDisplayItem.id, stDisplayItem.product_name || productName);
                                        if (e.key === 'Escape') setNewItemInput({ show: false, parentId: null, type: null, productName: null });
                                      }}
                                    />
                                    <Button size="sm" className="h-5 px-2 text-xs" onClick={() => addNewItem('task', stDisplayItem.id, stDisplayItem.product_name || productName)}>Add</Button>
                                    <Button size="sm" variant="ghost" className="h-5 px-1 text-xs" onClick={() => setNewItemInput({ show: false, parentId: null, type: null, productName: null })}>×</Button>
                                  </div>
                                )}
                                
                                {stDisplayItem.details?.map(detail => (
                                  <div key={detail.id} className="bg-gray-50 p-1.5 rounded text-xs group/stdetail">
                                    <div className="flex items-center gap-1">
                                      <span className="px-1 py-0.5 rounded bg-purple-100 text-purple-700">Detail</span>
                                      <span className="flex-1">{detail.text}</span>
                                      {isRegistered && (
                                        <button
                                          onClick={(e) => { e.stopPropagation(); setNewItemInput({ show: true, parentId: detail.id, type: 'task', productName: stDisplayItem.product_name || productName }); }}
                                          className="px-1 py-0.5 text-xs bg-orange-100 text-orange-700 rounded hover:bg-orange-200 opacity-0 group-hover/stdetail:opacity-100"
                                          title="Add Task"
                                        >
                                          +Task
                                        </button>
                                      )}
                                      {isRegistered && (
                                        <Button variant="ghost" size="sm" onClick={() => deleteChecklistItem(detail.id)} className="h-4 w-4 p-0 text-red-500 opacity-0 group-hover/stdetail:opacity-100">
                                          <Trash2 className="w-2.5 h-2.5" />
                                        </Button>
                                      )}
                                    </div>
                                    {/* Inline add task for sub-template detail */}
                                    {newItemInput.show && newItemInput.parentId === detail.id && newItemInput.type === 'task' && (
                                      <div className="ml-4 mt-1 flex items-center gap-1 bg-orange-50 p-1 rounded">
                                        <Input
                                          value={newItemText}
                                          onChange={(e) => setNewItemText(e.target.value)}
                                          placeholder="New task..."
                                          className="h-4 text-xs flex-1"
                                          autoFocus
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') addNewItem('task', detail.id, stDisplayItem.product_name || productName);
                                            if (e.key === 'Escape') setNewItemInput({ show: false, parentId: null, type: null, productName: null });
                                          }}
                                        />
                                        <Button size="sm" className="h-4 px-1 text-xs" onClick={() => addNewItem('task', detail.id, stDisplayItem.product_name || productName)}>Add</Button>
                                        <Button size="sm" variant="ghost" className="h-4 px-0.5 text-xs" onClick={() => setNewItemInput({ show: false, parentId: null, type: null, productName: null })}>×</Button>
                                      </div>
                                    )}
                                    {/* Tasks under detail */}
                                    {detail.tasks?.length > 0 && (
                                      <div className="ml-4 mt-1 space-y-0.5">
                                        {detail.tasks.map(task => (
                                          <div key={task.id} className="flex items-center gap-1 bg-orange-50 p-0.5 rounded group/stdtask">
                                            <Checkbox 
                                              checked={!!task.approved_by}
                                              onCheckedChange={(checked) => updateChecklistItem(task.id, { approved_by: checked ? "Done" : "" })}
                                              disabled={!isRegistered}
                                              className="h-2.5 w-2.5"
                                            />
                                            <span className="px-0.5 rounded bg-orange-100 text-orange-600">T</span>
                                            <span className="flex-1">{task.text}</span>
                                            {isRegistered && (
                                              <Button variant="ghost" size="sm" onClick={() => deleteChecklistItem(task.id)} className="h-3 w-3 p-0 text-red-500 opacity-0 group-hover/stdtask:opacity-100">
                                                <Trash2 className="w-2 h-2" />
                                              </Button>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                      )}
                                      </div>
                                      ))}

                                      {/* Inline add detail for sub-template */}
                                {newItemInput.show && newItemInput.parentId === stDisplayItem.id && newItemInput.type === 'detail' && (
                                  <div className="bg-gray-50 p-1.5 rounded border">
                                    <div className="flex items-center gap-1">
                                      <Input
                                        value={newItemText}
                                        onChange={(e) => setNewItemText(e.target.value)}
                                        placeholder="New detail..."
                                        className="h-5 text-xs flex-1"
                                        autoFocus
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') addNewItem('detail', stDisplayItem.id, stDisplayItem.product_name || productName);
                                          if (e.key === 'Escape') setNewItemInput({ show: false, parentId: null, type: null, productName: null });
                                        }}
                                      />
                                      <Button size="sm" className="h-5 px-2 text-xs" onClick={() => addNewItem('detail', stDisplayItem.id, stDisplayItem.product_name || productName)}>Add</Button>
                                      <Button size="sm" variant="ghost" className="h-5 px-1 text-xs" onClick={() => setNewItemInput({ show: false, parentId: null, type: null, productName: null })}>×</Button>
                                    </div>
                                  </div>
                                )}
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
                
                {/* Completed Items Section */}
                {Object.keys(completedChecklist).length > 0 && (
                  <div className="mt-6 pt-4 border-t-4 border-green-300">
                    <h3 className="font-bold text-green-800 mb-3 flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5" />
                      Completed Items ({Object.values(completedChecklist).reduce((sum, g) => sum + g.mainItems.filter(i => !i.parent_id && (i.type === 'checklist' || !i.type)).length + Object.values(g.subTemplates).reduce((s, st) => s + st.filter(i => !i.parent_id && (i.type === 'checklist' || !i.type)).length, 0), 0)})
                    </h3>
                    {Object.entries(completedChecklist)
                      .filter(([productName, group]) => {
                        const hasMainChecklistItems = group.mainItems.some(item => 
                          !item.parent_id && (item.type === 'checklist' || !item.type)
                        );
                        const hasSubTemplateItems = Object.values(group.subTemplates).some(stItems => 
                          stItems.some(item => !item.parent_id && (item.type === 'checklist' || !item.type))
                        );
                        return hasMainChecklistItems || hasSubTemplateItems;
                      })
                      .map(([productName, group]) => (
                        <div 
                          key={productName} 
                          className="border-2 border-green-200 rounded-lg p-3 bg-green-50/20 mb-3"
                        >
                          <h3 className="font-bold text-green-800 flex items-center gap-2 mb-2">
                            📦 {productName}
                          </h3>

                          {/* Main Items */}
                          {group.mainItems.length > 0 && (
                            <div className="space-y-2 mb-3">
                              {group.mainItems.map(rawItem => {
                                if (rawItem.parent_id && (rawItem.type === 'task' || rawItem.type === 'detail' || rawItem.type === 'subtask')) return null;

                                const item = rawItem.type ? rawItem : { ...rawItem, type: 'checklist' };
                                const itemTasks = group.mainItems.filter(i => i.type === 'task' && i.parent_id === item.id);
                                const itemDetails = group.mainItems.filter(i => i.type === 'detail' && i.parent_id === item.id).map(detail => ({
                                  ...detail,
                                  tasks: group.mainItems.filter(i => i.type === 'task' && i.parent_id === detail.id)
                                }));

                                const displayItem = { ...item, tasks: itemTasks, details: itemDetails };

                                return (
                                  <div key={displayItem.id} className="clay-card p-2 bg-green-100/70">
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs px-2 py-0.5 rounded bg-green-200 text-green-700">Checklist</span>
                                      <span className="font-medium text-sm flex-1 line-through text-gray-500">{displayItem.text}</span>

                                      {/* Editable even when completed */}
                                      <Select
                                        value={displayItem.approved_by || ""}
                                        onValueChange={(val) => updateChecklistItem(displayItem.id, { approved_by: val })}
                                        disabled={!isRegistered}
                                      >
                                        <SelectTrigger className="h-6 text-xs w-28">
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
                                        value={displayItem.custom_dropdown_value || "select_value"}
                                        onValueChange={(val) => {
                                          if (val === "other") {
                                            setShowOtherPopup({ itemId: displayItem.id });
                                          } else if (val !== "select_value") {
                                            updateChecklistItem(displayItem.id, { custom_dropdown_value: val });
                                          }
                                        }}
                                        disabled={!isRegistered}
                                      >
                                        <SelectTrigger className="h-6 text-xs w-32">
                                          <SelectValue placeholder="Status...">
                                            {displayItem.custom_dropdown_value || "Status..."}
                                          </SelectValue>
                                        </SelectTrigger>
                                        <SelectContent>
                                          {dropdownConditions
                                            .filter(dd => (displayItem.dropdown_ids || []).includes(dd.id))
                                            .map(dd => (
                                              <SelectItem key={dd.id} value={dd.name}>
                                                {dd.name} {dd.is_completed ? '(Completed)' : '(Continued)'}
                                              </SelectItem>
                                            ))}
                                          <SelectItem value="other" className="text-purple-600 font-medium">+ Other...</SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* Sub-templates */}
                          {Object.entries(group.subTemplates).map(([stName, stItems]) => (
                            <div key={stName} className="ml-4 mt-2 border-l-2 border-green-300 pl-3">
                              <h4 className="text-sm font-semibold text-green-700 mb-2">🔗 {stName}</h4>
                              <div className="space-y-2">
                                {stItems.map(rawItem => {
                                  if (rawItem.parent_id && (rawItem.type === 'task' || rawItem.type === 'detail' || rawItem.type === 'subtask')) return null;

                                  const stItem = rawItem.type ? rawItem : { ...rawItem, type: 'checklist' };

                                  return (
                                    <div key={stItem.id} className="clay-card p-2 bg-green-100/70">
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs px-1.5 py-0.5 rounded bg-green-200 text-green-700">Checklist</span>
                                        <span className="text-sm flex-1 line-through text-gray-500">{stItem.text}</span>

                                        <Select
                                          value={stItem.approved_by || ""}
                                          onValueChange={(val) => updateChecklistItem(stItem.id, { approved_by: val })}
                                          disabled={!isRegistered}
                                        >
                                          <SelectTrigger className="h-6 text-xs w-28">
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
                                          value={stItem.custom_dropdown_value || "select_value"}
                                          onValueChange={(val) => {
                                            if (val === "other") {
                                              setShowOtherPopup({ itemId: stItem.id });
                                            } else if (val !== "select_value") {
                                              updateChecklistItem(stItem.id, { custom_dropdown_value: val });
                                            }
                                          }}
                                          disabled={!isRegistered}
                                        >
                                          <SelectTrigger className="h-6 text-xs w-32">
                                            <SelectValue placeholder="Status...">
                                              {stItem.custom_dropdown_value || "Status..."}
                                            </SelectValue>
                                          </SelectTrigger>
                                          <SelectContent>
                                            {dropdownConditions
                                              .filter(dd => (stItem.dropdown_ids || []).includes(dd.id))
                                              .map(dd => (
                                                <SelectItem key={dd.id} value={dd.name}>
                                                  {dd.name} {dd.is_completed ? '(Completed)' : '(Continued)'}
                                                </SelectItem>
                                              ))}
                                            <SelectItem value="other" className="text-purple-600 font-medium">+ Other...</SelectItem>
                                          </SelectContent>
                                        </Select>
                                      </div>
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
              </>
            )}
          </div>

          {/* Add General Checklist Item */}
          {showAddGeneralChecklist && (
            <div className="p-3 bg-gray-50 rounded-lg border mb-3">
              <div className="flex items-center gap-2">
                <Input
                  value={newGeneralChecklistText}
                  onChange={(e) => setNewGeneralChecklistText(e.target.value)}
                  placeholder="New general checklist item..."
                  className="h-8 text-sm flex-1"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newGeneralChecklistText.trim()) {
                      const timestamp = Date.now();
                      const randomSuffix = Math.random().toString(36).substr(2, 9);
                      const newItem = {
                        id: `General Items_manual_${timestamp}_${randomSuffix}`,
                        text: newGeneralChecklistText.trim(),
                        type: 'checklist',
                        approved_by: "",
                        custom_dropdown_value: "",
                        product_name: "General Items",
                        product_type: "",
                        parent_id: null
                      };
                      setChecklist(prev => [...prev, newItem]);
                      setNewGeneralChecklistText("");
                      setShowAddGeneralChecklist(false);
                    }
                    if (e.key === 'Escape') { setShowAddGeneralChecklist(false); setNewGeneralChecklistText(""); }
                  }}
                />
                <Button 
                  size="sm" 
                  className="h-8 px-3" 
                  onClick={() => {
                    if (newGeneralChecklistText.trim()) {
                      const timestamp = Date.now();
                      const randomSuffix = Math.random().toString(36).substr(2, 9);
                      const newItem = {
                        id: `General Items_manual_${timestamp}_${randomSuffix}`,
                        text: newGeneralChecklistText.trim(),
                        type: 'checklist',
                        approved_by: "",
                        custom_dropdown_value: "",
                        product_name: "General Items",
                        product_type: "",
                        parent_id: null
                      };
                      setChecklist(prev => [...prev, newItem]);
                      setNewGeneralChecklistText("");
                      setShowAddGeneralChecklist(false);
                    }
                  }}
                >
                  Add
                </Button>
                <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => { setShowAddGeneralChecklist(false); setNewGeneralChecklistText(""); }}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t">
            <Button variant="outline" onClick={onClose} className="flex-1 h-10">
              Cancel
            </Button>
            {isRegistered && (
              <Button
                variant="outline"
                onClick={() => setShowAddGeneralChecklist(true)}
                className="flex-1 h-10"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Item
              </Button>
            )}
            {isRegistered && !workOrder.sip_completed && (
              <Button
                onClick={handleCheckOff}
                className="flex-1 h-10 bg-green-600 hover:bg-green-700 text-white"
              >
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Complete
              </Button>
            )}
            <Button 
              onClick={saveChecklist}
              disabled={isSaving || !isRegistered}
              className="flex-1 h-10 bg-blue-600 hover:bg-blue-700"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Template Builder - rendered via portal to escape dialog context */}
      {showTemplateBuilder && ReactDOM.createPortal(
        <TemplateBuilder
          isOpen={showTemplateBuilder}
          onClose={() => {
            setShowTemplateBuilder(false);
          }}
          onApplyTemplate={(templateData) => {
            console.log("Received template data:", templateData.length, "sections");
            handleApplyTemplate(templateData);
            setShowTemplateBuilder(false);
          }}
          existingChecklist={checklist}
          isAdmin={isAdmin}
          workOrderProducts={products}
        />,
        document.body
      )}



      {/* Incomplete Warning */}
      <AlertDialog open={!!incompleteWarning} onOpenChange={() => setIncompleteWarning(null)}>
        <AlertDialogContent className="clay-card border-none">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-orange-500" />
              Incomplete Checklist
            </AlertDialogTitle>
            <AlertDialogDescription>
              This job cannot be checked off because the checklist has incomplete items.
              Please complete all checklist items (approval and status) before marking this job as done.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>OK</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* No Checklist Warning */}
      <AlertDialog open={!!noChecklistWarning} onOpenChange={() => setNoChecklistWarning(null)}>
        <AlertDialogContent className="clay-card border-none">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-yellow-500" />
              No Checklist Created
            </AlertDialogTitle>
            <AlertDialogDescription>
              This job does not have a checklist created yet. Are you sure you want to mark it as complete?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={proceedWithCheckOff} className="bg-green-600 hover:bg-green-700">
              Yes, Mark Complete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Other Dropdown Popup */}
      <OtherDialog open={!!showOtherPopup} onOpenChange={() => setShowOtherPopup(null)}>
        <OtherDialogContent className="max-w-md clay-card border-none">
          <OtherDialogHeader>
            <OtherDialogTitle className="flex items-center gap-2">
              <List className="w-5 h-5 text-purple-500" />
              Select or Create Value
            </OtherDialogTitle>
          </OtherDialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium mb-2 block">All Available Conditions</Label>
              <div className="max-h-48 overflow-y-auto border rounded-lg bg-gray-50">
                {dropdownConditions.length === 0 ? (
                  <div className="p-4 text-center text-gray-500 text-sm">
                    No dropdown conditions created yet.
                  </div>
                ) : (
                  dropdownConditions.map(dd => (
                    <div
                      key={dd.id}
                      onClick={() => {
                        if (showOtherPopup?.itemId) {
                          updateChecklistItem(showOtherPopup.itemId, { custom_dropdown_value: dd.name });
                          setShowOtherPopup(null);
                        }
                      }}
                      className={`p-3 border-b last:border-b-0 hover:bg-purple-50 cursor-pointer flex items-center gap-2 transition-colors ${dd.is_completed ? 'bg-green-50' : 'bg-yellow-50'}`}
                    >
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${dd.is_completed ? 'bg-green-500' : 'bg-yellow-500'}`}>
                        {dd.is_completed ? <CheckCircle2 className="w-4 h-4 text-white" /> : <List className="w-4 h-4 text-white" />}
                      </div>
                      <div className="flex-1">
                        <span className="font-medium">{dd.name}</span>
                        <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${dd.is_completed ? 'bg-green-200 text-green-800' : 'bg-yellow-200 text-yellow-800'}`}>
                          {dd.is_completed ? 'Completed' : 'Continued'}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="border-t pt-4">
              <Label className="text-sm font-medium mb-2 block">Or Enter Custom Value</Label>
              <div className="flex gap-2">
                <Input
                  value={customDropdownValue}
                  onChange={(e) => setCustomDropdownValue(e.target.value)}
                  placeholder="Type custom value..."
                  className="flex-1"
                  onKeyDown={(e) => e.key === 'Enter' && showOtherPopup?.itemId && handleCreateCustomValue(showOtherPopup.itemId)}
                />
                <Button 
                  onClick={() => showOtherPopup?.itemId && handleCreateCustomValue(showOtherPopup.itemId)} 
                  disabled={!customDropdownValue.trim()}
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Use
                </Button>
              </div>
            </div>
          </div>

          <OtherDialogFooter>
            <Button variant="outline" onClick={() => setShowOtherPopup(null)}>
              Cancel
            </Button>
          </OtherDialogFooter>
        </OtherDialogContent>
      </OtherDialog>
    </>
  );
}