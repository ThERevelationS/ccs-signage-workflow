const fs = require("fs");
const f = "base44/functions/timeClockAction/entry.ts";
let s = fs.readFileSync(f, "utf8");
let applied = 0;

// 1) Consolidated action block before the fallback
const block = `
    if (action === 'record_clock_out_extras') {
      // Post-clock-out metadata - tips, mileage, weather tags attach to the
      // just-closed entry without touching the serialized clock-out path.
      const tips = Math.max(0, Math.min(99999, Number(body.tips_declared || 0)));
      const miles = Math.max(0, Math.min(9999, Number(body.mileage_miles || 0)));
      const wx = typeof body.weather_event === 'string' ? body.weather_event.trim().slice(0, 60) : '';
      if (!tips && !miles && !wx) return Response.json({ success: false, error: 'Nothing to record.' }, { status: 400 });
      const entryId = typeof body.entry_id === 'string' ? body.entry_id : '';
      let entry = entryId ? await entryEntity.get(entryId).catch(() => null) : null;
      if (!entry?.id) {
        const rows = await entryEntity.filter({ user_email: target.email, status: 'clocked_out' }, '-clock_out', 1).catch(() => []);
        entry = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
      }
      if (!entry?.id || asEmail(entry.user_email) !== target.email) return Response.json({ success: false, error: 'No recent clock-out to attach to.' }, { status: 404 });
      // Only allow within 24h of clock-out - after that it needs a correction.
      if (Date.now() - new Date(entry.clock_out || 0).getTime() > 86400000) return Response.json({ success: false, error: 'Too late to attach - file a correction instead.' }, { status: 409 });
      await entryEntity.update(entry.id, { ...(tips ? { tips_declared: tips } : {}), ...(miles ? { mileage_miles: miles } : {}), ...(wx ? { weather_event: wx } : {}) }).catch(() => null);
      return Response.json({ success: true, entry_id: entry.id });
    }

    if (action === 'bulk_import_entries') {
      if (actor.role !== 'admin') return Response.json({ success: false, error: 'Manager access is required for bulk imports.' }, { status: 403 });
      const rows = Array.isArray(body.rows) ? body.rows.slice(0, 500) : [];
      if (!rows.length) return Response.json({ success: false, error: 'rows[] is required.' }, { status: 400 });
      let imported = 0; const errors = [];
      for (const [i, r] of rows.entries()) {
        const email = asEmail(r.user_email);
        if (!email || !r.clock_in || !r.clock_out) { errors.push(\`row \${i + 1}: needs user_email, clock_in, clock_out\`); continue; }
        const hrs = Math.max(0, (new Date(r.clock_out) - new Date(r.clock_in)) / 3600000);
        const created = await entryEntity.create({ user_email: email, user_name: String(r.user_name || email), clock_in: r.clock_in, clock_out: r.clock_out, status: 'clocked_out', total_hours: Math.round(hrs * 100) / 100, clock_source: 'bulk_import', notes: String(r.notes || ''), archived_test_data: true }).catch(() => null);
        if (created?.id) imported += 1; else errors.push(\`row \${i + 1}: create failed\`);
      }
      return Response.json({ success: true, imported, errors: errors.slice(0, 20) });
    }

    if (action === 'my_data_export') {
      const entries = await entryEntity.filter({ user_email: target.email }, '-clock_in', 1000).catch(() => []);
      const clean = (Array.isArray(entries) ? entries : []).filter((e: any) => e.archived_test_data !== true && e.archived_admin !== true);
      return Response.json({ success: true, employee: publicEmployee(target), entries: clean, exported_at: new Date().toISOString() });
    }

    if (action === 'timeclock_compliance_report') {
      if (actor.role !== 'admin') return Response.json({ success: false, error: 'Manager access is required for compliance reports.' }, { status: 403 });
      const from = typeof body.from === 'string' && /^\\d{4}-\\d{2}-\\d{2}$/.test(body.from) ? body.from : dateKeyInCompanyTime(new Date(Date.now() - 30 * 86400000).toISOString());
      const to = typeof body.to === 'string' && /^\\d{4}-\\d{2}-\\d{2}$/.test(body.to) ? body.to : dateKeyInCompanyTime(new Date().toISOString());
      const rows = await entryEntity.filter({}, '-clock_in', 4000).catch(() => []);
      const range = (Array.isArray(rows) ? rows : []).filter((e: any) => { const dk = dateKeyInCompanyTime(e.clock_in); return dk && dk >= from && dk <= to && e.archived_test_data !== true && e.archived_admin !== true; });
      const missedLunch = range.filter((e: any) => Number(e.total_hours || 0) > 6 && !(Array.isArray(e.breaks) && e.breaks.some((b: any) => Number(b.duration_minutes || 0) >= 30)) && e.clock_out);
      const buddy = [];
      const byDay = new Map();
      for (const e of range) { const dk = dateKeyInCompanyTime(e.clock_in); if (!byDay.has(dk)) byDay.set(dk, []); byDay.get(dk).push(e); }
      for (const [, list] of byDay) {
        const sorted = list.filter((e: any) => e.clock_in).sort((a: any, b: any) => new Date(a.clock_in) - new Date(b.clock_in));
        for (let i = 1; i < sorted.length; i += 1) {
          if (Math.abs(new Date(sorted[i].clock_in) - new Date(sorted[i - 1].clock_in)) < 120000 && sorted[i].user_email !== sorted[i - 1].user_email) buddy.push({ a: sorted[i - 1].user_email, b: sorted[i].user_email, date: dateKeyInCompanyTime(sorted[i].clock_in) });
        }
      }
      const otCost = range.reduce((s: number, e: any) => s + Number(e.overtime_hours || 0), 0);
      return Response.json({ success: true, from, to, missed_lunches: missedLunch.length, missed_lunch_entries: missedLunch.slice(0, 50).map((e: any) => ({ user: e.user_name || e.user_email, date: dateKeyInCompanyTime(e.clock_in), hours: e.total_hours })), buddy_pairs: buddy.slice(0, 50), overtime_hours: Math.round(otCost * 100) / 100 });
    }

    if (action === 'punch_fraud_scan') {
      if (actor.role !== 'admin') return Response.json({ success: false, error: 'Manager access is required.' }, { status: 403 });
      const rows = await entryEntity.filter({}, '-clock_in', 500).catch(() => []);
      const clean = (Array.isArray(rows) ? rows : []).filter((e: any) => e.archived_test_data !== true && e.archived_admin !== true).slice(0, 200);
      const scored = clean.map((e: any) => {
        let score = 0; const flags = [];
        const ci = e.clock_in ? new Date(e.clock_in) : null;
        if (ci && (ci.getHours() < 4 || ci.getHours() > 22)) { score += 30; flags.push('off-hours punch'); }
        if (e.clock_source === 'manual' || e.clock_source === 'bulk_import') { score += 20; flags.push('manual source'); }
        if (!e.clock_in_geo) { score += 10; flags.push('no geo'); }
        if (e.payroll_hold) { score += 15; flags.push('held'); }
        if (e.auto_clocked_out) { score += 15; flags.push('auto-closed'); }
        if (Number(e.total_hours || 0) > 14) { score += 25; flags.push('>14h shift'); }
        return { entry_id: e.id, user: e.user_name || e.user_email, date: dateKeyInCompanyTime(e.clock_in), score: Math.min(100, score), flags };
      }).filter((r: any) => r.score >= 40).sort((a: any, b: any) => b.score - a.score);
      return Response.json({ success: true, flagged: scored });
    }

    if (action === 'union_hour_rollup') {
      if (actor.role !== 'admin') return Response.json({ success: false, error: 'Manager access is required.' }, { status: 403 });
      const rows = await entryEntity.filter({ union_local: { $exists: true } }, '-clock_in', 2000).catch(() => []);
      const rollup = new Map();
      for (const e of (Array.isArray(rows) ? rows : [])) {
        if (!e.union_local || e.archived_test_data === true || e.archived_admin === true) continue;
        const u = rollup.get(e.union_local) || { hours: 0, employees: new Set(), certified_shifts: 0 };
        u.hours += Number(e.total_hours || 0); if (e.user_email) u.employees.add(e.user_email); if (e.certified_payroll) u.certified_shifts += 1;
        rollup.set(e.union_local, u);
      }
      return Response.json({ success: true, unions: [...rollup.entries()].map(([local, v]) => ({ local, hours: Math.round(v.hours * 100) / 100, employees: v.employees.size, certified_shifts: v.certified_shifts })) });
    }

    if (action === 'device_usage_report') {
      if (actor.role !== 'admin') return Response.json({ success: false, error: 'Manager access is required.' }, { status: 403 });
      const rows = await entryEntity.filter({}, '-clock_in', 3000).catch(() => []);
      const counts = new Map();
      for (const e of (Array.isArray(rows) ? rows : [])) {
        if (!e.device_key || e.archived_test_data === true || e.archived_admin === true) continue;
        counts.set(e.device_key, (counts.get(e.device_key) || 0) + 1);
      }
      return Response.json({ success: true, devices: [...counts.entries()].map(([device_key, punches]) => ({ device_key, punches })).sort((a: any, b: any) => b.punches - a.punches) });
    }

    if (action === 'auto_clockout_sweep') {
      if (actor.role !== 'admin') return Response.json({ success: false, error: 'Manager access is required.' }, { status: 403 });
      const limitH = Math.max(8, Math.min(24, Number(body.max_hours || 16)));
      const cutoff = Date.now() - limitH * 3600000;
      const rows = await entryEntity.filter({ status: 'clocked_in' }, '-clock_in', 500).catch(() => []);
      const stale = (Array.isArray(rows) ? rows : []).filter((e: any) => e.clock_in && new Date(e.clock_in).getTime() < cutoff && e.archived_test_data !== true && e.archived_admin !== true);
      let closed = 0;
      for (const e of stale) {
        const hrs = (Date.now() - new Date(e.clock_in).getTime()) / 3600000;
        const ok = await entryEntity.update(e.id, { status: 'clocked_out', clock_out: new Date().toISOString(), total_hours: Math.round(hrs * 100) / 100, auto_clocked_out: true, notes: \`\${e.notes || ''} [auto clock-out after \${limitH}h]\`.trim() }).catch(() => null);
        if (ok) closed += 1;
      }
      return Response.json({ success: true, closed, checked: stale.length });
    }

    if (action === 'set_delegated_approver') {
      if (actor.role !== 'admin') return Response.json({ success: false, error: 'Manager access is required.' }, { status: 403 });
      const email = asEmail(body.target_email); const approver = asEmail(body.approver_email);
      if (!email || !approver) return Response.json({ success: false, error: 'target_email and approver_email are required.' }, { status: 400 });
      const rows = await preferenceEntity.filter({ user_email: email }, '-updated_date', 1).catch(() => []);
      const pref = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
      if (pref?.id) await preferenceEntity.update(pref.id, { custom_notes: \`\${pref.custom_notes || ''}\\napprover:\${approver}\`.trim() }).catch(() => null);
      else await preferenceEntity.create({ user_email: email, custom_notes: \`approver:\${approver}\` }).catch(() => null);
      return Response.json({ success: true });
    }
`;

const anchor = "    return Response.json({ success: false, error: 'Unsupported Time Clock action.' }, { status: 400 });";
if (s.includes(anchor) && !s.includes("action === 'record_clock_out_extras'")) {
  s = s.replace(anchor, block + "\n" + anchor);
  applied += 1;
}

// 2) Snapshot additions: predictive OT + paid-break tally + feature flags
const snapAnchor = "        todays_segments: todaysSegments,";
if (s.includes(snapAnchor) && !s.includes("paid_break_minutes_today")) {
  s = s.replace(snapAnchor, "        todays_segments: todaysSegments,\n        paid_break_minutes_today: paidBreakMinutesToday,\n        projected_overtime: projectedOvertime,\n        features: featureFlags,");
  applied += 1;
}

// 3) Compute those values before the snapshot response — find a stable anchor.
const calcAnchor = "      const ptoBalance =";
if (s.includes(calcAnchor) && !s.includes("paidBreakMinutesToday")) {
  const calc = `      const paidBreakMinutesToday = (Array.isArray(todaysSegments) ? todaysSegments : []).filter((seg: any) => seg.type === 'break' && seg.paid !== false).reduce((sum: number, seg: any) => sum + Number(seg.duration_minutes || 0), 0);
      const remainingScheduled = (Array.isArray(weeklySchedule) ? weeklySchedule : []).filter((d: any) => d.scheduled_minutes > 0 && d.date_key >= dateKeyInCompanyTime(new Date().toISOString())).reduce((sum: number, d: any) => sum + Number(d.scheduled_minutes || 0), 0);
      const projectedOvertime = (weeklyPaid + remainingScheduled) > 2400;
      const featureFlags = { experimental: true, announcements: true, shift_templates: true };
` + calcAnchor;
  s = s.replace(calcAnchor, calc);
  applied += 1;
}

fs.writeFileSync(f, s);
console.log("applied " + applied + " blocks");
