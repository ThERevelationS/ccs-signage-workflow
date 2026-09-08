import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const PRIORITIES = new Set(['low','medium','high','critical']);
const clean = (value: unknown, max: number) => String(value || '').trim().slice(0, max);
const canonical = (rows: any[] = []) => rows.slice().sort((a,b) => {
  const at = Date.parse(a?.created_date || '') || 0;
  const bt = Date.parse(b?.created_date || '') || 0;
  if (at !== bt) return at - bt;
  return String(a?.id || '').localeCompare(String(b?.id || ''));
})[0] || null;

function validToken(value: unknown) {
  const token = String(value || '').trim();
  return /^[A-Za-z0-9-]{8,80}$/.test(token) ? token : '';
}

function workOrderNumber(token: string) {
  const date = new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()).replaceAll('-','');
  const suffix = token.replaceAll('-','').slice(-8).toUpperCase();
  return `FWO-PUB-${date}-${suffix}`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json().catch(() => ({}));
    const action = String(payload?.action || '').trim();

    const settingsRows = await base44.asServiceRole.entities.FleetSettings.filter({setting_type:'general'});
    const settings = settingsRows?.[0];
    if (!settings?.public_reporting_enabled) {
      if (action === 'list') return Response.json({success:true,disabled:true,equipment:[]});
      return Response.json({error:'Public Fleet issue reporting is not currently enabled.'},{status:503});
    }

    const Equipment = base44.asServiceRole.entities.FleetEquipment;
    const WorkOrder = base44.asServiceRole.entities.FleetMaintenanceWorkOrder;

    if (action === 'list') {
      const equipment = await Equipment.list();
      return Response.json({
        success:true,
        disabled:false,
        equipment:(equipment || [])
          .filter((row:any)=>row.status !== 'retired')
          .map((row:any)=>({id:row.id,name:row.name,type:row.type}))
          .sort((a:any,b:any)=>String(a.name||'').localeCompare(String(b.name||'')))
      });
    }

    if (action !== 'submit') return Response.json({error:"Unknown action. Use 'list' or 'submit'."},{status:400});

    // Honeypot: automated submissions that fill this hidden field are accepted outwardly but discarded.
    if (String(payload?.company_website || '').trim()) return Response.json({success:true,accepted:true});

    const token = validToken(payload?.submission_token);
    const equipmentId = clean(payload?.equipment_id,80);
    const title = clean(payload?.title,120);
    const description = clean(payload?.description,2000);
    const reporterName = clean(payload?.reporter_name,120);
    const reporterContact = clean(payload?.reporter_contact,200);
    const priority = PRIORITIES.has(String(payload?.priority || '')) ? String(payload.priority) : 'high';

    if (!token || !equipmentId || !title) return Response.json({error:'Equipment, issue title, and submission token are required.'},{status:400});

    const equipment = await Equipment.get(equipmentId).catch(()=>null);
    if (!equipment || equipment.status === 'retired') return Response.json({error:'Selected Fleet equipment is not available for public reporting.'},{status:404});

    const submissionKey = `fleetpublic:${token}`;
    const existing = canonical(await WorkOrder.filter({public_submission_key:submissionKey}));
    if (existing) return Response.json({success:true,reused:true,id:existing.id,work_order_number:existing.work_order_number});

    const created = await WorkOrder.create({
      work_order_number:workOrderNumber(token),
      equipment_id:equipment.id,
      title,
      description,
      type:'emergency',
      priority,
      status:'open',
      notes:'Submitted through the CCS Fleet public issue form.',
      public_submission_key:submissionKey,
      public_reported_at:new Date().toISOString(),
      public_reporter_name:reporterName,
      public_reporter_contact:reporterContact,
    });

    // Collapse practical concurrent retries without requiring a unique database index.
    await new Promise(resolve=>setTimeout(resolve,75));
    const winner = canonical(await WorkOrder.filter({public_submission_key:submissionKey})) || created;
    if (winner.id !== created.id) await WorkOrder.delete(created.id).catch(()=>null);

    await base44.asServiceRole.functions.invoke('fleetNotificationDispatcher',{
      event_type:'work_order_created',
      target_id:winner.id,
      event_token:submissionKey,
    }).catch(()=>null);

    return Response.json({success:true,reused:winner.id !== created.id,id:winner.id,work_order_number:winner.work_order_number});
  } catch (error) {
    console.error('fleetPublicIssueReport error:',error);
    return Response.json({error:error?.message || 'Fleet issue report could not be submitted.'},{status:500});
  }
});