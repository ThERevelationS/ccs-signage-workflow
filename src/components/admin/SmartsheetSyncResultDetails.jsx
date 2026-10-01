export default function SmartsheetSyncResultDetails({ result }) {
  const reasons = [result?.reason, result?.review_message, ...(result?.error_details || [])].filter(Boolean);
  return <div className="space-y-1 text-[10px] leading-snug text-amber-800 dark:text-amber-300">
    {reasons.map((reason, index) => <p key={index}>{reason}</p>)}
    {Number(result?.conflicts) > 0 && <p>{result.conflicts} conflicting records were preserved for review.</p>}
    {Number(result?.snapshot_review_required) > 0 && <p>{result.snapshot_review_required} records need their sync baseline reviewed.</p>}
  </div>;
}