import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const PRIORITIES = new Set(['low','medium','high','critical']);
const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_MAX_ACCEPTED = 5;
const MAX_PUBLIC_PHOTOS = 3;
const MAX_PUBLIC_PHOTO_BYTES = 1_200_000;
const MAX_PUBLIC_PHOTO_B64_CHARS = Math.ceil(MAX_PUBLIC_PHOTO_BYTES / 3) * 4 + 16;
const MAX_PUBLIC_BODY_BYTES = 5_500_000;
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

function decodePublicPhotos(raw: unknown) {
  if (raw == null) return { photos: [] as Uint8Array[], error: '' };
  if (!Array.isArray(raw)) return { photos: [] as Uint8Array[], error: 'Photos must be provided as a list.' };
  if (raw.length > MAX_PUBLIC_PHOTOS) return { photos: [] as Uint8Array[], error: `A maximum of ${MAX_PUBLIC_PHOTOS} photos may be attached.` };

  const photos: Uint8Array[] = [];
  for (const item of raw) {
    const mime = String(item?.type || '').toLowerCase();
    const data = String(item?.data || '').trim();
    if (mime !== 'image/jpeg') return { photos: [] as Uint8Array[], error: 'Public Fleet photos must be JPEG images.' };
    if (!data || data.length > MAX_PUBLIC_PHOTO_B64_CHARS || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) {
      return { photos: [] as Uint8Array[], error: `Each photo must be a valid JPEG no larger than ${Math.round(MAX_PUBLIC_PHOTO_BYTES / 100_000) / 10} MB.` };
    }
    let bytes: Uint8Array;
    try {
      const binary = atob(data);
      bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0));
    } catch {
      return { photos: [] as Uint8Array[], error: 'One of the attached photos could not be decoded.' };
    }
    if (!bytes.length || bytes.length > MAX_PUBLIC_PHOTO_BYTES || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
      return { photos: [] as Uint8Array[], error: `Each photo must be a valid JPEG no larger than ${Math.round(MAX_PUBLIC_PHOTO_BYTES / 100_000) / 10} MB.` };
    }
    photos.push(bytes);
  }
  return { photos, error: '' };
}

async function uploadPublicPhotos(base44: any, photos: Uint8Array[]) {
  const urls: string[] = [];
  let failed = 0;
  for (const bytes of photos) {
    try {
      const result = await base44.asServiceRole.integrations.Core.UploadFile({ file: new Blob([bytes], { type: 'image/jpeg' }) });
      const url = String(result?.file_url || '').trim();
      if (!/^https:\/\//i.test(url)) throw new Error('Base44 storage did not return a valid HTTPS URL.');
      urls.push(url);
    } catch (error) {
      failed++;
      console.error('fleetPublicIssueReport photo upload failed:', error);
    }
  }
  return { urls, failed };
}

function samePublicSubmission(existing: any, input: any) {
  return String(existing?.equipment_id || '') === input.equipmentId
    && String(existing?.title || '') === input.title
    && String(existing?.description || '') === input.description
    && String(existing?.priority || '') === input.priority
    && String(existing?.public_reporter_name || '') === input.reporterName
    && String(existing?.public_reporter_contact || '') === input.reporterContact;
}

function workOrderNumber(token: string) {
  const date = new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()).replaceAll('-','');
  const suffix = token.replaceAll('-','').slice(-8).toUpperCase();
  return `FWO-PUB-${date}-${suffix}`;
}

const toHex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes)).map((b)=>b.toString(16).padStart(2,'0')).join('');
async function requestFingerprint(req: Request) {
  const cfIp = String(req.headers.get('cf-connecting-ip') || '').trim();
  const realIp = String(req.headers.get('x-real-ip') || '').trim();
  const xff = String(req.headers.get('x-forwarded-for') || '').split(',').map(v=>v.trim()).filter(Boolean);
  const networkOrigin = cfIp || realIp || xff.at(-1) || '';
  if (!networkOrigin) return '';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(networkOrigin));
  return toHex(digest);
}

async function consumeThrottle(base44:any, req:Request) {
  const fingerprint = await requestFingerprint(req);
  if (!fingerprint) return {limited:false,tracked:false};
  const Throttle = base44.asServiceRole.entities.FleetPublicReportThrottle;
  const now = new Date();
  const rows = await Throttle.filter({fingerprint_hash:fingerprint});
  let row = canonical(rows);

  if (!row) {
    const created = await Throttle.create({fingerprint_hash:fingerprint,window_started_at:now.toISOString(),accepted_count:1,last_seen_at:now.toISOString()});
    await new Promise(resolve=>setTimeout(resolve,50));
    const contenders = await Throttle.filter({fingerprint_hash:fingerprint});
    row = canonical(contenders) || created;
    for (const duplicate of contenders || []) {
      if (duplicate.id !== row.id) await Throttle.delete(duplicate.id).catch(()=>null);
    }
    if (row.id !== created.id) {
      const started = Date.parse(row.window_started_at || '') || 0;
      if (!started || now.getTime() - started >= RATE_WINDOW_MS) {
        await Throttle.update(row.id,{window_started_at:now.toISOString(),accepted_count:1,last_seen_at:now.toISOString()});
        return {limited:false,tracked:true};
      }
      const count = Number(row.accepted_count || 0);
      if (count >= RATE_MAX_ACCEPTED) {
        await Throttle.update(row.id,{last_seen_at:now.toISOString()});
        return {limited:true,tracked:true};
      }
      await Throttle.update(row.id,{accepted_count:count+1,last_seen_at:now.toISOString()});
    }
    return {limited:false,tracked:true};
  }

  const started = Date.parse(row.window_started_at || '') || 0;
  if (!started || now.getTime() - started >= RATE_WINDOW_MS) {
    await Throttle.update(row.id,{window_started_at:now.toISOString(),accepted_count:1,last_seen_at:now.toISOString()});
    return {limited:false,tracked:true};
  }
  const count = Number(row.accepted_count || 0);
  if (count >= RATE_MAX_ACCEPTED) {
    await Throttle.update(row.id,{last_seen_at:now.toISOString()});
    return {limited:true,tracked:true};
  }
  await Throttle.update(row.id,{accepted_count:count+1,last_seen_at:now.toISOString()});
  return {limited:false,tracked:true};
}

Deno.serve(async (req) => {
  try {
    const contentLength = Number(req.headers.get('content-length') || 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_PUBLIC_BODY_BYTES) {
      return Response.json({ error: 'Public Fleet issue report payload is too large.' }, { status: 413 });
    }

    const base44 = createClientFromRequest(req);
    const payload = await req.json().catch(() => ({}));
    const action = String(payload?.action || '').trim();

    const cutoverRows = await base44.asServiceRole.entities.FleetCutoverState.filter({state_key:'primary'});
    const cutover = cutoverRows?.[0];
    if (!cutover?.public_reporting_enabled) {
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
    const retryIdentity = { equipmentId: equipment.id, title, description, priority, reporterName, reporterContact };
    const existing = canonical(await WorkOrder.filter({public_submission_key:submissionKey}));
    if (existing) {
      if (!samePublicSubmission(existing, retryIdentity)) {
        return Response.json({error:'This submission token is already associated with a different Fleet issue report.'},{status:409});
      }
      const photoValidation = decodePublicPhotos(payload?.photos);
      if (photoValidation.error) return Response.json({error:photoValidation.error},{status:400});
      let photoWarning = '';
      if (photoValidation.photos.length && !(existing.problem_photos || []).length) {
        const uploaded = await uploadPublicPhotos(base44, photoValidation.photos);
        if (uploaded.urls.length) await WorkOrder.update(existing.id,{problem_photos:uploaded.urls});
        if (uploaded.failed) photoWarning = `${uploaded.failed} photo${uploaded.failed === 1 ? '' : 's'} could not be attached. The Fleet issue report was still submitted.`;
      }
      await base44.asServiceRole.functions.invoke('fleetNotificationDispatcher',{
        event_type:'work_order_created',
        target_id:existing.id,
        event_token:submissionKey,
      }).catch(()=>null);
      return Response.json({success:true,reused:true,id:existing.id,work_order_number:existing.work_order_number,photo_warning:photoWarning});
    }

    const throttle = await consumeThrottle(base44, req);
    if (throttle.limited) {
      return Response.json({error:'Too many Fleet issue reports were submitted from this connection. Please try again later.'},{status:429,headers:{'Retry-After':'900'}});
    }

    const photoValidation = decodePublicPhotos(payload?.photos);
    if (photoValidation.error) return Response.json({error:photoValidation.error},{status:400});

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
      problem_photos:[],
    });

    // Collapse practical concurrent retries before uploading files so only the winning record owns attachments.
    await new Promise(resolve=>setTimeout(resolve,75));
    let winner = canonical(await WorkOrder.filter({public_submission_key:submissionKey})) || created;
    if (winner.id !== created.id) {
      await WorkOrder.delete(created.id).catch(()=>null);
      await base44.asServiceRole.functions.invoke('fleetNotificationDispatcher',{
        event_type:'work_order_created',
        target_id:winner.id,
        event_token:submissionKey,
      }).catch(()=>null);
      return Response.json({success:true,reused:true,id:winner.id,work_order_number:winner.work_order_number});
    }

    let photoWarning = '';
    if (photoValidation.photos.length) {
      const uploaded = await uploadPublicPhotos(base44, photoValidation.photos);
      if (uploaded.urls.length) {
        await WorkOrder.update(winner.id,{problem_photos:uploaded.urls});
        winner = {...winner,problem_photos:uploaded.urls};
      }
      if (uploaded.failed) photoWarning = `${uploaded.failed} photo${uploaded.failed === 1 ? '' : 's'} could not be attached. The Fleet issue report was still submitted.`;
    }

    await base44.asServiceRole.functions.invoke('fleetNotificationDispatcher',{
      event_type:'work_order_created',
      target_id:winner.id,
      event_token:submissionKey,
    }).catch(()=>null);

    return Response.json({success:true,reused:false,id:winner.id,work_order_number:winner.work_order_number,photo_warning:photoWarning});
  } catch (error) {
    console.error('fleetPublicIssueReport error:',error);
    return Response.json({error:error?.message || 'Fleet issue report could not be submitted.'},{status:500});
  }
});