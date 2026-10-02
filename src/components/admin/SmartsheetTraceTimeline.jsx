export default function SmartsheetTraceTimeline({ trace }) {
  const download = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(trace, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `smartsheet-trace-${trace.sync_run_id}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <div className="space-y-2">
    <button type="button" onClick={download} className="min-h-10 rounded-md border border-border px-3 text-xs">Download measured trace</button>
    <div className="max-h-80 overflow-auto rounded-md border border-border"><table className="w-full text-left text-xs">
      <thead><tr>{['Sequence','UTC timestamp','Elapsed ms','Operation','Details'].map(h => <th key={h} className="p-2">{h}</th>)}</tr></thead>
      <tbody>{trace.timeline?.map(e => { const { sequence, at, elapsed_ms, kind, ...details } = e; return <tr key={sequence} className="border-t border-border">
        <td className="p-2">{sequence}</td><td className="whitespace-nowrap p-2 font-mono">{at}</td><td className="p-2">{elapsed_ms}</td><td className="p-2">{kind}</td><td className="p-2 font-mono">{JSON.stringify(details)}</td>
      </tr>; })}</tbody>
    </table></div>
  </div>;
}