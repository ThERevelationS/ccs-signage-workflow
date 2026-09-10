import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { base44 } from "@/api/base44Client";
import { UploadFile, ExtractDataFromUploadedFile } from "@/integrations/Core";
import { Upload, X, Plus, Check, Trash2, Eye, EyeOff, Circle, CheckCircle2, FileSearch, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { useAuth } from "@/components/auth/EmailGate";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";
import { loadSingleGlobalSetting } from "@/components/shared/globalSettingsPersistence";

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

const AuthorizedEmail = base44.entities.AuthorizedEmail;

export default function WorkOrderForm({ 
  isOpen, 
  onClose, 
  onSave, 
  workOrder = null,
  isRider = false,
  parentWorkOrder = null,
  lockedStage = null,
  initialData = null, // For duplicating - prefill form with this data
  existingWorkOrders = [], // For duplicate detection
  key // Force re-render when duplicating
}) {
  const { currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [authorizedUsers, setAuthorizedUsers] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [customName, setCustomName] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [showCompletedNotes, setShowCompletedNotes] = useState(false);
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [newNoteText, setNewNoteText] = useState("");
  const [addingSubTaskFor, setAddingSubTaskFor] = useState(null);
  const [newSubTaskText, setNewSubTaskText] = useState("");
  const [isAddingFollowUp, setIsAddingFollowUp] = useState(false);
  const [newFollowUpText, setNewFollowUpText] = useState("");
  const [showCompletedFollowUp, setShowCompletedFollowUp] = useState(false);
  const [scanningForm, setScanningForm] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState(null);
  const [productTypes, setProductTypes] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  
  const todayDate = format(new Date(), "yyyy-MM-dd");
  
  // Initialize form data - if initialData is provided, use it for prefilling
  const getInitialFormData = () => {
    const defaultData = {
      // Basic work order fields
      title: "",
      client_name: "",
      description: "",
      image_url: "",
      current_stage: "estimating",
      assigned_to: "",
      notes: [],
      due_date: "",
      start_date: todayDate,
      is_rider: isRider,
      parent_work_order_id: parentWorkOrder?.id || null,
      rider_stage: null,
      
      // Customer Information fields from PDF
      designer: "",
      surveyor: "",
      site_survey_date: "",
      site_survey_time: "",
      site_survey_am_pm: "",
      representative: "",
      contact_phone: "",
      contact_email: "",
      install_location: "",
      address_line_2: "",
      billing_address: "",
      billing_address_line_2: "",
      additional_contact: "",
      
      // Permitting
      permitting: "",
      township_city: "",
      county: "",
      permit_code: "",
      permit_class: "",
      property_owner: "",
      pud: "",
      parcel_number: "",
      electrical_ibi: false,
      electrical_nkyei: false,
      electrical_nec: false,
      electrical_city: false,
      electrical_county: false,
      
      // Customer type
      customer_is_building_owner: false,
      customer_is_tenant: false,
      customer_is_marketing_co: false,
      business_co_coo_reminder: false,
      business_co_coo_date: "",
      
      // Service details
      install_yes: false,
      install_no: false,
      budget_less_than: "",
      removal_yes: false,
      removal_no: false,
      service_repair: "",
      origination: "",
      patch: "",
      paint: "",
      color: "",
      
      // Products - new structure
      products: [],
      // Legacy products (kept for backward compatibility)
      product_1: "",
      product_2: "",
      product_3: "",
      product_4: "",
      product_5: "",
      product_6: "",
      cb_complete: false,
      cf_complete: false,
      cc_complete: false,
      sms_complete: false,
      
      // Follow up
      follow_up: [],

      // Sales rep
      sales_rep: ""
    };
    
    // If initialData provided (for duplicating), merge it
    if (initialData) {
      const { id, created_date, updated_date, created_by, ...dataWithoutId } = initialData;
      let notes = dataWithoutId.notes || [];
      if (typeof notes === 'string' && notes.trim()) {
        notes = [{
          text: notes,
          timestamp: new Date().toISOString(),
          created_by: "Duplicated"
        }];
      }
      return {
        ...defaultData,
        ...dataWithoutId,
        notes: notes,
        follow_up: dataWithoutId.follow_up || [],
        start_date: todayDate
      };
    }
    
    return defaultData;
  };
  
  const [formData, setFormData] = useState(getInitialFormData());

  useEffect(() => {
    if (!isOpen) return;
    setIsSubmitting(false);
    setSubmitError("");
  }, [isOpen, workOrder?.id, initialData]);
  
  // Reset form when dialog opens with new initialData (for duplicating)
  useEffect(() => {
    if (isOpen && initialData && !workOrder) {
      const { id, created_date, updated_date, created_by, ...dataWithoutId } = initialData;
      let notes = dataWithoutId.notes || [];
      if (typeof notes === 'string' && notes.trim()) {
        notes = [{
          text: notes,
          timestamp: new Date().toISOString(),
          created_by: "Duplicated"
        }];
      }
      setFormData({
        ...getInitialFormData(),
        ...dataWithoutId,
        notes: notes,
        follow_up: dataWithoutId.follow_up || [],
        start_date: todayDate
      });
      
      if (dataWithoutId.assigned_to && !TEAM_MEMBERS.includes(dataWithoutId.assigned_to)) {
        setShowCustomInput(true);
        setCustomName(dataWithoutId.assigned_to);
      }
    }
  }, [isOpen, initialData]);

  useEffect(() => {
    loadUsers();
    loadAuthorizedUsers();
    loadProductTypes();
    
    // Handle custom name for initialData (duplicating)
    if (initialData && initialData.assigned_to && !TEAM_MEMBERS.includes(initialData.assigned_to)) {
      setShowCustomInput(true);
      setCustomName(initialData.assigned_to);
    }
    
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
        ...formData,
        ...workOrder,
        notes: notes,
        follow_up: workOrder.follow_up || [],
        is_rider: workOrder.is_rider || isRider,
        parent_work_order_id: workOrder.parent_work_order_id || parentWorkOrder?.id || null,
        rider_stage: workOrder.rider_stage || null
      });
      
      if (workOrder.assigned_to && !TEAM_MEMBERS.includes(workOrder.assigned_to)) {
        setShowCustomInput(true);
        setCustomName(workOrder.assigned_to);
      }
    } else if (isRider && parentWorkOrder) {
      setFormData({
        ...formData,
        title: parentWorkOrder.title,
        client_name: parentWorkOrder.client_name,
        description: parentWorkOrder.description,
        image_url: parentWorkOrder.image_url,
        current_stage: lockedStage || "permitting",
        assigned_to: "",
        notes: [],
        follow_up: [],
        due_date: "",
        start_date: todayDate,
        is_rider: true,
        parent_work_order_id: parentWorkOrder.id,
        rider_stage: lockedStage || "permitting"
      });
    }
  }, [workOrder, isRider, parentWorkOrder, lockedStage, initialData]);

  const loadUsers = async () => {
    try {
      const usersList = await loadAllEntityRows({
        entity: base44.entities.User,
        sort: null,
        label: "Work Order form app users",
      });
      setUsers(usersList);
    } catch (e) {
      console.error("Error loading users:", e);
    }
  };

  const loadProductTypes = async () => {
    try {
      const setting = await loadSingleGlobalSetting({
        entity: base44.entities.GlobalSettings,
        settingKey: "productTypes",
        label: "Work Order product types",
      });
      if (setting?.id) {
        setProductTypes(setting.setting_value?.items || []);
      } else {
        setProductTypes(["Channel Letters", "Cabinet Sign", "Monument", "Pylon", "Wall Sign", "Window Graphics", "Vehicle Wrap"]);
      }
    } catch (error) {
      console.error("Error loading product types:", error);
    }
  };

  const loadAuthorizedUsers = async () => {
    try {
      const authUsers = await loadAllEntityRows({
        entity: AuthorizedEmail,
        sort: null,
        label: "Work Order form authorized users",
      });
      setAuthorizedUsers(authUsers);
    } catch (e) {
      console.error("Error loading authorized users:", e);
    }
  };

  // Get salespersons from authorized users with sales roles
  const salespersons = authorizedUsers.filter(u => 
    u.sales_roles?.includes("Sales Rep") || u.sales_roles?.includes("Salesperson")
  );

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleCheckboxChange = (field) => {
    setFormData(prev => ({ ...prev, [field]: !prev[field] }));
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

  // Notes functions
  const handleAddNote = () => {
    if (!newNoteText.trim()) return;
    const newNote = {
      text: newNoteText,
      timestamp: new Date().toISOString(),
      created_by: currentUser?.email || "Unknown",
      completed: false,
      sub_tasks: []
    };
    setFormData(prev => ({
      ...prev,
      notes: [...(prev.notes || []), newNote]
    }));
    setNewNoteText("");
    setIsAddingNote(false);
  };

  const handleToggleNote = (index) => {
    const updatedNotes = [...formData.notes];
    updatedNotes[index] = {
      ...updatedNotes[index],
      completed: !updatedNotes[index].completed
    };
    setFormData(prev => ({ ...prev, notes: updatedNotes }));
  };

  const handleDeleteNote = (index) => {
    setFormData(prev => ({
      ...prev,
      notes: prev.notes.filter((_, i) => i !== index)
    }));
  };

  const handleAddSubTask = (noteIndex) => {
    if (!newSubTaskText.trim()) return;
    const updatedNotes = formData.notes.map((note, idx) => {
      if (idx === noteIndex) {
        return {
          ...note,
          sub_tasks: [...(note.sub_tasks || []), { text: newSubTaskText, completed: false }]
        };
      }
      return note;
    });
    setFormData(prev => ({ ...prev, notes: updatedNotes }));
    setNewSubTaskText("");
    setAddingSubTaskFor(null);
  };

  const handleToggleSubTask = (noteIndex, subTaskIndex) => {
    const updatedNotes = formData.notes.map((note, idx) => {
      if (idx === noteIndex) {
        const updatedSubTasks = (note.sub_tasks || []).map((st, stIdx) => {
          if (stIdx === subTaskIndex) {
            return { ...st, completed: !st.completed };
          }
          return st;
        });
        return { ...note, sub_tasks: updatedSubTasks };
      }
      return note;
    });
    setFormData(prev => ({ ...prev, notes: updatedNotes }));
  };

  const handleDeleteSubTask = (noteIndex, subTaskIndex) => {
    const updatedNotes = formData.notes.map((note, idx) => {
      if (idx === noteIndex) {
        return {
          ...note,
          sub_tasks: (note.sub_tasks || []).filter((_, stIdx) => stIdx !== subTaskIndex)
        };
      }
      return note;
    });
    setFormData(prev => ({ ...prev, notes: updatedNotes }));
  };

  // Follow Up functions
  const handleAddFollowUp = () => {
    if (!newFollowUpText.trim()) return;
    const newItem = {
      text: newFollowUpText,
      timestamp: new Date().toISOString(),
      created_by: currentUser?.email || "Unknown",
      completed: false
    };
    setFormData(prev => ({
      ...prev,
      follow_up: [...(prev.follow_up || []), newItem]
    }));
    setNewFollowUpText("");
    setIsAddingFollowUp(false);
  };

  const handleToggleFollowUp = (index) => {
    const updated = [...formData.follow_up];
    updated[index] = {
      ...updated[index],
      completed: !updated[index].completed
    };
    setFormData(prev => ({ ...prev, follow_up: updated }));
  };

  const handleDeleteFollowUp = (index) => {
    setFormData(prev => ({
      ...prev,
      follow_up: prev.follow_up.filter((_, i) => i !== index)
    }));
  };

  // AI Form Scanner - Enhanced with more detailed extraction
  const handleScanForm = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setScanningForm(true);
    try {
      // Upload the file first
      const uploadResult = await UploadFile({ file });
      
      // Extract data using AI with more detailed schema and descriptions
      const extractResult = await ExtractDataFromUploadedFile({
        file_url: uploadResult.file_url,
        json_schema: {
          type: "object",
          description: "Extract ALL information from this sign shop customer intake form. Look carefully at every field, checkbox, handwritten text, and section. This is a business form for sign manufacturing/installation projects. Extract data even if partially legible.",
          properties: {
            designer: { type: "string", description: "Designer name - look for field labeled 'Designer' or similar, often at top of form. May be handwritten." },
            surveyor: { type: "string", description: "Surveyor name - look for field labeled 'Surveyor' or 'Site Surveyor', often near designer field." },
            initial_contact_date: { type: "string", description: "Date of initial contact or estimate request. Format as YYYY-MM-DD. Look for 'Date', 'Initial Contact', or date stamps." },
            site_survey_date: { type: "string", description: "Site survey scheduled date. Format as YYYY-MM-DD. Look for 'Site Survey Date' or 'Survey'." },
            site_survey_time: { type: "string", description: "Site survey time - look for time field near survey date. Format as HH:MM." },
            site_survey_am_pm: { type: "string", enum: ["AM", "PM"], description: "AM or PM for site survey time - look for circled or checked AM/PM." },
            customer_name: { type: "string", description: "Customer or company name - PRIMARY FIELD. Look for 'Customer', 'Client', 'Company Name', 'Business Name'. This is usually prominently displayed." },
            representative: { type: "string", description: "Customer representative or contact person name - look for 'Rep', 'Contact', 'Representative', 'Attention'." },
            address: { type: "string", description: "Installation or site address - look for 'Address', 'Location', 'Site Address', 'Install Location'. Include street, city, state, zip if visible." },
            address_line_2: { type: "string", description: "Second line of address - suite number, unit, floor, etc." },
            contact_phone: { type: "string", description: "Phone number - look for 'Phone', 'Tel', 'Contact #'. Include area code." },
            email: { type: "string", description: "Email address - look for 'Email', '@' symbol in text." },
            billing_address: { type: "string", description: "Billing address if different from site address - look for 'Billing', 'Bill To', 'Invoice Address'." },
            billing_address_line_2: { type: "string", description: "Second line of billing address." },
            additional_contact: { type: "string", description: "Additional contact person - look for 'Add'l Contact', 'Secondary Contact', 'Also Contact'." },
            permitting: { type: "string", enum: ["yes", "no", "maybe", "na"], description: "Permitting required - look for 'Permitting' section with Yes/No/Maybe checkboxes. Return which is checked." },
            township_city: { type: "string", description: "Township or City for permitting - look for 'Twp', 'Township', 'City' near permitting section." },
            county: { type: "string", description: "County name - look for 'County', 'Cty' field." },
            permit_code: { type: "string", description: "Permit code - look for 'Code' field in permitting section." },
            permit_class: { type: "string", description: "Permit class - look for 'Class' field in permitting section." },
            property_owner: { type: "string", description: "Property owner name - look for 'Owner', 'Property Owner', 'Building Owner'." },
            pud: { type: "string", description: "PUD (Planned Unit Development) information." },
            parcel_number: { type: "string", description: "Parcel number - look for 'Parcel #', 'Parcel Number', 'APN'." },
            electrical_ibi: { type: "boolean", description: "IBI electrical checkbox - true if checked/marked." },
            electrical_nkyei: { type: "boolean", description: "NKYEI electrical checkbox - true if checked/marked." },
            electrical_nec: { type: "boolean", description: "NEC electrical checkbox - true if checked/marked." },
            electrical_city: { type: "boolean", description: "City electrical checkbox - true if checked/marked." },
            electrical_county: { type: "boolean", description: "County electrical checkbox - true if checked/marked." },
            customer_is_building_owner: { type: "boolean", description: "Customer is Building Owner checkbox - look in 'Customer is:' section." },
            customer_is_tenant: { type: "boolean", description: "Customer is Tenant checkbox - look in 'Customer is:' section." },
            customer_is_marketing_co: { type: "boolean", description: "Customer is Marketing Company checkbox - look in 'Customer is:' section." },
            business_co_coo_reminder: { type: "boolean", description: "Business CO/COO reminder checkbox - Certificate of Occupancy reminder." },
            business_co_coo_date: { type: "string", description: "CO/COO reminder date if specified." },
            install_yes: { type: "boolean", description: "Install Yes checkbox - look in Install section." },
            install_no: { type: "boolean", description: "Install No checkbox - look in Install section." },
            install_due_date: { type: "string", description: "Installation due date. Format as YYYY-MM-DD. Look for 'Due Date', 'Install Date', 'Deadline'." },
            budget_less_than: { type: "number", description: "Budget amount - look for '$', 'Budget', 'Less than $'. Return just the number." },
            removal_yes: { type: "boolean", description: "Removal Yes checkbox - existing sign removal needed." },
            removal_no: { type: "boolean", description: "Removal No checkbox." },
            service_repair: { type: "string", description: "Service/Repair description - any maintenance or repair work noted." },
            origination: { type: "string", description: "Lead source - look for 'Origination', 'How did you hear about us', 'Referral', 'Source'." },
            patch: { type: "string", description: "Patch work details - wall repair after sign removal." },
            paint: { type: "string", description: "Paint details - color matching or touch-up info." },
            color: { type: "string", description: "Color specification - sign colors, PMS colors, paint colors." },
            product_1: { type: "string", description: "Product #1 - first sign or product type. Look for numbered product list." },
            product_2: { type: "string", description: "Product #2 - second sign or product type." },
            product_3: { type: "string", description: "Product #3 - third sign or product type." },
            product_4: { type: "string", description: "Product #4 - fourth sign or product type." },
            product_5: { type: "string", description: "Product #5 - fifth sign or product type." },
            product_6: { type: "string", description: "Product #6 - sixth sign or product type." },
            cb_complete: { type: "boolean", description: "CB (Channel Box) complete checkbox." },
            cf_complete: { type: "boolean", description: "CF (Channel Face) complete checkbox." },
            cc_complete: { type: "boolean", description: "CC complete checkbox." },
            sms_complete: { type: "boolean", description: "SMS complete checkbox." },
            notes_text: { type: "string", description: "ALL text from Notes section - capture everything written in notes area, any additional comments or instructions." },
            follow_up_text: { type: "string", description: "ALL text from Follow Up section - action items, callbacks, reminders." },
            estimate_amount: { type: "number", description: "Quote or estimate amount if visible - look for '$' with dollar amounts, 'Total', 'Quote', 'Estimate'." },
            project_description: { type: "string", description: "General project description - what signs are being made, overall scope of work." }
          }
        }
      });

      if (extractResult.status === "success" && extractResult.output) {
        const data = extractResult.output;
        
        // Map extracted data to form fields - more comprehensive mapping
        setFormData(prev => ({
          ...prev,
          designer: data.designer || prev.designer,
          surveyor: data.surveyor || prev.surveyor,
          start_date: data.initial_contact_date || prev.start_date,
          site_survey_date: data.site_survey_date || prev.site_survey_date,
          site_survey_time: data.site_survey_time || prev.site_survey_time,
          site_survey_am_pm: data.site_survey_am_pm || prev.site_survey_am_pm,
          client_name: data.customer_name || prev.client_name,
          representative: data.representative || prev.representative,
          install_location: data.address || prev.install_location,
          address_line_2: data.address_line_2 || prev.address_line_2,
          contact_phone: data.contact_phone || prev.contact_phone,
          contact_email: data.email || prev.contact_email,
          billing_address: data.billing_address || prev.billing_address,
          billing_address_line_2: data.billing_address_line_2 || prev.billing_address_line_2,
          additional_contact: data.additional_contact || prev.additional_contact,
          permitting: data.permitting || prev.permitting,
          township_city: data.township_city || prev.township_city,
          county: data.county || prev.county,
          permit_code: data.permit_code || prev.permit_code,
          permit_class: data.permit_class || prev.permit_class,
          property_owner: data.property_owner || prev.property_owner,
          pud: data.pud || prev.pud,
          parcel_number: data.parcel_number || prev.parcel_number,
          electrical_ibi: data.electrical_ibi ?? prev.electrical_ibi,
          electrical_nkyei: data.electrical_nkyei ?? prev.electrical_nkyei,
          electrical_nec: data.electrical_nec ?? prev.electrical_nec,
          electrical_city: data.electrical_city ?? prev.electrical_city,
          electrical_county: data.electrical_county ?? prev.electrical_county,
          customer_is_building_owner: data.customer_is_building_owner ?? prev.customer_is_building_owner,
          customer_is_tenant: data.customer_is_tenant ?? prev.customer_is_tenant,
          customer_is_marketing_co: data.customer_is_marketing_co ?? prev.customer_is_marketing_co,
          business_co_coo_reminder: data.business_co_coo_reminder ?? prev.business_co_coo_reminder,
          business_co_coo_date: data.business_co_coo_date || prev.business_co_coo_date,
          install_yes: data.install_yes ?? prev.install_yes,
          install_no: data.install_no ?? prev.install_no,
          due_date: data.install_due_date || prev.due_date,
          budget_less_than: data.budget_less_than || prev.budget_less_than,
          removal_yes: data.removal_yes ?? prev.removal_yes,
          removal_no: data.removal_no ?? prev.removal_no,
          service_repair: data.service_repair || prev.service_repair,
          origination: data.origination || prev.origination,
          patch: data.patch || prev.patch,
          paint: data.paint || prev.paint,
          color: data.color || prev.color,
          product_1: data.product_1 || prev.product_1,
          product_2: data.product_2 || prev.product_2,
          product_3: data.product_3 || prev.product_3,
          product_4: data.product_4 || prev.product_4,
          product_5: data.product_5 || prev.product_5,
          product_6: data.product_6 || prev.product_6,
          cb_complete: data.cb_complete ?? prev.cb_complete,
          cf_complete: data.cf_complete ?? prev.cf_complete,
          cc_complete: data.cc_complete ?? prev.cc_complete,
          sms_complete: data.sms_complete ?? prev.sms_complete,
          // Build title from customer name and project description
          title: data.customer_name 
            ? `${data.customer_name}${data.project_description ? ' - ' + data.project_description : ' - Work Order'}` 
            : prev.title,
          description: data.project_description || prev.description,
          estimate_amount: data.estimate_amount || prev.estimate_amount,
          notes: data.notes_text ? [...prev.notes, {
            text: data.notes_text,
            timestamp: new Date().toISOString(),
            created_by: currentUser?.email || "AI Import",
            completed: false,
            sub_tasks: []
          }] : prev.notes,
          follow_up: data.follow_up_text ? [...prev.follow_up, {
            text: data.follow_up_text,
            timestamp: new Date().toISOString(),
            created_by: currentUser?.email || "AI Import",
            completed: false
          }] : prev.follow_up
        }));
      } else {
        alert("Could not extract data from the form. Please try with a clearer scan.");
      }
    } catch (error) {
      console.error("Error scanning form:", error);
      alert("Error scanning form: " + error.message);
    }
    setScanningForm(false);
  };

  // Check for duplicates
  const checkForDuplicate = () => {
    const clientName = (formData.client_name || "").toLowerCase().trim();
    const description = (formData.description || "").toLowerCase().trim();
    
    if (!clientName) return null;
    
    // Find matching work orders (excluding the current one if editing)
    const matches = existingWorkOrders.filter(wo => {
      if (workOrder && wo.id === workOrder.id) return false; // Skip self when editing
      
      const woClientName = (wo.client_name || "").toLowerCase().trim();
      const woDescription = (wo.description || "").toLowerCase().trim();
      
      // Both must match for it to be a duplicate
      return clientName === woClientName && description === woDescription;
    });
    
    return matches.length > 0 ? matches[0] : null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    
    // Check for duplicates before saving
    const duplicate = checkForDuplicate();
    if (duplicate) {
      setDuplicateWarning(duplicate);
      return;
    }
    
    const submitData = isRider && !workOrder 
      ? { ...formData, rider_stage: formData.current_stage }
      : formData;

    setIsSubmitting(true);
    setSubmitError("");
    try {
      await onSave?.(submitData);
      onClose?.();
    } catch (error) {
      console.error("Work Order form save failed:", error);
      setSubmitError(error?.message || "Work Order could not be saved. Reload the latest data and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const activeNotes = (formData.notes || []).filter(n => !n.completed);
  const completedNotes = (formData.notes || []).filter(n => n.completed);
  const activeFollowUp = (formData.follow_up || []).filter(f => !f.completed);
  const completedFollowUp = (formData.follow_up || []).filter(f => f.completed);

  return (
    <Dialog open={isOpen} onOpenChange={() => {}} onPointerDownOutside={(e) => e.preventDefault()} onInteractOutside={(e) => e.preventDefault()}>
      <DialogContent role="dialog" className="clay-card border-none max-w-5xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-2xl font-bold text-gray-800">
              {workOrder ? "Edit" : "New"} {isRider ? "Rider Task" : "Client"}
            </DialogTitle>
            {!workOrder && !isRider && (
              <label className="cursor-pointer">
                <div className={`clay-button flex items-center gap-2 px-4 py-2 text-sm font-medium ${scanningForm ? 'opacity-50' : 'hover:opacity-80'}`}
                  style={{ background: 'linear-gradient(135deg, #C8F4E9 0%, #D4E9F7 100%)' }}>
                  {scanningForm ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Scanning...
                    </>
                  ) : (
                    <>
                      <FileSearch className="w-4 h-4" />
                      Import from Scan
                    </>
                  )}
                </div>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={handleScanForm}
                  className="hidden"
                  disabled={scanningForm}
                />
              </label>
            )}
          </div>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          {/* Header Section - Designer/Surveyor */}
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-3">
              <div>
                <Label className="font-semibold">Designer</Label>
                <Select value={formData.designer} onValueChange={(v) => handleChange("designer", v)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select designer" />
                  </SelectTrigger>
                  <SelectContent>
                    {TEAM_MEMBERS.map(name => (
                      <SelectItem key={name} value={name}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="font-semibold">Initial Contact Date</Label>
                <Input
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => handleChange("start_date", e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <Label className="font-semibold">Surveyor</Label>
                <Select value={formData.surveyor} onValueChange={(v) => handleChange("surveyor", v)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select surveyor" />
                  </SelectTrigger>
                  <SelectContent>
                    {TEAM_MEMBERS.map(name => (
                      <SelectItem key={name} value={name}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="font-semibold text-xs">Site Survey Date</Label>
                  <Input
                    type="date"
                    value={formData.site_survey_date}
                    onChange={(e) => handleChange("site_survey_date", e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="font-semibold text-xs">Time</Label>
                  <Input
                    type="time"
                    value={formData.site_survey_time}
                    onChange={(e) => handleChange("site_survey_time", e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="font-semibold text-xs">AM/PM</Label>
                  <Select value={formData.site_survey_am_pm} onValueChange={(v) => handleChange("site_survey_am_pm", v)}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="--" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="AM">AM</SelectItem>
                      <SelectItem value="PM">PM</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>

          {/* Customer Information Section */}
          <div className="clay-card p-4">
            <h3 className="font-bold text-lg mb-3 border-b pb-2">Customer Information</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Customer *</Label>
                <Input
                  value={formData.client_name}
                  onChange={(e) => handleChange("client_name", e.target.value)}
                  className="mt-1"
                  required
                />
              </div>
              <div>
                <Label>Representative</Label>
                <Input
                  value={formData.representative}
                  onChange={(e) => handleChange("representative", e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Address</Label>
                <Input
                  value={formData.install_location}
                  onChange={(e) => handleChange("install_location", e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Contact Phone</Label>
                <Input
                  value={formData.contact_phone}
                  onChange={(e) => handleChange("contact_phone", e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Input
                  value={formData.address_line_2}
                  onChange={(e) => handleChange("address_line_2", e.target.value)}
                  placeholder="Address Line 2"
                />
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={formData.contact_email}
                  onChange={(e) => handleChange("contact_email", e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Billing Address</Label>
                <Input
                  value={formData.billing_address}
                  onChange={(e) => handleChange("billing_address", e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Add'l Contact</Label>
                <Input
                  value={formData.additional_contact}
                  onChange={(e) => handleChange("additional_contact", e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Input
                  value={formData.billing_address_line_2}
                  onChange={(e) => handleChange("billing_address_line_2", e.target.value)}
                  placeholder="Billing Address Line 2"
                />
              </div>
            </div>
          </div>

          {/* Permitting Section */}
          <div className="clay-card p-4">
            <h3 className="font-bold text-lg mb-3 border-b pb-2">Permitting & Location</h3>
            <div className="space-y-3">
              <div className="flex items-center gap-4 flex-wrap">
                <Label className="font-semibold">Permitting:</Label>
                <div className="flex items-center gap-4">
                  {["yes", "no", "maybe", "na"].map(opt => (
                    <label key={opt} className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={formData.permitting === opt}
                        onCheckedChange={() => handleChange("permitting", opt)}
                      />
                      <span className="capitalize text-sm">{opt === "na" ? "N/A" : opt}</span>
                    </label>
                  ))}
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <Label className="text-sm">Twp / City:</Label>
                  <Input
                    value={formData.township_city}
                    onChange={(e) => handleChange("township_city", e.target.value)}
                    className="w-32 h-8"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-sm">Cty:</Label>
                  <Input
                    value={formData.county}
                    onChange={(e) => handleChange("county", e.target.value)}
                    className="w-32 h-8"
                  />
                </div>
              </div>

              <div className="grid grid-cols-4 gap-3">
                <div>
                  <Label className="text-sm">Code</Label>
                  <Input
                    value={formData.permit_code}
                    onChange={(e) => handleChange("permit_code", e.target.value)}
                    className="mt-1 h-8"
                  />
                </div>
                <div>
                  <Label className="text-sm">Class</Label>
                  <Input
                    value={formData.permit_class}
                    onChange={(e) => handleChange("permit_class", e.target.value)}
                    className="mt-1 h-8"
                  />
                </div>
                <div className="col-span-2">
                  <Label className="text-sm">Owner</Label>
                  <Input
                    value={formData.property_owner}
                    onChange={(e) => handleChange("property_owner", e.target.value)}
                    className="mt-1 h-8"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-sm">PUD</Label>
                  <Input
                    value={formData.pud}
                    onChange={(e) => handleChange("pud", e.target.value)}
                    className="mt-1 h-8"
                  />
                </div>
                <div>
                  <Label className="text-sm">Parcel #</Label>
                  <Input
                    value={formData.parcel_number}
                    onChange={(e) => handleChange("parcel_number", e.target.value)}
                    className="mt-1 h-8"
                  />
                </div>
                <div>
                  <Label className="text-sm mb-1 block">Electrical</Label>
                  <div className="flex items-center gap-2 flex-wrap">
                    <label className="flex items-center gap-1 cursor-pointer">
                      <Checkbox checked={formData.electrical_ibi} onCheckedChange={() => handleCheckboxChange("electrical_ibi")} />
                      <span className="text-xs">IBI</span>
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer">
                      <Checkbox checked={formData.electrical_nkyei} onCheckedChange={() => handleCheckboxChange("electrical_nkyei")} />
                      <span className="text-xs">NKYEI</span>
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer">
                      <Checkbox checked={formData.electrical_nec} onCheckedChange={() => handleCheckboxChange("electrical_nec")} />
                      <span className="text-xs">NEC</span>
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer">
                      <Checkbox checked={formData.electrical_city} onCheckedChange={() => handleCheckboxChange("electrical_city")} />
                      <span className="text-xs">City</span>
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer">
                      <Checkbox checked={formData.electrical_county} onCheckedChange={() => handleCheckboxChange("electrical_county")} />
                      <span className="text-xs">County</span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <Label className="font-semibold text-sm">Customer is:</Label>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <Checkbox checked={formData.customer_is_building_owner} onCheckedChange={() => handleCheckboxChange("customer_is_building_owner")} />
                    <span className="text-xs">Building Owner</span>
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <Checkbox checked={formData.customer_is_tenant} onCheckedChange={() => handleCheckboxChange("customer_is_tenant")} />
                    <span className="text-xs">Tenant</span>
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <Checkbox checked={formData.customer_is_marketing_co} onCheckedChange={() => handleCheckboxChange("customer_is_marketing_co")} />
                    <span className="text-xs">Marketing Co.</span>
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1 cursor-pointer">
                    <Checkbox checked={formData.business_co_coo_reminder} onCheckedChange={() => handleCheckboxChange("business_co_coo_reminder")} />
                    <span className="text-xs">Business CO or COO Reminder</span>
                  </label>
                  <Input
                    value={formData.business_co_coo_date}
                    onChange={(e) => handleChange("business_co_coo_date", e.target.value)}
                    placeholder="Date"
                    className="w-28 h-7 text-xs"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Install/Removal/Service Section */}
          <div className="clay-card p-4">
            <h3 className="font-bold text-lg mb-3 border-b pb-2">Service Details</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Label className="font-semibold w-16 text-sm">Install:</Label>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <Checkbox checked={formData.install_yes} onCheckedChange={() => handleCheckboxChange("install_yes")} />
                    <span className="text-xs">Yes</span>
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <Checkbox checked={formData.install_no} onCheckedChange={() => handleCheckboxChange("install_no")} />
                    <span className="text-xs">No</span>
                  </label>
                  <div className="flex items-center gap-1 ml-2">
                    <Label className="text-xs">Due Date:</Label>
                    <Input
                      type="date"
                      value={formData.due_date}
                      onChange={(e) => handleChange("due_date", e.target.value)}
                      className="w-36 h-7"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Label className="font-semibold w-16 text-sm">Removal:</Label>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <Checkbox checked={formData.removal_yes} onCheckedChange={() => handleCheckboxChange("removal_yes")} />
                    <span className="text-xs">Yes</span>
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <Checkbox checked={formData.removal_no} onCheckedChange={() => handleCheckboxChange("removal_no")} />
                    <span className="text-xs">No</span>
                  </label>
                </div>
                <div>
                  <Label className="text-sm">Service / Repair</Label>
                  <Input
                    value={formData.service_repair}
                    onChange={(e) => handleChange("service_repair", e.target.value)}
                    className="mt-1 h-8"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-xs">Patch</Label>
                    <Input
                      value={formData.patch}
                      onChange={(e) => handleChange("patch", e.target.value)}
                      className="mt-1 h-7"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Paint</Label>
                    <Input
                      value={formData.paint}
                      onChange={(e) => handleChange("paint", e.target.value)}
                      className="mt-1 h-7"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Color</Label>
                    <Input
                      value={formData.color}
                      onChange={(e) => handleChange("color", e.target.value)}
                      className="mt-1 h-7"
                    />
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                <div>
                  <Label className="text-sm">Budget - Less than $</Label>
                  <Input
                    type="number"
                    value={formData.budget_less_than}
                    onChange={(e) => handleChange("budget_less_than", e.target.value)}
                    className="mt-1 h-8"
                  />
                </div>
                <div>
                  <Label className="text-sm">Origination</Label>
                  <Input
                    value={formData.origination}
                    onChange={(e) => handleChange("origination", e.target.value)}
                    className="mt-1 h-8"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Products Section - matches ClientInfoSection */}
          <div className="clay-card p-4">
            <div className="flex items-center justify-between mb-3 border-b pb-2">
              <h3 className="font-bold text-lg">Products</h3>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  const newProduct = {
                    id: `prod_${Date.now()}`,
                    description: "",
                    product_type: ""
                  };
                  handleChange("products", [...(formData.products || []), newProduct]);
                }}
                className="h-7 px-2 text-xs"
              >
                <Plus className="w-3 h-3 mr-1" />
                Add Product
              </Button>
            </div>
            <div className="space-y-2 mb-3">
              {(formData.products || []).map((product, index) => (
                <div key={product.id} className="flex gap-2 items-center">
                  <span className="text-xs font-medium w-6">#{index + 1}</span>
                  <Select
                    value={product.product_type || ""}
                    onValueChange={(val) => {
                      const updated = [...(formData.products || [])];
                      updated[index] = { ...updated[index], product_type: val };
                      handleChange("products", updated);
                    }}
                  >
                    <SelectTrigger className="w-40 h-8 text-sm">
                      <SelectValue placeholder="Type..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={null}>None</SelectItem>
                      {productTypes.map(type => (
                        <SelectItem key={type} value={type}>{type}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    value={product.description || ""}
                    onChange={(e) => {
                      const updated = [...(formData.products || [])];
                      updated[index] = { ...updated[index], description: e.target.value };
                      handleChange("products", updated);
                    }}
                    placeholder="Product description..."
                    className="flex-1 h-8 text-sm"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      handleChange("products", (formData.products || []).filter((_, i) => i !== index));
                    }}
                    className="h-8 w-8"
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </Button>
                </div>
              ))}
              {(!formData.products || formData.products.length === 0) && (
                <p className="text-xs text-gray-400 text-center py-2">No products added yet</p>
              )}
            </div>
            <div className="flex items-center gap-4">
              <span className="font-semibold text-sm">Complete:</span>
              <label className="flex items-center gap-1 cursor-pointer">
                <Checkbox checked={formData.cb_complete} onCheckedChange={() => handleCheckboxChange("cb_complete")} />
                <span className="text-xs">CB</span>
              </label>
              <label className="flex items-center gap-1 cursor-pointer">
                <Checkbox checked={formData.cf_complete} onCheckedChange={() => handleCheckboxChange("cf_complete")} />
                <span className="text-xs">CF</span>
              </label>
              <label className="flex items-center gap-1 cursor-pointer">
                <Checkbox checked={formData.cc_complete} onCheckedChange={() => handleCheckboxChange("cc_complete")} />
                <span className="text-xs">CC</span>
              </label>
              <label className="flex items-center gap-1 cursor-pointer">
                <Checkbox checked={formData.sms_complete} onCheckedChange={() => handleCheckboxChange("sms_complete")} />
                <span className="text-xs">SMS</span>
              </label>
            </div>
          </div>

          {/* Image & Description Row */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label className="text-gray-700 font-medium">Image</Label>
              <div className="mt-1 flex gap-2">
                {formData.image_url && (
                  <div className="relative">
                    <img src={formData.image_url} alt="Preview" className="w-20 h-20 object-cover rounded-lg" />
                    <Button type="button" size="icon" variant="destructive" className="absolute -top-2 -right-2 h-5 w-5 rounded-full" onClick={() => setFormData({ ...formData, image_url: "" })}>
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                )}
                <label className="flex-1">
                  <div className="clay-button border-2 border-dashed border-gray-300 rounded-lg p-3 text-center cursor-pointer hover:border-gray-400 transition-colors">
                    <Upload className="w-6 h-6 mx-auto text-gray-400 mb-1" />
                    <p className="text-xs text-gray-600">{uploading ? "..." : "Upload"}</p>
                  </div>
                  <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" disabled={uploading} />
                </label>
              </div>
            </div>
            <div className="col-span-2">
              <Label className="text-gray-700 font-medium">Title / Description *</Label>
              <Input
                value={formData.title}
                onChange={(e) => handleChange("title", e.target.value)}
                placeholder="Work order title"
                required
                className="mt-1 mb-2"
              />
              <Textarea
                value={formData.description}
                onChange={(e) => handleChange("description", e.target.value)}
                placeholder="Description"
                className="min-h-16"
              />
            </div>
          </div>

          {/* Stage, Assignment, and Salesperson */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label className="text-gray-700 font-medium">{isRider && !workOrder ? "Select Stage for Rider" : "Current Stage"}</Label>
              <Select value={formData.current_stage} onValueChange={(value) => handleChange("current_stage", value)} disabled={isRider && workOrder}>
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
            </div>
            <div>
              <Label className="text-gray-700 font-medium">Assign To</Label>
              {showCustomInput ? (
                <div className="flex gap-2 mt-1">
                  <Input value={customName} onChange={handleCustomNameChange} placeholder="Enter name" className="clay-button border-none flex-1" />
                  <Button type="button" variant="outline" onClick={() => { setShowCustomInput(false); setCustomName(""); setFormData({ ...formData, assigned_to: "" }); }} className="clay-button border-none">
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <Select value={formData.assigned_to} onValueChange={handleAssignToChange}>
                  <SelectTrigger className="clay-button border-none mt-1">
                    <SelectValue placeholder="Select person" />
                  </SelectTrigger>
                  <SelectContent className="clay-card border-none">
                    {TEAM_MEMBERS.map((name) => (
                      <SelectItem key={name} value={name}>{name}</SelectItem>
                    ))}
                    <SelectItem value="custom">+ Add Custom Name</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
            <div>
              <Label className="text-gray-700 font-medium">Salesperson</Label>
              <Select value={formData.sales_rep || ""} onValueChange={(value) => handleChange("sales_rep", value)}>
                <SelectTrigger className="clay-button border-none mt-1">
                  <SelectValue placeholder="Select salesperson" />
                </SelectTrigger>
                <SelectContent className="clay-card border-none">
                  {salespersons.length > 0 ? (
                    salespersons.map((person) => (
                      <SelectItem key={person.email} value={person.full_name}>{person.full_name}</SelectItem>
                    ))
                  ) : (
                    TEAM_MEMBERS.map((name) => (
                      <SelectItem key={name} value={name}>{name}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Notes Section */}
          <div className="clay-card p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-lg">Notes</h3>
              <div className="flex items-center gap-2">
                {completedNotes.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => setShowCompletedNotes(!showCompletedNotes)} className="h-6 px-2 text-xs">
                    {showCompletedNotes ? <EyeOff className="w-3 h-3 mr-1" /> : <Eye className="w-3 h-3 mr-1" />}
                    ({completedNotes.length})
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => setIsAddingNote(true)} className="h-6 px-2 text-xs">
                  <Plus className="w-3 h-3 mr-1" />Add
                </Button>
              </div>
            </div>

            <div className="space-y-2 max-h-48 overflow-y-auto">
              {isAddingNote && (
                <div className="p-2 bg-blue-50 rounded-lg space-y-2">
                  <Input value={newNoteText} onChange={(e) => setNewNoteText(e.target.value)} placeholder="Enter note..." className="text-sm h-8" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') handleAddNote(); if (e.key === 'Escape') { setIsAddingNote(false); setNewNoteText(""); } }} />
                  <div className="flex gap-1">
                    <Button size="sm" type="button" onClick={handleAddNote} className="h-6 px-2 text-xs bg-green-100 hover:bg-green-200 text-green-800"><Check className="w-3 h-3 mr-1" />Save</Button>
                    <Button size="sm" type="button" variant="ghost" onClick={() => { setIsAddingNote(false); setNewNoteText(""); }} className="h-6 px-2 text-xs"><X className="w-3 h-3" /></Button>
                  </div>
                </div>
              )}

              {activeNotes.map((note, idx) => {
                const actualIndex = formData.notes.findIndex(n => n === note);
                return (
                  <div key={idx} className="bg-white/50 rounded-lg">
                    <div className="p-2 flex items-start gap-2">
                      <Button variant="ghost" size="icon" type="button" onClick={() => handleToggleNote(actualIndex)} className="h-4 w-4 rounded-full flex-shrink-0 hover:bg-green-100 p-0">
                        <Circle className="w-3 h-3 text-gray-400" />
                      </Button>
                      <div className="flex-1">
                        <p className="text-sm text-gray-700">{note.text}</p>
                        <p className="text-xs text-gray-400 mt-1">{format(new Date(note.timestamp), "MMM d, h:mm a")}</p>
                        {note.sub_tasks && note.sub_tasks.length > 0 && (
                          <div className="ml-4 mt-2 space-y-1">
                            {note.sub_tasks.map((subTask, subIdx) => (
                              <div key={subIdx} className="flex items-center gap-2 text-xs">
                                <Checkbox checked={subTask.completed} onCheckedChange={() => handleToggleSubTask(actualIndex, subIdx)} className="h-3 w-3" />
                                <span className={subTask.completed ? "line-through text-gray-400" : "text-gray-600"}>{subTask.text}</span>
                                <Button variant="ghost" size="icon" type="button" onClick={() => handleDeleteSubTask(actualIndex, subIdx)} className="h-4 w-4 ml-auto p-0">
                                  <X className="w-2 h-2 text-red-500" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                        {addingSubTaskFor === actualIndex ? (
                          <div className="ml-4 mt-2 flex gap-1">
                            <Input value={newSubTaskText} onChange={(e) => setNewSubTaskText(e.target.value)} placeholder="Sub-task..." className="h-6 text-xs" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') handleAddSubTask(actualIndex); if (e.key === 'Escape') { setAddingSubTaskFor(null); setNewSubTaskText(""); } }} />
                            <Button size="sm" type="button" onClick={() => handleAddSubTask(actualIndex)} className="h-6 px-2"><Check className="w-3 h-3" /></Button>
                            <Button size="sm" type="button" variant="ghost" onClick={() => { setAddingSubTaskFor(null); setNewSubTaskText(""); }} className="h-6 px-2"><X className="w-3 h-3" /></Button>
                          </div>
                        ) : (
                          <Button variant="ghost" size="sm" type="button" onClick={() => setAddingSubTaskFor(actualIndex)} className="h-5 px-2 text-xs ml-4 mt-1">
                            <Plus className="w-2 h-2 mr-1" />Sub-task
                          </Button>
                        )}
                      </div>
                      <Button variant="ghost" size="icon" type="button" onClick={() => handleDeleteNote(actualIndex)} className="h-6 w-6 flex-shrink-0">
                        <Trash2 className="w-3 h-3 text-red-600" />
                      </Button>
                    </div>
                  </div>
                );
              })}

              {showCompletedNotes && completedNotes.map((note, idx) => {
                const actualIndex = formData.notes.findIndex(n => n === note);
                return (
                  <div key={idx} className="p-2 bg-gray-100/50 rounded-lg opacity-60 flex items-start gap-2">
                    <Button variant="ghost" size="icon" type="button" onClick={() => handleToggleNote(actualIndex)} className="h-4 w-4 rounded-full flex-shrink-0 hover:bg-gray-200 p-0">
                      <CheckCircle2 className="w-3 h-3 text-green-600" />
                    </Button>
                    <div className="flex-1">
                      <p className="text-sm text-gray-600 line-through">{note.text}</p>
                    </div>
                    <Button variant="ghost" size="icon" type="button" onClick={() => handleDeleteNote(actualIndex)} className="h-6 w-6 flex-shrink-0">
                      <Trash2 className="w-3 h-3 text-red-600" />
                    </Button>
                  </div>
                );
              })}

              {activeNotes.length === 0 && !isAddingNote && (
                <p className="text-xs text-gray-400 text-center py-2">No notes yet</p>
              )}
            </div>
          </div>

          {/* Follow Up Section */}
          <div className="clay-card p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-lg">Follow Up</h3>
              <div className="flex items-center gap-2">
                {completedFollowUp.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => setShowCompletedFollowUp(!showCompletedFollowUp)} className="h-6 px-2 text-xs">
                    {showCompletedFollowUp ? <EyeOff className="w-3 h-3 mr-1" /> : <Eye className="w-3 h-3 mr-1" />}
                    ({completedFollowUp.length})
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => setIsAddingFollowUp(true)} className="h-6 px-2 text-xs">
                  <Plus className="w-3 h-3 mr-1" />Add
                </Button>
              </div>
            </div>

            <div className="space-y-2 max-h-32 overflow-y-auto">
              {isAddingFollowUp && (
                <div className="p-2 bg-blue-50 rounded-lg space-y-2">
                  <Input value={newFollowUpText} onChange={(e) => setNewFollowUpText(e.target.value)} placeholder="Enter follow up..." className="text-sm h-8" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') handleAddFollowUp(); if (e.key === 'Escape') { setIsAddingFollowUp(false); setNewFollowUpText(""); } }} />
                  <div className="flex gap-1">
                    <Button size="sm" type="button" onClick={handleAddFollowUp} className="h-6 px-2 text-xs bg-green-100 hover:bg-green-200 text-green-800"><Check className="w-3 h-3 mr-1" />Save</Button>
                    <Button size="sm" type="button" variant="ghost" onClick={() => { setIsAddingFollowUp(false); setNewFollowUpText(""); }} className="h-6 px-2 text-xs"><X className="w-3 h-3" /></Button>
                  </div>
                </div>
              )}

              {activeFollowUp.map((item, idx) => {
                const actualIndex = formData.follow_up.findIndex(f => f === item);
                return (
                  <div key={idx} className="p-2 bg-white/50 rounded-lg flex items-start gap-2">
                    <Button variant="ghost" size="icon" type="button" onClick={() => handleToggleFollowUp(actualIndex)} className="h-4 w-4 rounded-full flex-shrink-0 hover:bg-green-100 p-0">
                      <Circle className="w-3 h-3 text-gray-400" />
                    </Button>
                    <div className="flex-1">
                      <p className="text-sm text-gray-700">{item.text}</p>
                      <p className="text-xs text-gray-400 mt-1">{format(new Date(item.timestamp), "MMM d, h:mm a")}</p>
                    </div>
                    <Button variant="ghost" size="icon" type="button" onClick={() => handleDeleteFollowUp(actualIndex)} className="h-6 w-6 flex-shrink-0">
                      <Trash2 className="w-3 h-3 text-red-600" />
                    </Button>
                  </div>
                );
              })}

              {showCompletedFollowUp && completedFollowUp.map((item, idx) => {
                const actualIndex = formData.follow_up.findIndex(f => f === item);
                return (
                  <div key={idx} className="p-2 bg-gray-100/50 rounded-lg opacity-60 flex items-start gap-2">
                    <Button variant="ghost" size="icon" type="button" onClick={() => handleToggleFollowUp(actualIndex)} className="h-4 w-4 rounded-full flex-shrink-0 hover:bg-gray-200 p-0">
                      <CheckCircle2 className="w-3 h-3 text-green-600" />
                    </Button>
                    <div className="flex-1">
                      <p className="text-sm text-gray-600 line-through">{item.text}</p>
                    </div>
                    <Button variant="ghost" size="icon" type="button" onClick={() => handleDeleteFollowUp(actualIndex)} className="h-6 w-6 flex-shrink-0">
                      <Trash2 className="w-3 h-3 text-red-600" />
                    </Button>
                  </div>
                );
              })}

              {activeFollowUp.length === 0 && !isAddingFollowUp && (
                <p className="text-xs text-gray-400 text-center py-2">No follow up items yet</p>
              )}
            </div>
          </div>

          {submitError && (
            <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {submitError}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting} className="clay-button border-none">
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="clay-button border-none text-gray-800" style={{ background: 'linear-gradient(135deg, #E0D4F7 0%, #D4E9F7 100%)' }}>
              {isSubmitting && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              {isSubmitting ? "Saving..." : `${workOrder ? "Update" : "Create"} ${isRider ? "Rider" : "Work Order"}`}
            </Button>
          </div>
        </form>
      </DialogContent>

      {/* Duplicate Warning Dialog */}
      <AlertDialog open={!!duplicateWarning} onOpenChange={() => setDuplicateWarning(null)}>
        <AlertDialogContent className="clay-card border-none max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-600 flex items-center gap-2">
              <X className="w-5 h-5" />
              Duplicate Client Detected
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>A client with the same name and description already exists:</p>
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-1">
                  <p className="font-medium text-gray-900">Customer: {duplicateWarning?.client_name}</p>
                  <p className="text-sm text-gray-600">Description: {duplicateWarning?.description || "(no description)"}</p>
                  {duplicateWarning?.title && (
                    <p className="text-sm text-gray-600">Title: {duplicateWarning?.title}</p>
                  )}
                </div>
                <p className="text-sm text-gray-700">
                  Please change the <strong>Customer Name</strong> or <strong>Description</strong> to make this client unique.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="clay-button">
              Go Back and Edit
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}