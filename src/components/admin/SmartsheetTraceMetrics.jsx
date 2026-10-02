const metrics = [
  ['Duration', 'duration_ms', 'ms'], ['Smartsheet GET', 'smartsheet_get'], ['Smartsheet PUT', 'smartsheet_put'], ['Smartsheet POST', 'smartsheet_post'],
  ['Weighted Smartsheet requests', 'smartsheet_weighted_requests'], ['Base44 reads', 'base44_reads'], ['Base44 writes', 'base44_writes'],
  ['Sync API calls', 'total_sync_api_calls'], ['Rows returned (SS)', 'smartsheet_rows_returned'], ['Rows submitted (SS)', 'smartsheet_rows_submitted'],
  ['Cells submitted (SS)', 'smartsheet_cells_submitted'], ['Repeated GETs (SS)', 'repeated_smartsheet_gets'], ['Repeated reads (B44)', 'repeated_base44_reads'],
  ['Smartsheet operation time', 'smartsheet_ms', 'ms'], ['Base44 operation time', 'base44_ms', 'ms'], ['Drive operation time', 'drive_ms', 'ms'],
  ['Pacing wait', 'pacing_delay_ms', 'ms'], ['Retry wait', 'retry_delay_ms', 'ms'], ['Retries', 'retries'], ['Smartsheet 429', 'smartsheet_429'],
  ['Base44 429', 'base44_429'], ['Smartsheet 5xx', 'smartsheet_5xx'], ['Timeouts', 'timeouts'], ['Peak SS concurrency', 'peak_smartsheet_concurrency'],
  ['Peak B44 concurrency', 'peak_base44_concurrency'], ['Trace storage writes', 'trace_storage_writes'], ['Trace storage time', 'trace_storage_ms', 'ms'],
  ['Queue wait', 'queue_wait_ms', 'ms'], ['UI propagation', 'ui_propagation_ms', 'ms'],
];
export default function SmartsheetTraceMetrics({ trace }) {
  return <div className="space-y-3 text-xs">
    <dl className="grid grid-cols-2 gap-2 md:grid-cols-4">{metrics.map(([label, key, unit]) => <div key={key} className="rounded-md border border-border p-2">
      <dt className="text-muted-foreground">{label}</dt><dd className="font-semibold">{trace.metrics?.[key] == null ? 'Not measured' : `${Number(trace.metrics[key]).toLocaleString()} ${unit || ''}`}</dd>
    </div>)}</dl>
    <div className="overflow-auto"><table className="w-full text-left"><thead><tr>{['Stage','Evaluated','Skipped','Created','Updated','Conflicts','Errors'].map(h => <th key={h} className="p-2">{h}</th>)}</tr></thead>
      <tbody>{trace.stages?.map((s, i) => <tr key={i} className="border-t border-border"><td className="p-2">{s.dataset} {s.direction}</td>{['records_examined','unchanged_skipped','created','updated','conflicts','errors'].map(k => <td className="p-2" key={k}>{s[k] ?? '—'}</td>)}</tr>)}</tbody></table></div>
    {trace.limitations?.map(text => <p key={text} className="text-muted-foreground">{text}</p>)}
  </div>;
}