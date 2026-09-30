const text = (value: unknown) => String(value ?? '').trim();

export function selectReusableMechanicUploads(receipts: any[] = [], payloadFingerprint: string, photoCount: number) {
  const count = Math.max(0, Math.floor(Number(photoCount) || 0));
  const candidates = (receipts || [])
    .filter((row:any) => row?.status === 'failed'
      && String(row?.payload_fingerprint || '') === String(payloadFingerprint || '')
      && row?.result_summary?.action === 'save')
    .map((row:any) => ({
      receipt:row,
      urls:(Array.isArray(row?.result_summary?.uploaded_photo_urls) ? row.result_summary.uploaded_photo_urls : [])
        .map((url:any)=>text(url))
        .filter((url:string)=>/^https:\/\//i.test(url))
        .slice(0,count),
    }))
    .filter((row:any)=>row.urls.length > 0 && row.urls.length <= count)
    .sort((a:any,b:any)=>b.urls.length-a.urls.length || String(b.receipt?.created_date || '').localeCompare(String(a.receipt?.created_date || '')));
  const best = candidates[0] || null;
  return {
    urls:best?.urls || [],
    receipt_id:String(best?.receipt?.id || ''),
    operation_key:String(best?.receipt?.operation_key || ''),
  };
}

export function buildMechanicRecoveryPatch(current: any, receipt: any, appliedAt: string) {
  const summary = receipt?.result_summary || {};
  const plan = summary?.mutation_plan || null;
  const action = String(summary?.action || '');
  const expected = String(summary?.expected_updated_date || '');
  if (!plan || !expected) return {recoverable:false,reason:'missing_mutation_plan'};
  if (String(current?.updated_date || '') !== expected) return {recoverable:false,reason:'work_order_version_changed'};

  const marker = {
    mechanic_operation_key:String(receipt?.operation_key || ''),
    mechanic_operation_fingerprint:String(receipt?.payload_fingerprint || ''),
    mechanic_operation_applied_at:appliedAt,
  };

  if (action === 'start') {
    const appended = String(plan?.appended_note || '');
    const existingNotes = String(current?.notes || '');
    const notes = appended && !existingNotes.includes(appended)
      ? [existingNotes,appended].filter(Boolean).join('\n\n')
      : existingNotes;
    return {
      recoverable:true,
      patch:{
        status:'in_progress',
        started_date:String(plan?.started_date || current?.started_date || ''),
        notes,
        ...marker,
      },
    };
  }

  if (action === 'save') {
    const photoCount = Math.max(0,Math.floor(Number(summary?.photo_count) || 0));
    const uploaded = (Array.isArray(summary?.uploaded_photo_urls) ? summary.uploaded_photo_urls : [])
      .map((url:any)=>text(url))
      .filter((url:string)=>/^https:\/\//i.test(url));
    if (uploaded.length !== photoCount) return {recoverable:false,reason:'incomplete_upload_evidence'};

    const appended = String(plan?.appended_note || '');
    const existingNotes = String(current?.notes || '');
    const notes = appended && !existingNotes.includes(appended)
      ? [existingNotes,appended].filter(Boolean).join('\n\n')
      : existingNotes;
    const existingPhotos = Array.isArray(current?.after_photos) ? current.after_photos.map((url:any)=>String(url || '')) : [];
    const afterPhotos = [...existingPhotos];
    for (const url of uploaded) if (!afterPhotos.includes(url)) afterPhotos.push(url);

    return {
      recoverable:true,
      patch:{
        actual_hours:plan?.actual_hours ?? current?.actual_hours ?? null,
        corrective_action:String(plan?.corrective_action || ''),
        notes,
        after_photos:afterPhotos,
        ...marker,
      },
    };
  }

  return {recoverable:false,reason:'unsupported_mutation_action'};
}
