import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { loadAllEntityRows } from '../../shared/pagedEntityRows.ts';
import { updateFleetRecordIfCurrent } from '../../shared/fleetRecordPersistence.ts';

const norm = (value: unknown) => String(value ?? '').trim();
const nonNegative = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};
const nowIso = () => new Date().toISOString();
const canonical = (rows:any[]=[]) => rows.slice().sort((a,b)=>String(a.id||'').localeCompare(String(b.id||'')))[0] || null;

async function requireAdmin(base44:any) {
  const user = await base44.auth.me().catch(()=>null);
  if (!user?.email) return { error: Response.json({error:'Unauthorized'},{status:401}) };
  if (user.role === 'admin') return { user };
  const rows = await base44.asServiceRole.entities.AuthorizedEmail.filter({email:user.email});
  if (rows?.[0]?.role !== 'admin') return { error: Response.json({error:'Fleet repair estimates and approval policies require a CCS admin.'},{status:403}) };
  return { user };
}

function normalizedLines(lines:any, fluid=false) {
  if (!Array.isArray(lines)) return [];
  return lines.map((line:any)=>({
    description:norm(line?.description),
    quantity:nonNegative(line?.quantity,0),
    ...(fluid ? {unit:norm(line?.unit)} : {}),
    estimated_cost:nonNegative(line?.estimated_cost,0),
  })).filter((line:any)=>line.description || line.quantity || line.estimated_cost);
}

function totals(source:any) {
  const laborHours = nonNegative(source?.estimated_labor_hours,0);
  const laborRate = nonNegative(source?.labor_rate,0);
  const parts = normalizedLines(source?.parts_estimate,false);
  const fluids = normalizedLines(source?.fluids_estimate,true);
  const partsTotal = parts.reduce((sum:number,line:any)=>sum + line.quantity * line.estimated_cost,0);
  const fluidsTotal = fluids.reduce((sum:number,line:any)=>sum + line.quantity * line.estimated_cost,0);
  const misc = nonNegative(source?.misc_total,0);
  const total = laborHours * laborRate + partsTotal + fluidsTotal + misc;
  return {laborHours,laborRate,parts,fluids,partsTotal,fluidsTotal,misc,total};
}

async function evaluatePolicy(Policy:any,total:number) {
  const policies = (await loadAllEntityRows({entity:Policy,sort:'sort_order',label:'Fleet repair approval policies'}))
    .filter((row:any)=>row.enabled !== false)
    .sort((a:any,b:any)=>Number(b.minimum_amount||0)-Number(a.minimum_amount||0));
  const match = policies.find((row:any)=>{
    const min = nonNegative(row.minimum_amount,0);
    const max = row.maximum_amount == null ? null : Number(row.maximum_amount);
    return total >= min && (max == null || !Number.isFinite(max) || max <= 0 || total <= max);
  }) || null;
  return match ? {approval_required:match.approval_required !== false,approval_tier:norm(match.approval_tier || match.name),policy_id:match.id,policy_name:match.name} : {approval_required:false,approval_tier:'',policy_id:'',policy_name:''};
}

function estimatePatch(source:any) {
  const calc = totals(source);
  return {
    estimated_labor_hours:calc.laborHours,
    labor_rate:calc.laborRate,
    estimated_parts_total:calc.partsTotal,
    estimated_fluids_total:calc.fluidsTotal,
    misc_total:calc.misc,
    estimated_total:calc.total,
    estimated_completion_date:norm(source?.estimated_completion_date),
    parts_estimate:calc.parts,
    fluids_estimate:calc.fluids,
    notes:norm(source?.notes),
  };
}

Deno.serve(async req => {
  try {
    const base44 = createClientFromRequest(req);
    const auth = await requireAdmin(base44);
    if (auth.error) return auth.error;
    const user = auth.user;
    const body = await req.json().catch(()=>({}));
    const action = norm(body?.action);
    const Estimate = base44.asServiceRole.entities.FleetRepairEstimate;
    const Policy = base44.asServiceRole.entities.FleetRepairApprovalPolicy;
    const WorkOrder = base44.asServiceRole.entities.FleetMaintenanceWorkOrder;

    if (action === 'policy_list') {
      const rows = await loadAllEntityRows({entity:Policy,sort:'sort_order',label:'Fleet repair approval policies'});
      return Response.json({success:true,policies:rows});
    }
    if (action === 'policy_create') {
      const creationKey = norm(body?.creation_key);
      if (!creationKey || creationKey.length < 12 || /\s/.test(creationKey)) return Response.json({error:'Approval-policy create identity is missing or invalid.'},{status:409});
      const row = body?.policy || {};
      const minimum = nonNegative(row.minimum_amount,0);
      const maximum = row.maximum_amount === '' || row.maximum_amount == null ? null : Number(row.maximum_amount);
      if (maximum != null && maximum !== 0 && (!Number.isFinite(maximum) || maximum < minimum)) return Response.json({error:'Maximum amount must be blank/0 for open-ended, or greater than/equal to the minimum amount.'},{status:400});
      const desired = {name:norm(row.name),enabled:row.enabled!==false,minimum_amount:minimum,...(maximum==null?{}:{maximum_amount:maximum}),approval_tier:norm(row.approval_tier||row.name),approval_required:row.approval_required!==false,approver_role:'admin',notes:norm(row.notes),sort_order:Number.isFinite(Number(row.sort_order))?Number(row.sort_order):0,creation_key:creationKey};
      if (!desired.name) return Response.json({error:'Policy name is required.'},{status:400});
      const existing = canonical(await Policy.filter({creation_key:creationKey}));
      if (existing) return Response.json({success:true,reused:true,policy:existing});
      const created = await Policy.create(desired);
      return Response.json({success:true,policy:created});
    }
    if (action === 'policy_update') {
      const id = norm(body?.id);
      const expected = norm(body?.expected_updated_date);
      const existing = id ? await Policy.get(id).catch(()=>null) : null;
      if (!existing) return Response.json({error:'Approval policy was not found.'},{status:404});
      if (!expected) return Response.json({error:'Approval-policy version is missing. Reload before saving.'},{status:409});
      const row = body?.policy || {};
      const minimum = Object.prototype.hasOwnProperty.call(row,'minimum_amount') ? nonNegative(row.minimum_amount,0) : existing.minimum_amount;
      const maximum = Object.prototype.hasOwnProperty.call(row,'maximum_amount') ? (row.maximum_amount === '' || row.maximum_amount == null ? null : Number(row.maximum_amount)) : existing.maximum_amount;
      if (maximum != null && maximum !== 0 && (!Number.isFinite(maximum) || Number(maximum) < Number(minimum))) return Response.json({error:'Maximum amount must be blank/0 for open-ended, or greater than/equal to the minimum amount.'},{status:400});
      const patch:any = {name:norm(row.name ?? existing.name),enabled:row.enabled ?? existing.enabled,minimum_amount:Number(minimum),approval_tier:norm(row.approval_tier ?? existing.approval_tier ?? existing.name),approval_required:row.approval_required ?? existing.approval_required,approver_role:'admin',notes:norm(row.notes ?? existing.notes),sort_order:Number.isFinite(Number(row.sort_order))?Number(row.sort_order):Number(existing.sort_order||0)};
      patch.maximum_amount = maximum == null ? 0 : Number(maximum);
      const updated = await updateFleetRecordIfCurrent({entity:Policy,id,expectedUpdatedAt:expected,patch,label:'Fleet repair approval policy'});
      return Response.json({success:true,policy:updated});
    }
    if (action === 'policy_delete') {
      const id = norm(body?.id);
      if (!id) return Response.json({error:'Approval policy id is required.'},{status:400});
      await Policy.delete(id);
      return Response.json({success:true,deleted:true});
    }

    const workOrderId = norm(body?.work_order_id || (action === 'get' ? body?.id : '') || body?.estimate?.work_order_id);
    if (action === 'get') {
      const rows = workOrderId ? await Estimate.filter({work_order_id:workOrderId}) : [];
      if (rows.length > 1) return Response.json({error:'Multiple Fleet repair estimates exist for this work order. Resolve the duplicate records before continuing.'},{status:409});
      return Response.json({success:true,estimate:rows[0]||null});
    }

    const wo = workOrderId ? await WorkOrder.get(workOrderId).catch(()=>null) : null;
    if (!wo) return Response.json({error:'Fleet maintenance work order was not found.'},{status:404});
    if (['completed','cancelled'].includes(wo.status) && ['save','submit'].includes(action)) return Response.json({error:'Completed or cancelled Fleet work orders cannot receive a new or changed repair estimate.'},{status:409});
    const rows = await Estimate.filter({work_order_id:wo.id});
    if (rows.length > 1) return Response.json({error:'Multiple Fleet repair estimates exist for this work order. Resolve the duplicate records before continuing.'},{status:409});
    let estimate = rows[0] || null;

    if (action === 'save') {
      const patch = estimatePatch(body?.estimate || body);
      const policy = await evaluatePolicy(Policy,patch.estimated_total);
      if (!estimate) {
        estimate = await Estimate.create({...patch,work_order_id:wo.id,equipment_id:wo.equipment_id||'',status:'draft',approval_required:policy.approval_required,approval_tier:policy.approval_tier,creation_key:`repair-estimate:${wo.id}`});
      } else {
        const expected = norm(body?.expected_updated_date);
        if (!expected) return Response.json({error:'Repair-estimate version is missing. Reload before saving.'},{status:409});
        estimate = await updateFleetRecordIfCurrent({entity:Estimate,id:estimate.id,expectedUpdatedAt:expected,patch:{...patch,status:'draft',approval_required:policy.approval_required,approval_tier:policy.approval_tier,submitted_by_email:'',submitted_at:null,decision_by_email:'',decision_at:null,decision_notes:''},label:'Fleet repair estimate'});
      }
      return Response.json({success:true,estimate,policy});
    }

    if (!estimate) return Response.json({error:'Create the Fleet repair estimate before submitting or deciding it.'},{status:404});
    if (action === 'submit') {
      const policy = await evaluatePolicy(Policy,Number(estimate.estimated_total||0));
      const expected = norm(body?.expected_updated_date);
      if (!expected) return Response.json({error:'Repair-estimate version is missing. Reload before submitting.'},{status:409});
      const autoApproved = policy.approval_required === false;
      const updated = await updateFleetRecordIfCurrent({entity:Estimate,id:estimate.id,expectedUpdatedAt:expected,patch:{approval_required:policy.approval_required,approval_tier:policy.approval_tier,status:autoApproved?'approved':'submitted',submitted_by_email:user.email||'',submitted_at:nowIso(),decision_by_email:autoApproved?'policy:auto':'',decision_at:autoApproved?nowIso():null,decision_notes:autoApproved?'Automatically approved by Fleet repair approval policy.':''},label:'Fleet repair estimate submission'});
      return Response.json({success:true,estimate:updated,policy,auto_approved:autoApproved});
    }
    if (action === 'decide') {
      const decision = norm(body?.decision);
      if (!['approved','rejected','changes_requested'].includes(decision)) return Response.json({error:'Decision must be approved, rejected, or changes_requested.'},{status:400});
      const expected = norm(body?.expected_updated_date);
      if (!expected) return Response.json({error:'Repair-estimate version is missing. Reload before deciding.'},{status:409});
      if (estimate.status !== 'submitted' && !(decision === 'approved' && estimate.status === 'changes_requested')) return Response.json({error:'Only a submitted estimate can receive this approval decision.'},{status:409});
      const updated = await updateFleetRecordIfCurrent({entity:Estimate,id:estimate.id,expectedUpdatedAt:expected,patch:{status:decision,decision_by_email:user.email||'',decision_at:nowIso(),decision_notes:norm(body?.decision_notes)},label:'Fleet repair estimate decision'});
      return Response.json({success:true,estimate:updated});
    }

    return Response.json({error:'Unsupported Fleet repair-estimate action.'},{status:400});
  } catch (error:any) {
    console.error('fleetRepairEstimateAction error:',error);
    if (error?.code === 'FLEET_RECORD_CONFLICT') return Response.json({error:error.message},{status:409});
    return Response.json({error:error?.message || 'Fleet repair-estimate operation failed.'},{status:500});
  }
});
