export const TIME_CLOCK_COMPANY_TIME_ZONE = 'America/New_York';
export const PAYROLL_MEMBERSHIP_EVIDENCE_CONTRACT_VERSION = 1;

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
