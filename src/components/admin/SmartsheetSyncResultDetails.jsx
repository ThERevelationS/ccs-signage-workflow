export default function SmartsheetSyncResultDetails({ result }) {
  const reasons = [result?.reason, result?.review_message, ...(result?.error_details || [])].filter(Boolean);
  const missingPermanentRows = result?.dataset === 'orders'
    ? Math.max(0, Number(result?.missing_permanent_row_links) || 0)
    : 0;
  const missingBase44OrderIds = Array.isArray(result?.missing_permanent_row_record_ids)
    ? result.missing_permanent_row_record_ids : [];
  const missingSmartsheetRowIds = Array.isArray(result?.missing_permanent_smartsheet_row_ids)
    ? result.missing_permanent_smartsheet_row_ids : [];

  return <div className="space-y-1 text-[10px] leading-snug text-amber-800 dark:text-amber-300">
    {reasons.map((reason, index) => <p key={index}>{reason}</p>)}
    {missingPermanentRows > 0 && (
      <div className="rounded-md border border-red-200 bg-red-50 p-2 text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200" role="alert">
        <p className="font-semibold">
          {missingPermanentRows} Order{missingPermanentRows === 1 ? '' : 's'} still point to permanent Smartsheet row IDs that are missing.
        </p>
        <p className="mt-0.5">
          Base44 kept the Order data and original row link unchanged. Sorting or moving a row does not change its permanent ID; deleting and recreating it does. Retry Sync will not relink to a lookalike replacement row.
        </p>
        <p className="mt-0.5 font-medium">Ask an admin to open Order Form diagnostics → Review links.</p>
        {missingBase44OrderIds.length > 0 && (
          <p className="mt-0.5 break-words font-mono">Base44 Order IDs: {missingBase44OrderIds.join(', ')}</p>
        )}
        {missingSmartsheetRowIds.length > 0 && (
          <p className="mt-0.5 break-words font-mono">Missing Smartsheet row IDs: {missingSmartsheetRowIds.join(', ')}</p>
        )}
      </div>
    )}
    {Number(result?.conflicts) > 0 && <p>{result.conflicts} conflicting records were preserved for review.</p>}
    {Number(result?.snapshot_review_required) > 0 && <p>{result.snapshot_review_required} records need their sync baseline reviewed.</p>}
  </div>;
}