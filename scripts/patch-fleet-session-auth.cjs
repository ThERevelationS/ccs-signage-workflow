// One-shot migration: add EmailGate session-token auth to fleet*Action functions.
// Each function keeps its existing base44.auth.me() path (service/builder
// callers) and gains a resolveFleetStaffUser fallback so EmailGate staff
// sessions authorize through AuthorizedEmail — the app's real role system.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'base44', 'functions');
const IMPORT_LINE = "import { resolveFleetStaffUser } from '../../shared/fleetStaffSession.ts';";

// kind: 'helper' adds sessionToken param to the auth helper and passes
// body?.session_token at the call site. 'inline' patches the auth.me() line
// inside Deno.serve with body?.session_token directly.
// reorder: move the req.json() body parse (currently AFTER the auth call)
// to directly before the auth call so the token is in scope.
const SPECS = {
  fleetAlertSettingsAction:      { helper: 'requireAdmin', sig: 'requireAdmin(base44: any)', reorder: true },
  fleetDashboardPreferenceAction:{ helper: 'requireUser',  sig: 'requireUser(base44:any)', reorder: true },
  fleetEquipmentAction:          { helper: 'requireAdmin', sig: 'requireAdmin(base44: any)', reorder: true },
  fleetEquipmentDocumentAction:  { helper: 'requireAdmin', sig: 'requireAdmin(base44: any)', reorder: true },
  fleetFuelAction:               { helper: 'authorize',    sig: 'authorize(base44:any)', reorder: true },
  fleetInspectionAction:         { helper: 'authorize',    sig: 'authorize(base44: any, adminRequired = false)', callHasAdminArg: true },
  fleetInventoryAction:          { helper: 'requireAdmin', sig: 'requireAdmin(base44: any)', reorder: true },
  fleetLifecycleAction:          { helper: 'requireAdmin', sig: 'requireAdmin(base44:any)', reorder: true },
  fleetMaintenanceAction:        { helper: 'requireAdmin', sig: 'requireAdmin(base44: any)', reorder: true },
  fleetMeterMaintenanceAction:   { helper: 'authorize',    sig: 'authorize(base44:any, adminRequired=false)', callHasAdminArg: true },
  fleetPartLookupAction:         { helper: 'authorize',    sig: 'authorize(base44: any, adminRequired = false)', callHasAdminArg: true },
  fleetRepairEstimateAction:     { helper: 'requireAdmin', sig: 'requireAdmin(base44:any)', reorder: true },
  fleetRequestAction:            { helper: 'authorize',    sig: 'authorize(base44: any)', reorder: true },
  fleetReservationAction:        { helper: 'authorize',    sig: 'authorize(base44:any)', reorder: true },
  fleetSystemReportAction:       { helper: 'requireAdmin', sig: 'requireAdmin(base44: any)', reorder: true },
  fleetWarrantyAction:           { helper: 'authorize',    sig: 'authorize(base44:any)', reorder: true },
  fleetWorkOrderAction:          { helper: 'authorize',    sig: 'authorize(base44: any)', reorder: true },
  fleetMechanicPortal:           { helper: 'requireAdmin', sig: 'requireAdmin(base44: any)' },
  fleetSettingsAction:           { inline: true, reorder: true },
  fleetSearch:                   { inline: true, reorder: true },
};

const USER_LINE_RE = /const user = await base44\.auth\.me\(\)\.catch\(\(\)\s*=>\s*null\);/;

let failures = 0;
const fail = (file, msg) => { failures += 1; console.error(`FAIL ${file}: ${msg}`); };
const mustReplace = (file, src, oldStr, newStr, count = 1) => {
  const hits = src.split(oldStr).length - 1;
  if (hits !== count) { fail(file, `expected ${count}x ${JSON.stringify(oldStr.slice(0, 70))} got ${hits}`); return src; }
  return src.split(oldStr).join(newStr);
};

for (const [name, spec] of Object.entries(SPECS)) {
  const file = path.join(ROOT, name, 'entry.ts');
  let src = fs.readFileSync(file, 'utf8');
  if (src.includes('fleetStaffSession')) { console.log(`SKIP ${name}: already patched`); continue; }

  // 1. import
  src = mustReplace(file, src,
    "import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';",
    "import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';\n" + IMPORT_LINE);

  if (spec.inline) {
    // 2. inline user line with body?.session_token
    if (!USER_LINE_RE.test(src)) { fail(file, 'user line not found'); continue; }
    src = src.replace(USER_LINE_RE,
      'const user = (await base44.auth.me().catch(() => null)) || await resolveFleetStaffUser(base44, body?.session_token);');
    if (spec.reorder) {
      // move "const body = await req.json()..." above the patched user line
      const bodyRe = /^([ \t]*)const body = await req\.json\(\)\.catch\(\(\)\s*=>\s*\(\{\}\)\);\s*$/m;
      const m = src.match(bodyRe);
      if (!m) { fail(file, 'body line not found for reorder'); continue; }
      const bodyLine = m[0];
      const userIdx = src.indexOf('const user = (await base44.auth.me()');
      const bodyIdx = src.indexOf(bodyLine);
      if (bodyIdx === -1 || userIdx === -1 || bodyIdx < userIdx) { fail(file, 'reorder anchors wrong'); continue; }
      src = src.replace(bodyLine, '');
      const insertIdx = src.indexOf('const user = (await base44.auth.me()');
      src = src.slice(0, insertIdx) + bodyLine.trimEnd() + '\n    ' + src.slice(insertIdx);
    }
  } else {
    // 2. helper signature
    const sigOld = `async function ${spec.helper}(${spec.sig.split('(')[1]}`;
    const sigNew = sigOld.replace(/\)\s*$/, ', sessionToken)');
    src = mustReplace(file, src, sigOld, sigNew);

    // 3. user line fallback
    if (!USER_LINE_RE.test(src)) { fail(file, 'user line not found'); continue; }
    src = src.replace(USER_LINE_RE,
      'const user = (await base44.auth.me().catch(() => null)) || await resolveFleetStaffUser(base44, sessionToken);');

    // 4. call site: pass token (+reorder body parse if needed)
    const callRe = new RegExp(`await ${spec.helper}\\(base44([^)]*)\\)`);
    const callMatch = src.match(callRe);
    if (!callMatch) { fail(file, 'call site not found'); continue; }
    const existingArgs = callMatch[1] || '';
    const needsArg = spec.callHasAdminArg
      ? `${existingArgs}, body?.session_token`
      : (existingArgs ? `${existingArgs}, body?.session_token` : ', body?.session_token');
    const newCall = `await ${spec.helper}(base44${needsArg})`;

    if (spec.reorder) {
      const bodyRe = /^([ \t]*)const body\s*=\s*await req\.json\(\)\.catch\(\(\)\s*=>\s*\(?\{\}\)?\);?\s*$/m;
      const bodyMatch = src.match(bodyRe);
      if (!bodyMatch) { fail(file, 'body line not found for reorder'); continue; }
      const bodyLine = bodyMatch[0];
      const callIdx = src.indexOf(callMatch[0]);
      const bodyIdx = src.indexOf(bodyLine);
      if (bodyIdx === -1 || callIdx === -1 || bodyIdx < callIdx) { fail(file, `reorder anchors wrong (call@${callIdx} body@${bodyIdx})`); continue; }
      const indent = src.slice(0, callIdx).match(/[ \t]*$/)[0];
      src = src.replace(bodyLine, '');
      src = src.replace(callMatch[0], bodyLine.trimEnd() + '\n' + indent + newCall);
    } else {
      src = src.replace(callMatch[0], newCall);
    }
  }

  fs.writeFileSync(file, src);
  console.log(`OK ${name}`);
}
console.log(failures ? `\n${failures} FAILURES` : '\nAll patched');
