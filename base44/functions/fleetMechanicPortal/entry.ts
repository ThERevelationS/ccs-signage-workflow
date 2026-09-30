import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { loadAllEntityRows } from '../../shared/pagedEntityRows.ts';
import { updateFleetRecordIfCurrent } from '../../shared/fleetRecordPersistence.ts';
import { createFleetRepairEstimateSafely } from '../../shared/fleetRepairEstimateCreate.ts';
import { evaluateRepairApprovalPolicy, repairEstimatePatch } from '../../shared/fleetRepairEstimateCore.ts';

const ACTIVE = new Set(['open','assigned','in_progress']);
const MAX_BODY_BYTES = 5_500_000;
const MAX_PHOTOS_PER_SAVE = 3;
const MAX_PHOTO_BYTES = 1_200_000;
const MAX_PHOTO_B64_CHARS = Math.ceil(MAX_PHOTO_BYTES / 3) * 4 + 16;
const clean = (value: unknown, max: number) => String(value ?? '').trim().slice(0, max);
const nowIso = () => new Date().toISOString();
const todayEastern = () => new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const json = (body: any, init: ResponseInit = {}) => Response.json(body, {
  ...init,
  headers: {
    'Cache-Control':'no-store, max-age=0',
    'Pragma':'no-cache',
    'Referrer-Policy':'no-referrer',
    ...(init.headers || {}),
  },
});

function base64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2,'0')).join('');
}

const MECHANIC_MUTATION_TYPES: Record<string,string> = {
  start:'mechanic_start',
  save:'mechanic_progress_save',
};

function canonicalReceipt(rows: any[] = []) {
  return [...rows].sort((a:any,b:any) => {
    const byCreated = String(a?.created_date || '').localeCompare(String(b?.created_date || ''));
    return byCreated || String(a?.id || '').localeCompare(String(b?.id || ''));
  })[0] || null;
}

function mechanicRequestId(value: unknown) {
  const id = String(value || '').trim();
  return /^[A-Za-z0-9_-]{16,120}$/.test(id) ? id : '';
}

function mechanicOperationKey(grantId: unknown, workOrderId: string, action: string, requestId: string) {
  return `mechanic:${String(grantId || '').trim()}:${workOrderId}:${action}:${requestId}`;
}

async function mechanicMutationFingerprint(action: string, body: any) {
  if (action === 'start') return sha256(JSON.stringify({ action, note:clean(body?.note,1200) }));
  const photoHashes = [];
  for (const item of (Array.isArray(body?.photos) ? body.photos : [])) {
    photoHashes.push({ type:clean(item?.type,40).toLowerCase(), sha256:await sha256(String(item?.data || '')) });
  }
  return sha256(JSON.stringify({
    action,
    actual_hours:String(body?.actual_hours ?? '').trim(),
    corrective_action:clean(body?.corrective_action,5000),
    mechanic_note:clean(body?.mechanic_note,2000),
    photos:photoHashes,
  }));
}

function workOrderHasMechanicReceipt(current: any, receipt: any) {
  return !!receipt?.operation_key &&
    String(current?.mechanic_operation_key || '') === String(receipt.operation_key || '') &&
    String(current?.mechanic_operation_fingerprint || '') === String(receipt.payload_fingerprint || '');
}

async function markMechanicReceiptApplied(Receipt: any, receipt: any, current: any, recovered = false) {
  if (receipt?.status !== 'applied') {
    await Receipt.update(receipt.id, {
      status:'applied',
      applied_at:receipt?.applied_at || nowIso(),
      failed_at:null,
      error_message:'',
      result_summary:{
        ...(receipt?.result_summary || {}),
        work_order_updated_date:current?.updated_date || '',
        work_order_status:current?.status || '',
        recovered_from_work_order_marker:recovered === true,
      },
    });
  }
  return { ...receipt, status:'applied' };
}

async function claimMechanicReceipt(Receipt: any, data: any) {
  const created = await Receipt.create({ ...data, status:'started', started_at:nowIso() });
  await new Promise(resolve => setTimeout(resolve,50));
  const rows = await Receipt.filter({ operation_key:data.operation_key });
  const winner = canonicalReceipt(rows) || created;
  if (String(winner.id || '') !== String(created.id || '')) {
    await Receipt.delete(created.id).catch(()=>null);
    return { receipt:winner, owner:false };
  }
  return { receipt:created, owner:true };
}

async function failMechanicReceipt(Receipt: any, receipt: any, error: unknown) {
  await Receipt.update(receipt.id, {
    status:'failed',
    failed_at:nowIso(),
    error_message:clean(error instanceof Error ? error.message : error,1200),
  }).catch(()=>null);
}

async function readJson(req: Request) {
  const declared = Number(req.headers.get('content-length') || 0);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return { payload:null, error:'Mechanic portal request is too large.', status:413 };
  if (!req.body) return { payload:{}, error:'', status:200 };
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const {done,value} = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel().catch(()=>null);
        return { payload:null, error:'Mechanic portal request is too large.', status:413 };
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.byteLength; }
  const text = new TextDecoder().decode(bytes);
  if (!text.trim()) return { payload:{}, error:'', status:200 };
  try { return { payload:JSON.parse(text), error:'', status:200 }; }
  catch { return { payload:null, error:'Mechanic portal request must be valid JSON.', status:400 }; }
}

async function requireAdmin(base44: any) {
  const user = await base44.auth.me().catch(()=>null);
  if (!user?.email) return { error:json({error:'Unauthorized'},{status:401}) };
  if (user.role === 'admin') return { user };
  const rows = await base44.asServiceRole.entities.AuthorizedEmail.filter({email:user.email});
  if (rows?.[0]?.role !== 'admin') return { error:json({error:'Fleet mechanic link management requires a CCS admin.'},{status:403}) };
  return { user };
}

const scopeForGrant = (row:any) => ({
  scope_mode:row?.scope_mode === 'selected_equipment' ? 'selected_equipment' : 'all_active',
  allowed_equipment_ids:[...new Set((Array.isArray(row?.allowed_equipment_ids) ? row.allowed_equipment_ids : []).map((value:any)=>String(value||'').trim()).filter(Boolean))],
});

const publicGrant = (row: any) => ({
  id: String(row?.id || ''),
  name: String(row?.name || 'External Mechanic'),
  enabled: row?.enabled !== false,
  created_at: row?.created_date || '',
  created_by: row?.created_by || '',
  expires_at: row?.expires_at || '',
  last_used_at: row?.last_used_at || '',
  notes: row?.notes || '',
  allow_estimates:Array.isArray(row?.allowed_actions) && row.allowed_actions.includes('estimate_submit'),
  ...scopeForGrant(row),
});

async function validateGrant(Access: any, token: unknown) {
  const raw = String(token || '').trim();
  if (raw.length < 40 || raw.length > 200 || !/^[A-Za-z0-9_-]+$/.test(raw)) return null;
  const hash = await sha256(raw);
  const rows = await Access.filter({token_hash:hash,enabled:true});
  const now = Date.now();
  return (rows || []).find((row: any) => {
    const expiry = Date.parse(String(row?.expires_at || ''));
    return !Number.isFinite(expiry) || expiry > now;
  }) || null;
}

function sanitizeEquipment(row: any) {
  return {
    id:row.id,
    name:row.name || '', type:row.type || '', make:row.make || '', model:row.model || '', year:row.year ?? null,
    serial_number:row.serial_number || '', vin:row.vin || '', engine_details:row.engine_details || '', status:row.status || '',
    location:row.location || '', mileage_hours:row.mileage_hours ?? null, last_service_date:row.last_service_date || '',
    next_service_due:row.next_service_due || '', photo_url:row.photo_url || '',
  };
}

function sanitizeUsage(rows: any[] = [], kind: 'part'|'fluid') {
  return rows.map((row:any) => kind === 'part'
    ? { part_name:row.part_name || '', quantity:row.quantity ?? null }
    : { fluid_name:row.fluid_name || '', quantity:row.quantity ?? row.quantity_quarts ?? null, unit:row.unit || (row.quantity_quarts != null ? 'quarts' : '') });
}

function sanitizeWorkOrder(row: any) {
  return {
    id:row.id, updated_date:row.updated_date || '', work_order_number:row.work_order_number || '', equipment_id:row.equipment_id || '',
    maintenance_task_id:row.maintenance_task_id || '', title:row.title || '', description:row.description || '', type:row.type || '',
    priority:row.priority || 'medium', status:row.status || 'open', assigned_to:row.assigned_to || '', started_date:row.started_date || '',
    projected_completion_date:row.projected_completion_date || '', completed_date:row.completed_date || '', actual_hours:row.actual_hours ?? null,
    corrective_action:row.corrective_action || '', before_photos:Array.isArray(row.before_photos)?row.before_photos:[],
    problem_photos:Array.isArray(row.problem_photos)?row.problem_photos:[], after_photos:Array.isArray(row.after_photos)?row.after_photos:[],
    notes:row.notes || '', parts_used:sanitizeUsage(row.parts_used || [],'part'), fluids_used:sanitizeUsage(row.fluids_used || [],'fluid'),
  };
}

function sanitizeEstimate(row:any) {
  return {
    id:row.id, work_order_id:row.work_order_id || '', updated_date:row.updated_date || '', status:row.status || 'draft',
    estimated_labor_hours:row.estimated_labor_hours ?? 0, labor_rate:row.labor_rate ?? 0,
    estimated_parts_total:row.estimated_parts_total ?? 0, estimated_fluids_total:row.estimated_fluids_total ?? 0,
    misc_total:row.misc_total ?? 0, estimated_total:row.estimated_total ?? 0,
    estimated_completion_date:row.estimated_completion_date || '',
    parts_estimate:Array.isArray(row.parts_estimate)?row.parts_estimate.map((line:any)=>({description:clean(line?.description,300),quantity:Number(line?.quantity||0),estimated_cost:Number(line?.estimated_cost||0)})):[],
    fluids_estimate:Array.isArray(row.fluids_estimate)?row.fluids_estimate.map((line:any)=>({description:clean(line?.description,300),quantity:Number(line?.quantity||0),unit:clean(line?.unit,40),estimated_cost:Number(line?.estimated_cost||0)})):[],
    notes:clean(row.notes,3000), approval_required:row.approval_required===true, approval_tier:clean(row.approval_tier,80),
    submitted_at:row.submitted_at || '', decision_at:row.decision_at || '', decision_notes:clean(row.decision_notes,2000),
  };
}

function sanitizeTask(row: any) {
  return {
    id:row.id, title:row.title || '', description:row.description || '', type:row.type || '', priority:row.priority || '',
    frequency:row.frequency || '', estimated_duration:row.estimated_duration ?? null, start_date:row.start_date || '', status:row.status || '',
    parts_needed:Array.isArray(row.parts_needed) ? row.parts_needed.map((item:any)=>({
      part_name:clean(item?.part_name,160), quantity:item?.quantity == null || item.quantity === '' ? null : Number.isFinite(Number(item.quantity)) ? Number(item.quantity) : null, notes:clean(item?.notes,500),
    })) : [],
    fluids_needed:Array.isArray(row.fluids_needed) ? row.fluids_needed.map((item:any)=>({
      fluid_type:clean(item?.fluid_type,160), quantity:item?.quantity == null || item.quantity === '' ? null : Number.isFinite(Number(item.quantity)) ? Number(item.quantity) : null, unit:clean(item?.unit,32), notes:clean(item?.notes,500),
    })) : [],
  };
}

async function portalPayload(base44: any, grant: any) {
  const WorkOrder = base44.asServiceRole.entities.FleetMaintenanceWorkOrder;
  const Equipment = base44.asServiceRole.entities.FleetEquipment;
  const Task = base44.asServiceRole.entities.FleetMaintenanceTask;
  const Estimate = base44.asServiceRole.entities.FleetRepairEstimate;
  const [workOrders,equipment,tasks,estimates] = await Promise.all([
    loadAllEntityRows({entity:WorkOrder,sort:'-updated_date',label:'Mechanic portal Fleet work orders'}),
    loadAllEntityRows({entity:Equipment,sort:'name',label:'Mechanic portal Fleet equipment'}),
    loadAllEntityRows({entity:Task,sort:'start_date',label:'Mechanic portal Fleet maintenance schedules'}),
    loadAllEntityRows({entity:Estimate,sort:'-updated_date',label:'Mechanic portal repair-estimate state'}),
  ]);
  const grantScope = scopeForGrant(grant);
  const allowedEquipmentIds = new Set(grantScope.allowed_equipment_ids);
  const scopedWorkOrders = grantScope.scope_mode === 'selected_equipment'
    ? workOrders.filter((row:any)=>allowedEquipmentIds.has(String(row.equipment_id || '')))
    : workOrders;
  const active = scopedWorkOrders.filter((row:any)=>ACTIVE.has(row.status));
  const completed = scopedWorkOrders.filter((row:any)=>row.status === 'completed').slice(0,30);
  const visible = [...active,...completed];
  const equipmentIds = new Set(visible.map((row:any)=>String(row.equipment_id || '')).filter(Boolean));
  const taskIds = new Set(visible.map((row:any)=>String(row.maintenance_task_id || '')).filter(Boolean));
  const canEstimate = Array.isArray(grant?.allowed_actions) && grant.allowed_actions.includes('estimate_submit');
  const repairEstimates:any[] = [];
  const approvalBlocks = new Map<string,{blocked:boolean;reason:string}>();
  for (const wo of visible) {
    const matches=(estimates||[]).filter((row:any)=>String(row.work_order_id||'')===String(wo.id));
    if (!matches.length) continue;
    if (matches.length>1) {
      repairEstimates.push({work_order_id:wo.id,visibility:'conflict',status:'conflict'});
      if (ACTIVE.has(wo.status)) approvalBlocks.set(String(wo.id),{blocked:true,reason:'CCS must resolve conflicting repair estimates before work can start.'});
      continue;
    }
    const estimate=matches[0];
    const ownedByGrant = estimate.estimate_source === 'mechanic_portal' && String(estimate.mechanic_access_id||'') === String(grant.id||'');
    if (ownedByGrant) repairEstimates.push({...sanitizeEstimate(estimate),visibility:'mechanic'});
    else repairEstimates.push({work_order_id:wo.id,visibility:estimate.estimate_source === 'mechanic_portal' ? 'other_mechanic' : 'ccs_managed',status:'managed'});
    if (ACTIVE.has(wo.status) && estimate.approval_required === true && estimate.status !== 'approved') {
      let reason = 'This job is waiting on CCS repair-estimate approval before work can start.';
      if (ownedByGrant) {
        if (estimate.status === 'draft') reason = 'Save and submit this repair estimate, then wait for CCS approval before starting work.';
        else if (estimate.status === 'changes_requested') reason = 'CCS requested changes to this repair estimate. Update and resubmit it before starting work.';
        else if (estimate.status === 'submitted') reason = 'This repair estimate is submitted and waiting for CCS approval before work can start.';
        else if (estimate.status === 'rejected') reason = 'CCS rejected this repair estimate. Contact CCS before starting work.';
      }
      approvalBlocks.set(String(wo.id),{blocked:true,reason});
    }
  }
  const publicWorkOrder = (row:any) => ({...sanitizeWorkOrder(row),approval_block:approvalBlocks.get(String(row.id)) || {blocked:false,reason:''}});
  return {
    success:true,
    portal:{name:grant?.name || 'External Mechanic',capabilities:{estimates:canEstimate}},
    active_work_orders:active.map(publicWorkOrder),
    recent_completed:completed.map(publicWorkOrder),
    equipment:equipment.filter((row:any)=>equipmentIds.has(String(row.id))).map(sanitizeEquipment),
    tasks:tasks.filter((row:any)=>taskIds.has(String(row.id))).map(sanitizeTask),
    repair_estimates:repairEstimates,
  };
}

function decodePhotos(raw: unknown) {
  if (raw == null) return { photos:[] as Uint8Array[], error:'' };
  if (!Array.isArray(raw) || raw.length > MAX_PHOTOS_PER_SAVE) return { photos:[] as Uint8Array[], error:`Attach no more than ${MAX_PHOTOS_PER_SAVE} photos at a time.` };
  const photos: Uint8Array[] = [];
  for (const item of raw) {
    if (String(item?.type || '').toLowerCase() !== 'image/jpeg') return {photos:[],error:'Mechanic portal photos must be JPEG images.'};
    const data = String(item?.data || '').trim();
    if (!data || data.length > MAX_PHOTO_B64_CHARS || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) return {photos:[],error:'Each photo must be a valid JPEG no larger than 1.2 MB.'};
    try {
      const binary = atob(data);
      const bytes = Uint8Array.from(binary,ch=>ch.charCodeAt(0));
      if (!bytes.length || bytes.length > MAX_PHOTO_BYTES || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) throw new Error('invalid jpeg');
      photos.push(bytes);
    } catch { return {photos:[],error:'One of the attached photos is invalid.'}; }
  }
  return {photos,error:''};
}

async function uploadPhotos(base44: any, photos: Uint8Array[]) {
  const urls: string[] = [];
  for (const bytes of photos) {
    const result = await base44.asServiceRole.integrations.Core.UploadFile({file:new Blob([bytes],{type:'image/jpeg'})});
    const url = String(result?.file_url || '').trim();
    if (!/^https:\/\//i.test(url)) throw new Error('Fleet mechanic photo upload failed.');
    urls.push(url);
  }
  return urls;
}

Deno.serve(async (req) => {
  try {
    const parsed = await readJson(req);
    if (parsed.error) return json({error:parsed.error},{status:parsed.status});
    const body:any = parsed.payload || {};
    const action = String(body?.action || '').trim();
    const base44 = createClientFromRequest(req);
    const Access = base44.asServiceRole.entities.FleetMechanicAccess;
    const Log = base44.asServiceRole.entities.FleetSystemLog;

    if (action.startsWith('admin_')) {
      const auth = await requireAdmin(base44);
      if (auth.error) return auth.error;

      if (action === 'admin_list_links') {
        const grants = await loadAllEntityRows({entity:Access,sort:'-created_date',label:'Fleet mechanic access links'});
        return json({success:true,links:(grants || []).map(publicGrant)});
      }

      if (action === 'admin_create_link') {
        const name = clean(body?.name || 'External Mechanic',80) || 'External Mechanic';
        const notes = clean(body?.notes,300);
        const expiryRaw = body?.expires_in_days;
        const expiryDays = expiryRaw == null || expiryRaw === '' ? 0 : Number(expiryRaw);
        if (!Number.isInteger(expiryDays) || expiryDays < 0 || expiryDays > 3650) return json({error:'Mechanic link expiration must be between 0 and 3650 days.'},{status:400});
        const expiresAt = expiryDays > 0 ? new Date(Date.now() + expiryDays * 86_400_000).toISOString() : '';
        const rawBytes = crypto.getRandomValues(new Uint8Array(32));
        const token = base64Url(rawBytes);
        const allowEstimates = body?.allow_estimates === true;
        const scopeMode = body?.scope_mode === 'selected_equipment' ? 'selected_equipment' : 'all_active';
        const requestedEquipmentIds = [...new Set((Array.isArray(body?.allowed_equipment_ids) ? body.allowed_equipment_ids : []).map((value:any)=>String(value||'').trim()).filter(Boolean))];
        if (scopeMode === 'selected_equipment') {
          if (!requestedEquipmentIds.length) return json({error:'Select at least one Fleet equipment item for a selected-equipment mechanic link.'},{status:400});
          const allEquipment = await loadAllEntityRows({entity:base44.asServiceRole.entities.FleetEquipment,sort:'name',label:'Fleet mechanic access scope validation'});
          const knownIds = new Set((allEquipment||[]).map((row:any)=>String(row.id||'')));
          const missing = requestedEquipmentIds.filter(id=>!knownIds.has(id));
          if (missing.length) return json({error:'One or more selected Fleet equipment records no longer exist. Refresh Fleet Settings and choose the scope again.'},{status:409});
        }
        const created = await Access.create({
          name,
          token_hash:await sha256(token),
          enabled:true,
          allowed_actions:['bootstrap','start','save',...(allowEstimates?['estimate_save','estimate_submit']:[])],
          scope_mode:scopeMode,
          allowed_equipment_ids:scopeMode === 'selected_equipment' ? requestedEquipmentIds : [],
          ...(expiresAt ? {expires_at:expiresAt} : {}),
          notes,
        });
        await Log.create({source:'fleetMechanicPortal',level:'info',message:'Standalone Fleet mechanic access link created.',details:{grant_id:created.id,name:created.name,created_by:auth.user.email || '',expires_at:expiresAt}}).catch(()=>null);
        return json({success:true,link:publicGrant(created),token});
      }

      if (action === 'admin_update_estimate_permission') {
        const id = String(body?.id || '').trim();
        const found = await Access.get(id).catch(()=>null);
        if (!found) return json({error:'Mechanic access link was not found.'},{status:404});
        const allowEstimates = body?.allow_estimates === true;
        const currentActions = Array.isArray(found.allowed_actions) && found.allowed_actions.length ? found.allowed_actions : ['bootstrap','start','save'];
        const retained = currentActions.filter((item:string)=>!['estimate_save','estimate_submit'].includes(item));
        const allowedActions = [...new Set([...retained,...(allowEstimates?['estimate_save','estimate_submit']:[])])];
        const updated = await Access.update(id,{allowed_actions:allowedActions});
        await Log.create({source:'fleetMechanicPortal',level:'info',message:`Standalone Fleet mechanic estimate permission ${allowEstimates?'enabled':'disabled'}.`,details:{grant_id:id,name:found.name || '',changed_by:auth.user.email || ''}}).catch(()=>null);
        return json({success:true,link:publicGrant(updated)});
      }

      if (action === 'admin_update_scope') {
        const id = String(body?.id || '').trim();
        const found = await Access.get(id).catch(()=>null);
        if (!found) return json({error:'Mechanic access link was not found.'},{status:404});
        const scopeMode = body?.scope_mode === 'selected_equipment' ? 'selected_equipment' : 'all_active';
        const requestedEquipmentIds = [...new Set((Array.isArray(body?.allowed_equipment_ids) ? body.allowed_equipment_ids : []).map((value:any)=>String(value||'').trim()).filter(Boolean))];
        if (scopeMode === 'selected_equipment') {
          if (!requestedEquipmentIds.length) return json({error:'Select at least one Fleet equipment item before saving a selected-equipment mechanic scope.'},{status:400});
          const allEquipment = await loadAllEntityRows({entity:base44.asServiceRole.entities.FleetEquipment,sort:'name',label:'Fleet mechanic access scope validation'});
          const knownIds = new Set((allEquipment||[]).map((row:any)=>String(row.id||'')));
          const missing = requestedEquipmentIds.filter(equipmentId=>!knownIds.has(equipmentId));
          if (missing.length) return json({error:'One or more selected Fleet equipment records no longer exist. Refresh Fleet Settings and choose the scope again.'},{status:409});
        }
        const updated = await Access.update(id,{scope_mode:scopeMode,allowed_equipment_ids:scopeMode === 'selected_equipment' ? requestedEquipmentIds : []});
        await Log.create({source:'fleetMechanicPortal',level:'info',message:'Standalone Fleet mechanic work scope updated.',details:{grant_id:id,name:found.name || '',scope_mode:scopeMode,equipment_count:scopeMode === 'selected_equipment' ? requestedEquipmentIds.length : 0,changed_by:auth.user.email || ''}}).catch(()=>null);
        return json({success:true,link:publicGrant(updated)});
      }

      if (action === 'admin_revoke_link') {
        const id = String(body?.id || '').trim();
        const found = await Access.get(id).catch(()=>null);
        if (!found) return json({error:'Mechanic access link was not found.'},{status:404});
        await Access.update(id,{enabled:false});
        await Log.create({source:'fleetMechanicPortal',level:'info',message:'Standalone Fleet mechanic access link revoked.',details:{grant_id:id,name:found.name || '',revoked_by:auth.user.email || ''}}).catch(()=>null);
        const grants = await loadAllEntityRows({entity:Access,sort:'-created_date',label:'Fleet mechanic access links'});
        return json({success:true,links:(grants || []).map(publicGrant)});
      }
      return json({error:'Unsupported Fleet mechanic admin action.'},{status:400});
    }

    const grant = await validateGrant(Access,body?.token);
    if (!grant) return json({error:'This mechanic portal link is invalid, expired, or revoked.'},{status:403});
    const allowed = new Set(Array.isArray(grant.allowed_actions) && grant.allowed_actions.length ? grant.allowed_actions : ['bootstrap','start','save']);
    if (!allowed.has(action)) return json({error:'This mechanic link is not allowed to perform that action.'},{status:403});
    await Access.update(grant.id,{last_used_at:nowIso()}).catch(()=>null);

    if (action === 'bootstrap') return json(await portalPayload(base44,grant));

    const WorkOrder = base44.asServiceRole.entities.FleetMaintenanceWorkOrder;
    const id = String(body?.work_order_id || '').trim();
    if (!id) return json({error:'Fleet work-order id is required.'},{status:400});
    const current = await WorkOrder.get(id).catch(()=>null);
    if (!current) return json({error:'Fleet work order was not found.'},{status:404});
    const grantScope = scopeForGrant(grant);
    if (grantScope.scope_mode === 'selected_equipment' && !new Set(grantScope.allowed_equipment_ids).has(String(current.equipment_id || ''))) {
      return json({error:'This Fleet work order is outside this mechanic link\'s allowed equipment scope.'},{status:403});
    }
    if (!ACTIVE.has(current.status)) return json({error:'Only active Fleet work orders can be changed from the mechanic portal.'},{status:409});
    const expected = String(body?.expected_updated_date || '').trim();
    if (!expected || expected !== String(current.updated_date || '')) return json({error:'This Fleet work order changed since it was opened. Refresh before saving.'},{status:409});

    if (action === 'estimate_save' || action === 'estimate_submit') {
      const Estimate = base44.asServiceRole.entities.FleetRepairEstimate;
      const EstimateCreateGate = base44.asServiceRole.entities.FleetRepairEstimateCreateGate;
      const Policy = base44.asServiceRole.entities.FleetRepairApprovalPolicy;
      const rows = await Estimate.filter({work_order_id:id});
      if (rows.length > 1) return json({error:'Multiple repair estimates exist for this work order. CCS must resolve them before the mechanic estimate can continue.'},{status:409});
      let estimate = rows[0] || null;
      if (estimate && (estimate.estimate_source !== 'mechanic_portal' || String(estimate.mechanic_access_id||'') !== String(grant.id||''))) {
        return json({error:'CCS or another mechanic already manages the estimate for this work order. This portal cannot view or overwrite that financial record.'},{status:409});
      }

      if (action === 'estimate_save') {
        if (estimate && !['draft','changes_requested'].includes(estimate.status)) return json({error:'This estimate is locked while submitted, approved, or rejected.'},{status:409});
        const patch = repairEstimatePatch(body?.estimate || {});
        const policy = await evaluateRepairApprovalPolicy(Policy,patch.estimated_total);
        if (!estimate) {
          const created = await createFleetRepairEstimateSafely({
            estimateEntity:Estimate,
            gateEntity:EstimateCreateGate,
            workOrderId:id,
            creationKey:`repair-estimate:${id}`,
            ownerSource:'mechanic_portal',
            ownerKey:String(grant.id||''),
            desired:{...patch,equipment_id:current.equipment_id||'',approval_required:policy.approval_required,approval_tier:policy.approval_tier,mechanic_name:clean(grant.name,80)},
          });
          estimate=created.estimate;
        } else {
          const estimateExpected=String(body?.estimate_expected_updated_date||'').trim();
          if(!estimateExpected)return json({error:'Estimate version is missing. Refresh before saving.'},{status:409});
          estimate=await updateFleetRecordIfCurrent({entity:Estimate,id:estimate.id,expectedUpdatedAt:estimateExpected,patch:{...patch,status:'draft',approval_required:policy.approval_required,approval_tier:policy.approval_tier,mechanic_name:clean(grant.name,80)},label:'Mechanic Fleet repair estimate'});
        }
        return json({success:true,estimate:sanitizeEstimate(estimate),policy});
      }

      if (!estimate) return json({error:'Save the mechanic estimate before submitting it.'},{status:404});
      if (!['draft','changes_requested'].includes(estimate.status)) return json({error:'Only a draft or changes-requested estimate can be submitted.'},{status:409});
      const estimateExpected=String(body?.estimate_expected_updated_date||'').trim();
      if(!estimateExpected)return json({error:'Estimate version is missing. Refresh before submitting.'},{status:409});
      const policy=await evaluateRepairApprovalPolicy(Policy,Number(estimate.estimated_total||0));
      const autoApproved=policy.approval_required===false;
      const updated=await updateFleetRecordIfCurrent({entity:Estimate,id:estimate.id,expectedUpdatedAt:estimateExpected,patch:{approval_required:policy.approval_required,approval_tier:policy.approval_tier,status:autoApproved?'approved':'submitted',submitted_by_email:'',submitted_at:nowIso(),mechanic_name:clean(grant.name,80),decision_by_email:autoApproved?'policy:auto':'',decision_at:autoApproved?nowIso():null,decision_notes:autoApproved?'Automatically approved by Fleet repair approval policy.':estimate.decision_notes||''},label:'Mechanic Fleet repair estimate submission'});
      await Log.create({source:'fleetMechanicPortal',level:'info',message:'External mechanic submitted Fleet repair estimate.',details:{grant_id:grant.id,mechanic_name:grant.name||'',work_order_id:id,estimate_id:updated.id,estimated_total:updated.estimated_total,status:updated.status}}).catch(()=>null);
      return json({success:true,estimate:sanitizeEstimate(updated),policy,auto_approved:autoApproved});
    }

    if (action === 'start') {
      const note = clean(body?.note,1200);
      const mechanicLine = note ? `[Mechanic – ${grant.name} – ${new Date().toLocaleString('en-US',{timeZone:'America/New_York'})} ET]\n${note}` : '';
      const notes = [current.notes,mechanicLine].filter(Boolean).join('\n\n');
      const result = await base44.asServiceRole.functions.invoke('fleetWorkOrderAction',{
        action:'update', id, expected_updated_date:expected,
        work_order:{status:'in_progress',started_date:current.started_date || todayEastern(),notes},
      });
      if (result?.data?.error) return json({error:result.data.error},{status:409});
      return json({success:true,work_order:sanitizeWorkOrder(result?.data?.work_order || await WorkOrder.get(id))});
    }

    if (action === 'save') {
      const actualHoursRaw = body?.actual_hours;
      const actualHours = actualHoursRaw === '' || actualHoursRaw == null ? current.actual_hours : Number(actualHoursRaw);
      if (actualHours != null && (!Number.isFinite(actualHours) || actualHours < 0 || actualHours > 10000)) return json({error:'Labor hours must be a valid non-negative number.'},{status:400});
      const correctiveAction = clean(body?.corrective_action,5000);
      const mechanicNote = clean(body?.mechanic_note,2000);
      const decoded = decodePhotos(body?.photos);
      if (decoded.error) return json({error:decoded.error},{status:400});
      const uploaded = decoded.photos.length ? await uploadPhotos(base44,decoded.photos) : [];
      const stamp = new Date().toLocaleString('en-US',{timeZone:'America/New_York'});
      const appended = mechanicNote ? `[Mechanic – ${grant.name} – ${stamp} ET]\n${mechanicNote}` : '';
      const notes = [current.notes,appended].filter(Boolean).join('\n\n');
      const afterPhotos = [...(Array.isArray(current.after_photos)?current.after_photos:[]),...uploaded];
      const result = await base44.asServiceRole.functions.invoke('fleetWorkOrderAction',{
        action:'update', id, expected_updated_date:expected,
        work_order:{actual_hours:actualHours,corrective_action:correctiveAction,notes,after_photos:afterPhotos},
      });
      if (result?.data?.error) return json({error:result.data.error},{status:409});
      return json({success:true,work_order:sanitizeWorkOrder(result?.data?.work_order || await WorkOrder.get(id))});
    }

    return json({error:'Unsupported mechanic portal action.'},{status:400});
  } catch (error:any) {
    console.error('fleetMechanicPortal error:',error);
    const status = error?.code === 'FLEET_RECORD_CONFLICT' ? 409 : 500;
    return json({error:error?.message || 'Fleet mechanic portal request failed.'},{status});
  }
});
