import { useMemo, useState } from "react";
import { ExternalLink, FileText, ChevronDown, ChevronUp, Sparkles } from "lucide-react";

// SignageFactsPanel — grouped fact cards for one jurisdiction.
// Props: facts[] (SignageFact rows), compact (bool), jurisdictionName.
// Every fact shows its value + evidence quote + source link. No clutter —
// collapsed groups by sign type; 'general' facts always visible.
const TYPE_ORDER = ['general','wall','monument','pole','pylon','freestanding','emc_digital','temporary','banner','projecting','awning','billboard_offpremise'];
const label = (v) => String(v || 'general').replaceAll('_', ' ');
const TIER = { verified: { c: 'bg-emerald-100 text-emerald-800', l: 'verified' }, ai_verified: { c: 'bg-teal-50 text-teal-700', l: 'AI checked' }, agent: { c: 'bg-sky-50 text-sky-700', l: 'AI extracted' }, pattern: { c: 'bg-slate-100 text-slate-600', l: 'pattern' } };

function FactValue({ v }) {
  const j = v?.value_json;
  if (j == null || j.value == null) return <span className="text-slate-500">stated</span>;
  if (j.value === true) return <span className="text-emerald-700 font-medium">yes</span>;
  if (j.value === false) return <span className="text-rose-600 font-medium">no</span>;
  return (
    <span className="text-slate-900 font-medium">
      {String(j.value)}{j.unit ? <span className="text-slate-500 text-xs ml-1">{j.unit}</span> : null}
      {j.condition ? <span className="text-slate-500 text-xs"> · {j.condition}</span> : null}
    </span>
  );
}

function FactRow({ f }) {
  const [open, setOpen] = useState(false);
  const tier = TIER[f.confidence] || TIER.pattern;
  return (
    <div className="border-b border-slate-100 last:border-0">
      <button type="button" onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-2 py-1.5 px-2 text-left hover:bg-slate-50 rounded">
        <span className="text-[11px] text-slate-500 w-28 shrink-0 truncate">{label(f.fact_key)}</span>
        <span className="flex-1 text-[12px]"><FactValue v={f} /></span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${tier.c}`}>{tier.l}</span>
        {open ? <ChevronUp className="w-3 h-3 text-slate-400" /> : <ChevronDown className="w-3 h-3 text-slate-400" />}
      </button>
      {open && (
        <div className="px-2 pb-2 text-[11px] text-slate-500 space-y-1">
          <div className="bg-slate-50 rounded p-2 italic">“{f.evidence_quote}”</div>
          <div className="flex items-center gap-3">
            {f.source_document_id ? <span className="flex items-center gap-1"><FileText className="w-3 h-3" /> {f.page_ref ? `p.${f.page_ref}` : 'doc'}</span> : null}
            {f.official_url ? <a href={f.official_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-blue-600 hover:underline"><ExternalLink className="w-3 h-3" /> official source</a> : null}
          </div>
        </div>
      )}
    </div>
  );
}

export default function SignageFactsPanel({ facts = [], jurisdictionName, compact = false }) {
  const [expanded, setExpanded] = useState(false);
  const groups = useMemo(() => {
    const g = {};
    for (const f of facts.filter(x => x.active !== false)) {
      const k = f.sign_type || 'general';
      (g[k] = g[k] || []).push(f);
    }
    return Object.entries(g).sort(([a], [b]) => (TYPE_ORDER.indexOf(a) === -1 ? 99 : TYPE_ORDER.indexOf(a)) - (TYPE_ORDER.indexOf(b) === -1 ? 99 : TYPE_ORDER.indexOf(b)));
  }, [facts]);

  if (!groups.length) return (
    <div className="text-[12px] text-slate-400 italic py-1">No signage facts extracted yet{jurisdictionName ? ` for ${jurisdictionName}` : ''} — the local extraction lane populates this as it scans source docs.</div>
  );

  const shown = expanded ? groups : groups.slice(0, compact ? 2 : 4);
  return (
    <div className="space-y-2">
      {shown.map(([type, rows]) => (
        <div key={type} className="border border-slate-200 rounded-lg overflow-hidden">
          <div className="bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-700 flex items-center gap-2">
            <Sparkles className="w-3 h-3 text-amber-500" />
            {label(type)} <span className="text-slate-400 font-normal">· {rows.length} fact{rows.length === 1 ? '' : 's'}</span>
          </div>
          <div>{rows.map((f, i) => <FactRow key={f.id || i} f={f} />)}</div>
        </div>
      ))}
      {groups.length > shown.length && (
        <button type="button" onClick={() => setExpanded(true)} className="text-[11px] text-blue-600 hover:underline">show {groups.length - shown.length} more sign types</button>
      )}
    </div>
  );
}
