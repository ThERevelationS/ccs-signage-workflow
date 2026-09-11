import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { loadAllEntityRows } from '../../shared/pagedEntityRows.ts';
import { updateFleetRecordIfCurrent } from '../../shared/fleetRecordPersistence.ts';

const ACTIVE = new Set(['open','assigned','in_progress']);
const MAX_BODY_BYTES = 5_500_000;
const MAX_PHOTOS_PER_SAVE = 3;
const MAX_PHOTO_BYTES = 1_200_000;
const MAX_PHOTO_B64_CHARS = Math.ceil(MAX_PHOTO_BYTES / 3) * 4 + 16;
const clean = (value: unknown, max: number) => String(value ?? '').trim().slice(0, max);
const nowIso = () => new Date().toISOString();
const todayEastern = () => new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());

function base64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2,'0')).join('');
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
  if (!user?.email) return { error:Response.json({error:'Unauthorized'},{status:401}) };
  if (user.role === 'admin') return { user };
  const rows = await base44.asServiceRole.entities.AuthorizedEmail.filter({email:user.email});
  if (rows?.[0]?.role !== 'admin') return { error:Response.json({error:'Fleet mechanic link management requires a CCS admin.'},{status:403}) };
  return { user };
}

async function getFleetSettings(base44: any) {
  const rows = await base44.asServiceRole.entities.FleetSettings.filter({setting_type:'general'});
  return rows?.[0] || (await base44.asServiceRole.entities.FleetSettings.list('-updated_date',1))?.[0] || null;
}

const publicGrant = (row: any) => ({
  id: String(row?.id || ''),
  name: String(row?.name || 'External Mechanic'),
  enabled: row?.enabled !== false,
  created_at: row?.created_at || '',
  created_by: row?.created_by || '',
  expires_at: row?.expires_at || '',
  last_used_at: row?.last_used_at || '',
  notes: row?.notes || '',
});

async function validateGrant(settings: any, token: unknown) {
  const raw = String(token || '').trim();
  if (raw.length < 40 || raw.length > 200 || !/^[A-Za-z0-9_-]+$/.test(raw)) return null;
  const hash = await sha256(raw);
  const now = Date.now();
  return (settings?.mechanic_access_links || []).find((row: any) => {
    if (row?.enabled === false || String(row?.token_hash || '') !== hash) return false;
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
    next_service_due:row.next_service_due || '', photo_url:row.photo_url || '', notes:row.notes || '',
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

function sanitizeTask(row: any) {
  return {
    id:row.id, title:row.title || '', description:row.description || '', type:row.type || '', priority:row.priority || '',
    frequency:row.frequency || '', estimated_duration:row.estimated_duration ?? null, start_date:row.start_date || '', status:row.status || '',
    parts_needed:Array.isArray(row.parts_needed)?row.parts_needed:[], fluids_needed:Array.isArray(row.fluids_needed)?row.fluids_needed:[],
  };
}

async function portalPayload(base44: any, grant: any) {
  const WorkOrder = base44.asServiceRole.entities.FleetMaintenanceWorkOrder;
  const Equipment = base44.asServiceRole.entities.FleetEquipment;
  const Task = base44.asServiceRole.entities.FleetMaintenanceTask;
  const [workOrders,equipment,tasks] = await Promise.all([
    loadAllEntityRows({entity:WorkOrder,sort:'-updated_date',label:'Mechanic portal Fleet work orders'}),
    loadAllEntityRows({entity:Equipment,sort:'name',label:'Mechanic portal Fleet equipment'}),
    loadAllEntityRows({entity:Task,sort:'start_date',label:'Mechanic portal Fleet maintenance schedules'}),
  ]);
  const active = workOrders.filter((row:any)=>ACTIVE.has(row.status));
  const completed = workOrders.filter((row:any)=>row.status === 'completed').slice(0,30);
  const visible = [...active,...completed];
  const equipmentIds = new Set(visible.map((row:any)=>String(row.equipment_id || '')).filter(Boolean));
  const taskIds = new Set(visible.map((row:any)=>String(row.maintenance_task_id || '')).filter(Boolean));
  return {
    success:true,
    portal:{name:grant?.name || 'External Mechanic'},
    active_work_orders:active.map(sanitizeWorkOrder),
    recent_completed:completed.map(sanitizeWorkOrder),
    equipment:equipment.filter((row:any)=>equipmentIds.has(String(row.id))).map(sanitizeEquipment),
    tasks:tasks.filter((row:any)=>taskIds.has(String(row.id))).map(sanitizeTask),
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
    if (parsed.error) return Response.json({error:parsed.error},{status:parsed.status});
    const body:any = parsed.payload || {};
    const action = String(body?.action || '').trim();
    const base44 = createClientFromRequest(req);
    const Settings = base44.asServiceRole.entities.FleetSettings;
    const Log = base44.asServiceRole.entities.FleetSystemLog;

    if (action.startsWith('admin_')) {
      const auth = await requireAdmin(base44);
      if (auth.error) return auth.error;
      const settings = await getFleetSettings(base44);
      if (!settings?.id) return Response.json({error:'FleetSettings general record was not found.'},{status:404});
      const grants = Array.isArray(settings.mechanic_access_links) ? settings.mechanic_access_links : [];

      if (action === 'admin_list_links') return Response.json({success:true,links:grants.map(publicGrant)});

      if (action === 'admin_create_link') {
        const name = clean(body?.name || 'External Mechanic',80) || 'External Mechanic';
        const notes = clean(body?.notes,300);
        const rawBytes = crypto.getRandomValues(new Uint8Array(32));
        const token = base64Url(rawBytes);
        const grant = {
          id:crypto.randomUUID(), name, token_hash:await sha256(token), enabled:true,
          created_at:nowIso(), created_by:auth.user.email || '', expires_at:'', last_used_at:'', notes,
        };
        await updateFleetRecordIfCurrent({entity:Settings,id:settings.id,expectedUpdatedAt:String(settings.updated_date || ''),patch:{mechanic_access_links:[...grants,grant]},label:'Fleet mechanic access links'});
        await Log.create({source:'fleetMechanicPortal',level:'info',message:'Standalone Fleet mechanic access link created.',details:{grant_id:grant.id,name:grant.name,created_by:grant.created_by}}).catch(()=>null);
        return Response.json({success:true,link:publicGrant(grant),token});
      }

      if (action === 'admin_revoke_link') {
        const id = String(body?.id || '').trim();
        const found = grants.find((row:any)=>String(row?.id || '') === id);
        if (!found) return Response.json({error:'Mechanic access link was not found.'},{status:404});
        const next = grants.map((row:any)=>String(row?.id || '') === id ? {...row,enabled:false} : row);
        await updateFleetRecordIfCurrent({entity:Settings,id:settings.id,expectedUpdatedAt:String(settings.updated_date || ''),patch:{mechanic_access_links:next},label:'Fleet mechanic access links'});
        await Log.create({source:'fleetMechanicPortal',level:'info',message:'Standalone Fleet mechanic access link revoked.',details:{grant_id:id,name:found.name || '',revoked_by:auth.user.email || ''}}).catch(()=>null);
        return Response.json({success:true,links:next.map(publicGrant)});
      }
      return Response.json({error:'Unsupported Fleet mechanic admin action.'},{status:400});
    }

    const settings = await getFleetSettings(base44);
    const grant = await validateGrant(settings,body?.token);
    if (!grant) return Response.json({error:'This mechanic portal link is invalid, expired, or revoked.'},{status:403});

    if (action === 'bootstrap') return Response.json(await portalPayload(base44,grant));

    const WorkOrder = base44.asServiceRole.entities.FleetMaintenanceWorkOrder;
    const id = String(body?.work_order_id || '').trim();
    if (!id) return Response.json({error:'Fleet work-order id is required.'},{status:400});
    const current = await WorkOrder.get(id).catch(()=>null);
    if (!current) return Response.json({error:'Fleet work order was not found.'},{status:404});
    if (!ACTIVE.has(current.status)) return Response.json({error:'Only active Fleet work orders can be changed from the mechanic portal.'},{status:409});
    const expected = String(body?.expected_updated_date || '').trim();
    if (!expected || expected !== String(current.updated_date || '')) return Response.json({error:'This Fleet work order changed since it was opened. Refresh before saving.'},{status:409});

    if (action === 'start') {
      const note = clean(body?.note,1200);
      const mechanicLine = note ? `[Mechanic – ${grant.name} – ${new Date().toLocaleString('en-US',{timeZone:'America/New_York'})} ET]\n${note}` : '';
      const notes = [current.notes,mechanicLine].filter(Boolean).join('\n\n');
      const result = await base44.asServiceRole.functions.invoke('fleetWorkOrderAction',{
        action:'update', id, expected_updated_date:expected,
        work_order:{status:'in_progress',started_date:current.started_date || todayEastern(),notes},
      });
      if (result?.data?.error) return Response.json({error:result.data.error},{status:409});
      return Response.json({success:true,work_order:sanitizeWorkOrder(result?.data?.work_order || await WorkOrder.get(id))});
    }

    if (action === 'save') {
      const actualHoursRaw = body?.actual_hours;
      const actualHours = actualHoursRaw === '' || actualHoursRaw == null ? current.actual_hours : Number(actualHoursRaw);
      if (actualHours != null && (!Number.isFinite(actualHours) || actualHours < 0 || actualHours > 10000)) return Response.json({error:'Labor hours must be a valid non-negative number.'},{status:400});
      const correctiveAction = clean(body?.corrective_action,5000);
      const mechanicNote = clean(body?.mechanic_note,2000);
      const decoded = decodePhotos(body?.photos);
      if (decoded.error) return Response.json({error:decoded.error},{status:400});
      const uploaded = decoded.photos.length ? await uploadPhotos(base44,decoded.photos) : [];
      const stamp = new Date().toLocaleString('en-US',{timeZone:'America/New_York'});
      const appended = mechanicNote ? `[Mechanic – ${grant.name} – ${stamp} ET]\n${mechanicNote}` : '';
      const notes = [current.notes,appended].filter(Boolean).join('\n\n');
      const afterPhotos = [...(Array.isArray(current.after_photos)?current.after_photos:[]),...uploaded];
      const result = await base44.asServiceRole.functions.invoke('fleetWorkOrderAction',{
        action:'update', id, expected_updated_date:expected,
        work_order:{actual_hours:actualHours,corrective_action:correctiveAction,notes,after_photos:afterPhotos},
      });
      if (result?.data?.error) return Response.json({error:result.data.error},{status:409});
      return Response.json({success:true,work_order:sanitizeWorkOrder(result?.data?.work_order || await WorkOrder.get(id))});
    }

    return Response.json({error:'Unsupported mechanic portal action.'},{status:400});
  } catch (error:any) {
    console.error('fleetMechanicPortal error:',error);
    const status = error?.code === 'FLEET_RECORD_CONFLICT' ? 409 : 500;
    return Response.json({error:error?.message || 'Fleet mechanic portal request failed.'},{status});
  }
});
