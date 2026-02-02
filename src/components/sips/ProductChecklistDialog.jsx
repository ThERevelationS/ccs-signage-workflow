import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Save, Plus, Pencil, AlertCircle, CheckCircle2, Sparkles, Trash2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import TemplateBuilder from "./TemplateBuilder";
import CustomDropdownManager from "./CustomDropdownManager";

const WorkOrder = base44.entities.WorkOrder;
const ChecklistSubItem = base44.entities.ChecklistSubItem;
const AuthorizedEmail = base44.entities.AuthorizedEmail;
const GlobalSettings = base44.entities.GlobalSettings;

// Keyword mappings for auto-suggesting product types
const PRODUCT_TYPE_KEYWORDS = {
  "Channel Letters": ["channel", "letters", "illuminated letters", "led letters", "halo lit", "front lit", "back lit"],
  "Cabinet Sign": ["cabinet", "box sign", "lightbox", "light box", "fluorescent"],
  "Monument": ["monument", "ground sign", "entry sign", "entrance sign", "brick sign"],
  "Pylon": ["pylon", "pole sign", "freestanding", "highway sign", "tall sign"],
  "Wall Sign": ["wall sign", "flat sign", "dimensional", "3d letters", "mounted sign", "facade"],
  "Window Graphics": ["window", "vinyl", "frosted", "perforated", "decal", "cling"],
  "Vehicle Wrap": ["vehicle", "wrap", "car wrap", "truck wrap", "fleet", "van wrap", "trailer"],
  "Awning": ["awning", "canopy", "shade"],
  "Banner": ["banner", "mesh banner", "vinyl banner", "temporary sign"],
  "Digital Sign": ["digital", "led display", "electronic", "message center", "emb"],
  "Wayfinding": ["wayfinding", "directional", "ada", "braille", "interior sign"]
};

// Suggest product types based on text content
const suggestProductTypes = (text, availableTypes) => {
  if (!text) return [];
  const lowerText = text.toLowerCase();
  const suggestions = [];
  
  for (const [productType, keywords] of Object.entries(PRODUCT_TYPE_KEYWORDS)) {
    if (!availableTypes.includes(productType)) continue;
    for (const keyword of keywords) {
      if (lowerText.includes(keyword)) {
        if (!suggestions.includes(productType)) {
          suggestions.push(productType);
        }
        break;
      }
    }
  }
  return suggestions;
};

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
  const [subTemplates, setSubTemplates] = useState([]);
  const [productTypeTemplates, setProductTypeTemplates] = useState({});
  const [subTemplateItems, setSubTemplateItems] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showTemplateBuilder, setShowTemplateBuilder] = useState(false);
  const [showDropdownManager, setShowDropdownManager] = useState(null);
  const [dropdownOptionsCache, setDropdownOptionsCache] = useState({});
  const [incompleteWarning, setIncompleteWarning] = useState(null);
  const [noChecklistWarning, setNoChecklistWarning] = useState(null);
  const [productTypes, setProductTypes] = useState([]);
  const [suggestedTypes, setSuggestedTypes] = useState({});

  useEffect(() => {
    if (isOpen && workOrder) {
      loadData();
    }
  }, [isOpen, workOrder]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [freshWO, usersData, subTemplatesData, settings] = await Promise.all([
        WorkOrder.filter({ id: workOrder.id }),
        AuthorizedEmail.list(),
        ChecklistSubItem.list(),
        GlobalSettings.list()
      ]);

      const currentWO = freshWO[0];
      if (!currentWO) return;

      setUsers(usersData);
      setSubTemplates(subTemplatesData.sort((a, b) => (a.order || 0) - (b.order || 0)));

      // Load product type templates from GlobalSettings
      const ptTemplates = settings.find(s => s.setting_key === 'productTypeTemplates');
      setProductTypeTemplates(ptTemplates?.setting_value || {});
      
      // Load sub-template checklist items from GlobalSettings
      const stItems = settings.find(s => s.setting_key === 'subTemplateItems');
      setSubTemplateItems(stItems?.setting_value || {});

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
      const productTypesSetting = settings.find(s => s.setting_key === 'productTypes');
      const loadedProductTypes = productTypesSetting?.setting_value?.items || 
        ["Channel Letters", "Cabinet Sign", "Monument", "Pylon", "Wall Sign", "Window Graphics", "Vehicle Wrap"];
      setProductTypes(loadedProductTypes);
      
      for (const setting of settings) {
        if (setting.setting_key.startsWith('dropdown_')) {
          const key = setting.setting_key.replace('dropdown_', '');
          cache[key] = setting.setting_value?.items || [];
        }
      }
      setDropdownOptionsCache(cache);
      
      // Auto-suggest product types based on work order content
      const textToAnalyze = `${currentWO.client_name || ''} ${currentWO.title || ''} ${currentWO.description || ''}`;
      const suggestions = suggestProductTypes(textToAnalyze, loadedProductTypes);
      if (suggestions.length > 0) {
        const suggestionMap = {};
        // Suggest for products that don't have a type yet
        (currentWO.products || []).forEach(p => {
          if (!p.product_type && suggestions.length > 0) {
            suggestionMap[p.id] = suggestions;
          }
        });
        setSuggestedTypes(suggestionMap);
      }
    } catch (error) {
      console.error("Error loading data:", error);
    }
    setIsLoading(false);
  };

  const getDropdownOptions = (key) => {
    if (!key) return [];
    return dropdownOptionsCache[key] || [];
  };

  // Handle template application from TemplateBuilder
  const handleApplyTemplate = (templateData) => {
    const newChecklist = [];
    
    templateData.forEach(section => {
      if (section.type === 'product_header') {
        // Add items from product type template
        section.items.forEach(item => {
          newChecklist.push({
            id: `${section.productName}_${item.id}`,
            product_name: section.productName,
            product_type: section.productType,
            text: item.text,
            type: item.type || 'checklist',
            approved_by: "",
            custom_dropdown_key: item.custom_dropdown_key || "",
            custom_dropdown_value: ""
          });
        });
      } else if (section.type === 'sub_template') {
        // Add items from sub-template
        section.items.forEach(item => {
          newChecklist.push({
            id: `${section.parentProduct}_sub_${section.subTemplateName}_${item.id}`,
            product_name: section.parentProduct,
            sub_template_name: section.subTemplateName,
            text: item.text,
            type: item.type || 'checklist',
            approved_by: "",
            custom_dropdown_key: item.custom_dropdown_key || "",
            custom_dropdown_value: ""
          });
        });
      }
    });

    setChecklist(newChecklist);
  };

  const updateChecklistItem = (itemId, updates) => {
    setChecklist(checklist.map(item => 
      item.id === itemId ? { ...item, ...updates } : item
    ));
  };

  const deleteChecklistItem = (itemId) => {
    setChecklist(checklist.filter(item => item.id !== itemId));
  };

  const checkIfComplete = () => {
    if (!checklist || checklist.length === 0) {
      return { complete: false, hasChecklist: false };
    }
    
    // Check if all checklist items (not tasks) have both approved_by and custom_dropdown_value
    const checklistItems = checklist.filter(item => item.type !== 'task');
    const allApproved = checklistItems.every(item => 
      item.approved_by && item.custom_dropdown_value
    );

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

  // Group checklist items by product_name and sub_template
  const getGroupedChecklist = () => {
    const groups = {};
    
    checklist.forEach(item => {
      const productName = item.product_name || 'Ungrouped';
      if (!groups[productName]) {
        groups[productName] = {
          productType: item.product_type,
          mainItems: [],
          subTemplates: {}
        };
      }
      
      if (item.sub_template_name) {
        if (!groups[productName].subTemplates[item.sub_template_name]) {
          groups[productName].subTemplates[item.sub_template_name] = [];
        }
        groups[productName].subTemplates[item.sub_template_name].push(item);
      } else {
        groups[productName].mainItems.push(item);
      }
    });
    
    return groups;
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

  return (
    <>
      <Dialog open={isOpen && !showTemplateBuilder && !showDropdownManager} onOpenChange={onClose}>
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
                  <div className="flex items-center gap-1">
                    <Select
                      value={product.product_type || ""}
                      onValueChange={(val) => {
                        const updated = [...products];
                        updated[index].product_type = val;
                        setProducts(updated);
                        // Clear suggestion when manually selected
                        if (suggestedTypes[product.id]) {
                          const newSuggestions = { ...suggestedTypes };
                          delete newSuggestions[product.id];
                          setSuggestedTypes(newSuggestions);
                        }
                      }}
                      disabled={!isRegistered}
                    >
                      <SelectTrigger className="w-44 h-8 text-sm">
                        <SelectValue placeholder="Product type..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={null}>None</SelectItem>
                        {productTypes.map(type => (
                          <SelectItem key={type} value={type}>{type}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {/* Auto-suggestion indicator */}
                    {suggestedTypes[product.id]?.length > 0 && !product.product_type && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const updated = [...products];
                          updated[index].product_type = suggestedTypes[product.id][0];
                          setProducts(updated);
                          const newSuggestions = { ...suggestedTypes };
                          delete newSuggestions[product.id];
                          setSuggestedTypes(newSuggestions);
                        }}
                        className="h-8 px-2 text-xs bg-yellow-50 hover:bg-yellow-100 text-yellow-700 border border-yellow-200"
                        title={`Suggested: ${suggestedTypes[product.id].join(', ')}`}
                      >
                        <Sparkles className="w-3 h-3 mr-1" />
                        {suggestedTypes[product.id][0]}
                      </Button>
                    )}
                    {isRegistered && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setProducts(products.filter((_, i) => i !== index))}
                        className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
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
                <p className="text-sm mt-1">Use Template Builder to create and apply templates</p>
              </div>
            ) : (
              Object.entries(groupedChecklist).map(([productName, group]) => (
                <div key={productName} className="border-2 border-purple-200 rounded-lg p-3 bg-purple-50/20">
                  <h3 className="font-bold text-purple-800 mb-3 flex items-center gap-2">
                    📦 {productName}
                    {group.productType && (
                      <span className="text-xs font-normal bg-purple-200 px-2 py-0.5 rounded">
                        {group.productType}
                      </span>
                    )}
                  </h3>

                  {/* Main Items */}
                  {group.mainItems.length > 0 && (
                    <div className="space-y-2 mb-3">
                      {group.mainItems.map(item => (
                        <div key={item.id} className={`clay-card p-3 bg-white ${item.type === 'task' ? 'border-l-4 border-l-orange-400' : ''}`}>
                          <div className="grid grid-cols-3 gap-2 items-center">
                            <div className="flex items-center gap-2">
                              <span className={`text-xs px-2 py-0.5 rounded ${item.type === 'task' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                                {item.type === 'task' ? 'Task' : 'Checklist'}
                              </span>
                              <span className="font-medium text-sm">{item.text}</span>
                            </div>
                            
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
                                  <SelectValue placeholder={item.custom_dropdown_key || "Status..."} />
                                </SelectTrigger>
                                <SelectContent>
                                  {getDropdownOptions(item.custom_dropdown_key).map(opt => (
                                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {isAdmin && item.custom_dropdown_key && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setShowDropdownManager(item.custom_dropdown_key)}
                                  className="h-8 w-8 p-0"
                                  title="Edit dropdown options"
                                >
                                  <Pencil className="w-3 h-3" />
                                </Button>
                              )}
                              {isRegistered && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => deleteChecklistItem(item.id)}
                                  className="h-8 w-8 p-0 text-red-500"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Sub-templates */}
                  {Object.entries(group.subTemplates).map(([stName, stItems]) => (
                    <div key={stName} className="ml-4 mt-2 border-l-2 border-blue-300 pl-3">
                      <h4 className="text-sm font-semibold text-blue-700 mb-2">🔗 {stName}</h4>
                      <div className="space-y-2">
                        {stItems.map(item => (
                          <div key={item.id} className={`clay-card p-2 bg-white ${item.type === 'task' ? 'border-l-4 border-l-orange-400' : ''}`}>
                            <div className="grid grid-cols-3 gap-2 items-center">
                              <div className="flex items-center gap-2">
                                <span className={`text-xs px-1.5 py-0.5 rounded ${item.type === 'task' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                                  {item.type === 'task' ? 'Task' : 'Checklist'}
                                </span>
                                <span className="text-sm">{item.text}</span>
                              </div>
                              
                              <Select
                                value={item.approved_by || ""}
                                onValueChange={(val) => updateChecklistItem(item.id, { approved_by: val })}
                                disabled={!isRegistered}
                              >
                                <SelectTrigger className="h-7 text-xs">
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

                              <div className="flex gap-1">
                                <Select
                                  value={item.custom_dropdown_value || ""}
                                  onValueChange={(val) => updateChecklistItem(item.id, { custom_dropdown_value: val })}
                                  disabled={!isRegistered}
                                >
                                  <SelectTrigger className="h-7 text-xs flex-1">
                                    <SelectValue placeholder={item.custom_dropdown_key || "Status..."} />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {getDropdownOptions(item.custom_dropdown_key).map(opt => (
                                      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                {isRegistered && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => deleteChecklistItem(item.id)}
                                    className="h-7 w-7 p-0 text-red-500"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ))
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

      {/* Template Builder - rendered via portal to escape dialog context */}
      {showTemplateBuilder && ReactDOM.createPortal(
        <TemplateBuilder
          isOpen={showTemplateBuilder}
          onClose={() => {
            setShowTemplateBuilder(false);
            loadData();
          }}
          onApplyTemplate={handleApplyTemplate}
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
    </>
  );
}