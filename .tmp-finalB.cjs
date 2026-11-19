const fs = require("fs");
let applied = 0;

// 1) attachment_url field on TimeClockCorrectionRequest
const ef = "base44/entities/TimeClockCorrectionRequest.jsonc";
let es = fs.readFileSync(ef, "utf8");
if (!es.includes("attachment_url")) {
  const anchor = '"employee_reason":';
  if (es.includes(anchor)) {
    es = es.replace(anchor, '"attachment_url": {\n      "type": "string",\n      "description": "Optional photo/document URL attached to the correction (paper slip scan)"\n    },\n    ' + anchor);
    fs.writeFileSync(ef, es); applied++;
  }
}

// 2) entry.ts: snapshot tallies + new actions before fallback
const f = "base44/functions/timeClockAction/entry.ts";
let s = fs.readFileSync(f, "utf8");

// snapshot: paid_break_minutes_today + projected_overtime next to todays_segments
const snapAnchor = "        todays_segments: todaysSegments,";
if (s.includes(snapAnchor) && !s.includes("paid_break_minutes_today")) {
  s = s.replace(snapAnchor, snapAnchor + "\n        paid_break_minutes_today: todaysSegments.filter((seg: any) => seg.kind === 'paid_break').reduce((sum: number, seg: any) => sum + Math.max(0, ((seg.end ? new Date(seg.end).getTime() : Date.now()) - new Date(seg.start).getTime()) / 60000), 0),\n        projected_overtime_minutes: Math.max(0, weeklyPaid + remainingScheduledMinutes - 2400),");
  applied++;
}

// compute remainingScheduledMinutes before the response - reuse schedule rows
const calcAnchor = "      const ptoBalance =";
if (s.includes(calcAnchor) && !s.includes("remainingScheduledMinutes")) {
  s = s.replace(calcAnchor, "      const remainingScheduledMinutes = (Array.isArray(todaysSchedule) && todaysSchedule.days ? todaysSchedule.days : []).filter((d: any) => !d.worked).reduce((sum: number, d: any) => sum + Number(d.scheduled_minutes || 0), 0);\n      const ptoBalance =");
  applied++;
}

// actions block before fallback
const fallback = "    return Response.json({ success: false, error: 'Unsupported Time Clock action.' }, { status: 400 });";
if (s.includes(fallback) && !s.includes("action === 'bulk_auto_approve'")) {
  const block = `    if (action === 'bulk_auto_approve') {
      if (actor.role !== 'admin') return Response.json({ success: false, error: 'Manager access is required.' }, { status: 403 });
      const thresholdMin = Math.max(1, Math.min(60, Number(body.max_minutes || 5)));
      const reason = typeof body.reason === 'string' && body.reason.trim().length >= 3 ? body.reason.trim() : 'Auto-approved small adjustment';
      const requests = await correctionRequestEntity.filter({ status: 'pending' }, '-requested_at', 200).catch(() => []);
      let approved = 0; const errors = [];
      for (const r of (Array.isArray(requests) ? requests : [])) {
        const delta = Math.abs(Number(r.requested_changes?.total_hours || 0) - Number(r.original_total_hours || 0)) * 60;
        if (delta > thresholdMin) continue;
        const ok = await correctionRequestEntity.update(r.id, { status: 'approved', manager_reason: reason, reviewed_by: actor.email, reviewed_at: new Date().toISOString() }).catch(() => null);
        if (ok) approved += 1; else errors.push(r.id);
      }
      return Response.json({ success: true, approved, skipped: errors.length });
    }

    if (action === 'report_camera_health') {
      const key = typeof body.device_key === 'string' ? body.device_key.trim() : '';
      if (!key) return Response.json({ success: false, error: 'device_key is required.' }, { status: 400 });
      const rows = await deviceEntity.filter({ device_key: key }, '-updated_date', 1).catch(() => []);
      const dev = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
      if (!dev?.id) return Response.json({ success: false, error: 'Device not registered.' }, { status: 404 });
      const config = dev.config && typeof dev.config === 'object' ? { ...dev.config } : {};
      config.camera_health = String(body.health || 'unknown').slice(0, 20);
      config.camera_health_at = new Date().toISOString();
      config.brightness = Number.isFinite(Number(body.brightness)) ? Math.round(Number(body.brightness)) : null;
      await deviceEntity.update(dev.id, { config }).catch(() => null);
      return Response.json({ success: true });
    }

    if (action === 'attach_correction_document') {
      const reqId = typeof body.request_id === 'string' ? body.request_id : '';
      const url = typeof body.url === 'string' && /^https?:\\/\\//.test(body.url) ? body.url.trim().slice(0, 500) : '';
      if (!reqId || !url) return Response.json({ success: false, error: 'request_id and a valid url are required.' }, { status: 400 });
      const req = await correctionRequestEntity.get(reqId).catch(() => null);
      if (!req?.id) return Response.json({ success: false, error: 'Request not found.' }, { status: 404 });
      if (asEmail(req.user_email) !== asEmail(actor.email) && actor.role !== 'admin') return Response.json({ success: false, error: 'Not your correction.' }, { status: 403 });
      await correctionRequestEntity.update(req.id, { attachment_url: url }).catch(() => null);
      return Response.json({ success: true });
    }

` + fallback;
  s = s.replace(fallback, block);
  applied++;
}

fs.writeFileSync(f, s);
console.log("applied " + applied);
