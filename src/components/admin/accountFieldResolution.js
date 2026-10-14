// Local-only field choice planner for interrupted Admin Account saves.
// No writes. All permissions remain subject to backend authorization and CAS.
import { createAdminAccountDraft } from "./adminAccountDraft.js";

const FIELDS = [
  ["full_name","Full name"], ["username","Time Clock username"],
  ["role","Account role"], ["sales_roles","Sales Pipeline assignments"],
  ["can_import_export","Import/export permission"],
  ["can_order_export","Order Form export permission"],
  ["can_view_resources","Resources permission"],
  ["employment_type","Employment type"], ["can_work_pause","Work Pause permission"]
];
const FIELDS_KEYS=FIELDS.map(([key])=>key);
const equal=(key,a,b)=>key==="sales_roles"
  ? JSON.stringify([...new Set(a||[])].sort())===JSON.stringify([...new Set(b||[])].sort())
  : Object.is(a,b);
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const copy=value=>Array.isArray(value)?[...value]:value;

export function planAccountFieldResolution({baseline,attempted,latest,draft,choices={}}) {
  const records=[baseline,attempted,latest,draft,choices];
  if(records.some(item=>!item||typeof item!=="object"||Array.isArray(item))||
     FIELDS_KEYS.some(key=>!own(attempted,key)||!own(draft,key))) {
    throw new Error("Account field review requires complete, scoped drafts.");
  }
  if(Object.entries(choices).some(([key,value])=>
    !FIELDS_KEYS.includes(key)||!["latest","mine"].includes(value))) {
    throw new Error("Unknown Account field resolution choice.");
  }
  const original=createAdminAccountDraft(baseline);
  const remote=createAdminAccountDraft(latest);
  const result={...remote,sales_roles:copy(remote.sales_roles),password_hash:draft.password_hash||""};
  const fields=[];
  for(const [key,label] of FIELDS){
    const tried=!equal(key,original[key],attempted[key]);
    const remoteChanged=!equal(key,original[key],remote[key]);
    const editedLater=!equal(key,attempted[key],draft[key]);
    if(!tried&&!remoteChanged&&!editedLater) continue;
    const explicit=choices[key];
    if(explicit!==undefined && explicit!=="latest" && explicit!=="mine") {
      throw new Error("Unknown Account field resolution choice.");
    }
    // Never discard edits made after the failed request without a deliberate
    // choice. Everything else defaults to the newly verified remote version.
    const selected=explicit || (editedLater?"mine":"latest");
    result[key]=copy(selected==="mine"?draft[key]:remote[key]);
    fields.push({key,label,selected,tried,remoteChanged,editedLater,
      sensitive:["role","sales_roles","can_import_export","can_order_export","can_view_resources"].includes(key),
      matchesLatest:equal(key,draft[key],remote[key])});
  }
  const adjustments=[];
  if(result.role!=="admin" && result.can_order_export!==false){
    result.can_order_export=false;
    adjustments.push("Order Form export is disabled for non-admin accounts.");
  }
  if(result.role==="admin" && result.can_view_resources!==true){
    result.can_view_resources=true;
    adjustments.push("Administrators have Resources access enabled.");
  }
  return {
    fields, draft:result, adjustments,
    counts:{
      useLatest:fields.filter(field=>field.selected==="latest").length,
      useMine:fields.filter(field=>field.selected==="mine").length,
      privilegedMine:fields.filter(field=>field.sensitive&&field.selected==="mine"&&!field.matchesLatest).length
    }
  };
}
