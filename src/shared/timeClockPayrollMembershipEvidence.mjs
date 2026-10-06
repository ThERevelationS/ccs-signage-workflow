export const TIME_CLOCK_COMPANY_TIME_ZONE = 'America/New_York';
export const PAYROLL_MEMBERSHIP_EVIDENCE_CONTRACT_VERSION = 1;
export const PAYROLL_MEMBERSHIP_EVIDENCE_ACTIONS = Object.freeze(['clock_in', 'clock_out', 'admin_correction', 'admin_archive']);
export const PAYROLL_MEMBERSHIP_EVIDENCE_SOURCES = Object.freeze(['verified_normalized_audit_envelope', 'immutable_audit']);
export const PAYROLL_MEMBERSHIP_EVIDENCE_REQUIRED_FIELDS = Object.freeze(['action', 'request_id', 'server_timestamp', 'company_date', 'clock_in', 'source']);

export function isPayrollMembershipIsoInstant(value) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(String(value || '')) && !Number.isNaN(Date.parse(String(value)));
}

export function isPayrollMembershipCompanyDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) return false;
  const [, year, month, day] = match;
  const date = new Date(`${year}-${month}-${day}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === String(value);
}

export function validatePayrollMembershipConflictEvidence(item) {
  const action = String(item?.action || '');
  const source = String(item?.source || '');
  const clockInValid = isPayrollMembershipIsoInstant(item?.clock_in);
  const companyDateValid = isPayrollMembershipCompanyDate(item?.company_date);
  const missingFields = PAYROLL_MEMBERSHIP_EVIDENCE_REQUIRED_FIELDS.filter((field) => !String(item?.[field] || '').trim());
  return {
    audit_id: String(item?.audit_id || '').trim(),
    missing_fields: missingFields,
    invalid_contract_version: Number(item?.contract_version || 0) !== PAYROLL_MEMBERSHIP_EVIDENCE_CONTRACT_VERSION,
    invalid_action: !PAYROLL_MEMBERSHIP_EVIDENCE_ACTIONS.includes(action),
    invalid_source: !PAYROLL_MEMBERSHIP_EVIDENCE_SOURCES.includes(source),
    invalid_server_timestamp: !isPayrollMembershipIsoInstant(item?.server_timestamp),
    invalid_clock_in: !clockInValid,
    invalid_company_date: !companyDateValid,
    company_date_clock_in_mismatch: clockInValid && companyDateValid && payrollMembershipCompanyDate(item.clock_in) !== String(item.company_date),
    invalid_action_source_pair: source === 'verified_normalized_audit_envelope' && !PAYROLL_MEMBERSHIP_EVIDENCE_ACTIONS.includes(action),
  };
}

export function payrollMembershipConflictEvidenceIsMalformed(validation) {
  return validation.missing_fields.length > 0
    || validation.invalid_contract_version
    || validation.invalid_action
    || validation.invalid_source
    || validation.invalid_server_timestamp
    || validation.invalid_clock_in
    || validation.invalid_company_date
    || validation.company_date_clock_in_mismatch
    || validation.invalid_action_source_pair;
}

export function payrollMembershipCompanyDate(value) {
  const date = new Date(String(value || ''));
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_CLOCK_COMPANY_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return values.year && values.month && values.day ? `${values.year}-${values.month}-${values.day}` : '';
}

export function payrollMembershipSemanticClockIn(row) {
  const details = row?.details || {};
  const action = String(row?.action || '');
  if (action === 'clock_in') return String(details.employee_attested_clock_in || row?.server_timestamp || '');
  if (action === 'clock_out') return String(details.result_clock_in || '');
  if (action === 'admin_correction') return String(details.corrected?.clock_in || '');
  if (action === 'admin_archive') return String(details.archived_entry?.clock_in || details.original?.clock_in || '');
  return '';
}

export function normalizedPayrollMembershipFromAudit(row) {
  const envelope = row?.details?.payroll_membership;
  if (!envelope || Number(envelope.version || 0) !== 1 || String(envelope.time_zone || '') !== TIME_CLOCK_COMPANY_TIME_ZONE) return null;
  const clockIn = String(envelope.clock_in || '');
  const companyDate = payrollMembershipCompanyDate(clockIn);
  const semanticClockIn = payrollMembershipSemanticClockIn(row);
  if (!clockIn || !companyDate || companyDate !== String(envelope.company_date || '') || !semanticClockIn || semanticClockIn !== clockIn) return null;
  return { company_date: companyDate, clock_in: clockIn, source: 'verified_normalized_audit_envelope' };
}

export function payrollMembershipFromAudit(row) {
  const details = row?.details || {};
  if (details.payroll_membership) return normalizedPayrollMembershipFromAudit(row);
  const candidates = [details.payroll_clock_in, details.original?.clock_in, details.corrected?.clock_in, details.employee_attested_clock_in, details.detected_clock_in, details.claimed_clock_in, String(row?.action || '') === 'clock_in' ? row?.server_timestamp : ''].filter(Boolean);
  for (const value of candidates) {
    const companyDate = payrollMembershipCompanyDate(value);
    if (companyDate) return { company_date: companyDate, clock_in: String(value), source: 'immutable_audit' };
  }
  return null;
}

export function classifyAuthoritativePayrollAuditIntegrity(rows) {
  const loadedRows = Array.isArray(rows) ? rows : [];
  const auditIds = loadedRows.map((row) => String(row?.id || '').trim());
  const duplicateAuditIds = [...new Set(auditIds.filter((id, index) => id && auditIds.indexOf(id) !== index))];
  const duplicateAuditIdSet = new Set(duplicateAuditIds);

  const diagnostics = loadedRows.map((row, rowIndex) => {
    const auditId = auditIds[rowIndex];
    const membership = payrollMembershipFromAudit(row);
    let validation = null;
    if (membership) {
      const evidence = {
        contract_version: PAYROLL_MEMBERSHIP_EVIDENCE_CONTRACT_VERSION,
        audit_id: auditId,
        action: String(row?.action || ''),
        request_id: String(row?.request_id || ''),
        server_timestamp: String(row?.server_timestamp || ''),
        company_date: String(membership.company_date || ''),
        clock_in: String(membership.clock_in || ''),
        source: String(membership.source || ''),
      };
      const candidateValidation = validatePayrollMembershipConflictEvidence(evidence);
      if (payrollMembershipConflictEvidenceIsMalformed(candidateValidation)) validation = candidateValidation;
    }
    const duplicateImmutableAuditId = Boolean(auditId && duplicateAuditIdSet.has(auditId));
    return validation || duplicateImmutableAuditId ? {
      audit_id: auditId,
      diagnostic_row_index: rowIndex,
      validation,
      duplicate_immutable_audit_id: duplicateImmutableAuditId,
    } : null;
  }).filter(Boolean);

  return { diagnostics, duplicate_audit_ids: duplicateAuditIds };
}
