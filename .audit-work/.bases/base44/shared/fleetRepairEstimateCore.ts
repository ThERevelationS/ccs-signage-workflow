import { loadAllEntityRows } from './pagedEntityRows.ts';

const norm = (value: unknown) => String(value ?? '').trim();
const nonNegative = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

export function normalizedRepairEstimateLines(lines:any, fluid=false) {
  if (!Array.isArray(lines)) return [];
  return lines.map((line:any)=>({
    description:norm(line?.description),
    quantity:nonNegative(line?.quantity,0),
    ...(fluid ? {unit:norm(line?.unit)} : {}),
    estimated_cost:nonNegative(line?.estimated_cost,0),
  })).filter((line:any)=>line.description || line.quantity || line.estimated_cost);
}

export function repairEstimateTotals(source:any) {
  const laborHours = nonNegative(source?.estimated_labor_hours,0);
  const laborRate = nonNegative(source?.labor_rate,0);
  const parts = normalizedRepairEstimateLines(source?.parts_estimate,false);
  const fluids = normalizedRepairEstimateLines(source?.fluids_estimate,true);
  const partsTotal = parts.reduce((sum:number,line:any)=>sum + line.quantity * line.estimated_cost,0);
  const fluidsTotal = fluids.reduce((sum:number,line:any)=>sum + line.quantity * line.estimated_cost,0);
  const misc = nonNegative(source?.misc_total,0);
  const total = laborHours * laborRate + partsTotal + fluidsTotal + misc;
  return {laborHours,laborRate,parts,fluids,partsTotal,fluidsTotal,misc,total};
}

export function repairEstimatePatch(source:any) {
  const calc = repairEstimateTotals(source);
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

export async function evaluateRepairApprovalPolicy(Policy:any,total:number) {
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
