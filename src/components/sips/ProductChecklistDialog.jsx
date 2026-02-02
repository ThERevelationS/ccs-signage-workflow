import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Save, Plus, Pencil, AlertCircle, CheckCircle2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import TemplateBuilder from "./TemplateBuilder";
import CustomDropdownManager from "./CustomDropdownManager";

const WorkOrder = base44.entities.WorkOrder;
const ChecklistTemplate = base44.entities.ChecklistTemplate;
const ChecklistSubItem = base44.entities.ChecklistSubItem;
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
  const [templates, setTemplates] = useState([]);
  const [subItemsPool, setSubItemsPool] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showTemplateBuilder, setShowTemplateBuilder] = useState(false);
  const [showApplyTemplates, setShowApplyTemplates] = useState(false);
  const [selectedTemplates, setSelectedTemplates] = useState({});
  const [showDropdownManager, setShowDropdownManager] = useState(null);
  const [dropdownOptionsCache, setDropdownOptionsCache] = useState({});
  const [incompleteWarning, setIncompleteWarning] = useState(null);
  const [noChecklistWarning, setNoChecklistWarning] = useState(null);

  useEffect(() => {
    if (isOpen && workOrder) {
      loadData();
    }
  }, [isOpen, workOrder]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [freshWO, usersData, templatesData, subItemsData, settings] = await Promise.all([
        WorkOrder.filter({ id: workOrder.id }),
        AuthorizedEmail.list(),
        ChecklistTemplate.list(),
        ChecklistSubItem.list(),
        GlobalSettings.list()
      ]);

      const currentWO = freshWO[0];
      if (!currentWO) return;

      setUsers(usersData);
      setTemplates(templatesData);
      setSubItemsPool(subItemsData);

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

      setChecklist(currentWO.sip_checklist || []);

      // Load custom dropdown options
      const cache = {};
      for (const setting of settings) {
        if (setting.setting_key.startsWith('dropdown_')) {
          const key = setting.setting_key.replace('dropdown_', '');
          cache[key] = setting.setting_value?.items || [];
        }
      }
      setDropdownOptionsCache(cache);
    } catch (error) {
      console.error("Error loading data:", error);
    }
    setIsLoading(false);
  };

  const getDropdownOptions = (key) => {
    if (!key) return [];
    return dropdownOptionsCache[key] || [];
  };

  const handleApplyTemplates = () => {
    const newChecklist = [];
    
    products.forEach(product => {
      const templateId = selectedTemplates[product.id];
      if (!templateId) return;
      
      const template = templates.find(t => t.id === templateId);
      if (!template) return;

      template.items.forEach(templateItem => {
        newChecklist.push({
          id: `${product.id}_${templateItem.id}`,
          product_id: product.id,
          text: templateItem.text,
          approved_by: "",
          custom_dropdown_value: "",
          sub_items: (templateItem.sub_items || []).map(si => ({
            id: si.id,
            text: si.text,
            checked: false
          }))
        });
      });
    });

    setChecklist(newChecklist);
    setShowApplyTemplates(false);
    setSelectedTemplates({});
  };

  const updateChecklistItem = (itemId, updates) => {
    setChecklist(checklist.map(item => 
      item.id === itemId ? { ...item, ...updates } : item
    ));
  };

  const toggleSubItem = (itemId, subItemId) => {
    setChecklist(checklist.map(item => {
      if (item.id === itemId) {
        return {
          ...item,
          sub_items: (item.sub_items || []).map(si =>
            si.id === subItemId ? { ...si, checked: !si.checked } : si
          )
        };
      }
      return item;
    }));
  };

  const checkIfComplete = () => {
    if (!checklist || checklist.length === 0) {
      return { complete: false, hasChecklist: false };
    }
    
    // Check if all main items have both approved_by and custom_dropdown_value
    const allApproved = checklist.every(item => 
      item.approved_by && item.custom_dropdown_value
    );
    
    // Check if all sub-items are checked
    const allSubItemsChecked = checklist.every(item => {
      if (!item.sub_items || item.sub_items.length === 0) return true;
      return item.sub_items.every(si => si.checked);
    });

    return { 
      complete: allApproved && allSubItemsChecked, 
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
      await WorkOrder.update(workOrder.id, { 
        sip_checklist: checklist,
        products: products
      });
      if (onUpdate) onUpdate();
      onClose();
    } catch (error) {
      console.error("Error saving checklist:", error);
    }
    setIsSaving(false);
  };

  const getProductName = (productId) => {
    const product = products.find(p => p.id === productId);
    return product ? `${product.description} ${product.product_type ? `(${product.product_type})` : ''}` : '';
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

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="clay-card border-none max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
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
                    Template Builder
                  </Button>
                )}
                {products.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowApplyTemplates(true)}
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Apply Templates
                  </Button>
                )}
              </div>
            </div>
          </DialogHeader>

          {/* Products Management */}
          <div className="clay-card p-3 bg-blue-50/50">
            <h3 className="font-bold text-sm mb-2">Products on this Job</h3>
            <div className="space-y-2">
              {products.map((product, index) => (
                <div key={product.id} className="flex gap-2 items-center">
                  <span className="text-sm font-medium w-6">{index + 1}.</span>
                  <Input
                    value={product.description}
                    onChange={(e) => {
                      const updated = [...products];
                      updated[index].description = e.target.value;
                      setProducts(updated);
                    }}
                    placeholder="Product description..."
                    className="flex-1 h-8 text-sm"
                    disabled={!isRegistered}
                  />
                  {isAdmin && (
                    <Select
                      value={product.product_type || ""}
                      onValueChange={(val) => {
                        const updated = [...products];
                        updated[index].product_type = val;
                        setProducts(updated);
                      }}
                    >
                      <SelectTrigger className="w-48 h-8 text-sm">
                        <SelectValue placeholder="Product type..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={null}>None</SelectItem>
                        {/* Load from global settings */}
                        {["Channel Letters", "Cabinet Sign", "Monument", "Pylon", "Wall Sign", "Window Graphics", "Vehicle Wrap"].map(type => (
                          <SelectItem key={type} value={type}>{type}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              ))}
              {isRegistered && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setProducts([...products, { 
                    id: `prod_${Date.now()}`, 
                    description: "", 
                    product_type: "" 
                  }])}
                  className="h-7 text-xs"
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Add Product
                </Button>
              )}
            </div>
          </div>

          {/* Checklist Items */}
          <div className="flex-1 overflow-y-auto space-y-3">
            {checklist.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>No checklist items yet</p>
                <p className="text-sm mt-1">Apply templates to get started</p>
              </div>
            ) : (
              products.map(product => {
                const productItems = checklist.filter(item => item.product_id === product.id);
                if (productItems.length === 0) return null;

                return (
                  <div key={product.id} className="border-2 border-purple-200 rounded-lg p-3 bg-purple-50/20">
                    <h3 className="font-bold text-purple-800 mb-3 flex items-center gap-2">
                      📦 {product.description}
                      {product.product_type && (
                        <span className="text-xs font-normal bg-purple-200 px-2 py-0.5 rounded">
                          {product.product_type}
                        </span>
                      )}
                    </h3>

                    <div className="space-y-2">
                      {productItems.map(item => {
                        const template = templates.find(t => t.items?.find(ti => ti.id === item.id.split('_')[1]));
                        const templateItem = template?.items?.find(ti => ti.id === item.id.split('_')[1]);
                        const dropdownOptions = getDropdownOptions(templateItem?.custom_dropdown_key || '');

                        return (
                          <div key={item.id} className="clay-card p-3 bg-white">
                            <div className="grid grid-cols-3 gap-2 items-center mb-2">
                              <div className="font-medium text-sm">{item.text}</div>
                              
                              {/* Approved By */}
                              <Select
                                value={item.approved_by || ""}
                                onValueChange={(val) => updateChecklistItem(item.id, { approved_by: val })}
                                disabled={!isRegistered}
                              >
                                <SelectTrigger className="h-8 text-xs">
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

                              {/* Custom Dropdown */}
                              <div className="flex gap-1">
                                <Select
                                  value={item.custom_dropdown_value || ""}
                                  onValueChange={(val) => updateChecklistItem(item.id, { custom_dropdown_value: val })}
                                  disabled={!isRegistered}
                                >
                                  <SelectTrigger className="h-8 text-xs flex-1">
                                    <SelectValue placeholder={templateItem?.custom_dropdown_key || "Status..."} />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {dropdownOptions.map(opt => (
                                      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                {isAdmin && templateItem?.custom_dropdown_key && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setShowDropdownManager(templateItem.custom_dropdown_key)}
                                    className="h-8 w-8 p-0"
                                    title="Edit dropdown options"
                                  >
                                    <Pencil className="w-3 h-3" />
                                  </Button>
                                )}
                              </div>
                            </div>

                            {/* Sub-items */}
                            {item.sub_items && item.sub_items.length > 0 && (
                              <div className="ml-4 mt-2 space-y-1">
                                {item.sub_items.map(subItem => (
                                  <label key={subItem.id} className="flex items-center gap-2 text-sm cursor-pointer">
                                    <Checkbox
                                      checked={subItem.checked || false}
                                      onCheckedChange={() => toggleSubItem(item.id, subItem.id)}
                                      disabled={!isRegistered}
                                      className="h-4 w-4"
                                    />
                                    <span className={subItem.checked ? 'line-through text-gray-500' : ''}>
                                      {subItem.text}
                                    </span>
                                  </label>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t">
            <Button variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            {isRegistered && !workOrder.sip_completed && (
              <Button
                onClick={handleCheckOff}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Mark Job Complete
              </Button>
            )}
            <Button 
              onClick={saveChecklist}
              disabled={isSaving || !isRegistered}
              className="flex-1 bg-blue-600 hover:bg-blue-700"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              Save Checklist
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Apply Templates Dialog */}
      <Dialog open={showApplyTemplates} onOpenChange={setShowApplyTemplates}>
        <DialogContent className="clay-card border-none max-w-2xl">
          <DialogHeader>
            <DialogTitle>Apply Templates to Products</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-3 mt-4">
            {products.map(product => (
              <div key={product.id} className="clay-card p-3">
                <div className="font-medium mb-2">
                  {product.description} 
                  {product.product_type && <span className="text-xs text-gray-500 ml-2">({product.product_type})</span>}
                </div>
                <Select
                  value={selectedTemplates[product.id] || ""}
                  onValueChange={(val) => setSelectedTemplates({ ...selectedTemplates, [product.id]: val })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select template..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={null}>None</SelectItem>
                    {templates.filter(t => !t.product_type || t.product_type === product.product_type).map(template => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.name} ({template.items?.length || 0} items)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>

          <div className="flex gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => setShowApplyTemplates(false)} className="flex-1">
              Cancel
            </Button>
            <Button onClick={handleApplyTemplates} className="flex-1 bg-blue-600 hover:bg-blue-700">
              Apply Templates
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
            loadData();
          }}
        />,
        document.body
      )}

      {/* Dropdown Manager - rendered via portal to escape dialog context */}
      {showDropdownManager && ReactDOM.createPortal(
        <CustomDropdownManager
          isOpen={true}
          onClose={() => {
            setShowDropdownManager(null);
            loadData();
          }}
          dropdownKey={showDropdownManager}
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
              This job cannot be checked off because the checklist has incomplete items:
              <ul className="mt-2 space-y-1 text-sm">
                {checklist.filter(item => !item.approved_by || !item.custom_dropdown_value).length > 0 && (
                  <li>• {checklist.filter(item => !item.approved_by || !item.custom_dropdown_value).length} items missing approval/status</li>
                )}
                {checklist.filter(item => (item.sub_items || []).some(si => !si.checked)).length > 0 && (
                  <li>• {checklist.filter(item => (item.sub_items || []).some(si => !si.checked)).length} items with unchecked sub-items</li>
                )}
              </ul>
              <p className="mt-2 font-medium">Please complete all checklist items before marking this job as done.</p>
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
    </>
  );
}