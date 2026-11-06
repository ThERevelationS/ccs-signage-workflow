import { useEffect, useMemo, useState } from "react";
import { staffEntities } from "@/components/staff/staffEntities";
import SignageFactsPanel from "@/components/permitting/SignageFactsPanel";
import { Search, MapPin, FileText, ExternalLink, Loader2 } from "lucide-react";

// PermittingSearch — the signage ask-box page.
// One input → parse terms → indexed lookup → fact cards + citations.
// Index-driven, not live-LLM — fast reads via SignageFactIndex.
const STOP = new Set('the a an and or of to in for on at by with is are was were be been do does what which how many much when can i my our their a an'.split(' '));
const STOPWORDS = new Set([...STOP, 'sign', 'signs', 'signage', 'rules', 'rule', 'requirements', 'required', 'allowed']);
const JX_WORD = /(?:^|\s)(in|of|for)\s+([a-z][a-z .'-]{2,40})(?:,|\s|$)/i;

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9_ ]+/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOPWORDS.has(w));

export default function PermittingSearch() {
  const [q, setQ] = useState('');
  const [jurisdictions, setJurisdictions] = useState([]);
  const [jx, setJx] = useState(null); // chosen jurisdiction row
  const [facts, setFacts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [hits, setHits] = useState([]); // ranked hits

  // jurisdiction list for the picker
  useEffect(() => {
    staffEntities.JurisdictionProfile.filter({ state: { $in: ['OH', 'KY'] } }, { limit: 5000, fields: 'id,name,state' })
      .then(r => setJurisdictions(r?.items || r || []))
      .catch(() => {});
  }, []);

  const ask = async () => {
    if (!q.trim()) return;
    setLoading(true); setSearched(true); setHits([]);
    const terms = norm(q);
    const jxMatch = q.match(JX_WORD);
    // resolve jurisdiction: explicit picker choice > name inside question
    let target = jx;
    if (!target && jxMatch) {
      const name = jxMatch[2].trim().toLowerCase();
      target = jurisdictions.find(j => String(j.name).toLowerCase() === name)
        || jurisdictions.find(j => String(j.name).toLowerCase().includes(name));
      if (target) setJx(target);
    }
    try {
      let rows = [];
      if (target?.id) {
        // scoped: all facts for the jurisdiction, rank client-side by term match
        const all = await staffEntities.SignageFact.filter({ jurisdiction_id: target.id, active: true }, { limit: 500 });
        rows = (all?.items || all || []);
      }
      // index-driven term match on SignageFactIndex
      if (terms.length) {
        const ixRows = await staffEntities.SignageFactIndex.filter(
          target?.id ? { jurisdiction_id: target.id, term: { $in: terms.slice(0, 20) } } : { term: { $in: terms.slice(0, 20) } },
          { limit: 200 });
        const ix = (ixRows?.items || ixRows || []);
        const score = {};
        for (const x of ix) score[x.fact_id] = (score[x.fact_id] || 0) + (x.weight || 1);
        const ids = Object.entries(score).sort((a, b) => b[1] - a[1]).slice(0, 40).map(([id]) => id);
        if (ids.length) {
          const fRows = await staffEntities.SignageFact.filter({ id: { $in: ids } }, { limit: 60 });
          const byId = new Map((fRows?.items || fRows || []).map(r => [r.id, r]));
          const ranked = ids.map(id => byId.get(id)).filter(f => f && f.active !== false);
          if (!target?.id) rows = ranked;
          else {
            // merge index-ranked hits with the scoped rows for ordering
            const rank = new Map(ranked.map(r => [r.id, score[r.id] || 0]));
            rows = [...rows].sort((a, b) => (rank.get(b.id) || 0) - (rank.get(a.id) || 0));
          }
          setHits(ranked.slice(0, 8));
        }
      }
      setFacts(rows);
    } catch (e) {
      setFacts([]);
    } finally { setLoading(false); }
  };

  const byJx = useMemo(() => {
    const g = {};
    for (const f of facts) (g[f.jurisdiction_name || 'unknown'] = g[f.jurisdiction_name || 'unknown'] || []).push(f);
    return Object.entries(g);
  }, [facts]);

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Signage search</h1>
          <p className="text-sm text-slate-500">Ask anything — pole sign height in Boone County, wall sign permit fee, EMC rules…</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Ask about sign rules — e.g. 'freestanding sign height in Florence'"
                value={q}
                onChange={e => setQ(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && ask()}
              />
            </div>
            <select className="border border-slate-200 rounded-lg px-2 py-2 text-sm text-slate-600 max-w-[220px]" value={jx?.id || ''} onChange={e => setJx(jurisdictions.find(j => j.id === e.target.value) || null)}>
              <option value="">all jurisdictions</option>
              {jurisdictions.map(j => <option key={j.id} value={j.id}>{j.name}{j.state ? `, ${j.state}` : ''}</option>)}
            </select>
            <button onClick={ask} disabled={loading || !q.trim()} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Ask'}
            </button>
          </div>

          {jx && (
            <div className="flex items-center gap-1 text-[12px] text-slate-500">
              <MapPin className="w-3 h-3" /> Scoped to <b className="text-slate-700">{jx.name}{jx.state ? `, ${jx.state}` : ''}</b>
              <button className="text-blue-600 hover:underline ml-2" onClick={() => { setJx(null); setFacts([]); }}>clear</button>
            </div>
          )}
        </div>

        {searched && !loading && (
          <>
            {hits.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <div className="text-[12px] font-semibold text-blue-800 mb-2">Top matches</div>
                <div className="space-y-1.5">
                  {hits.map(f => (
                    <div key={f.id} className="text-[12px] text-slate-700 flex items-start gap-2">
                      <span className="text-blue-600 mt-0.5">•</span>
                      <span><b>{(f.sign_type || 'general').replaceAll('_', ' ')}</b> · {(f.fact_key || '').replaceAll('_', ' ')} — {f.value_json?.value != null ? String(f.value_json.value) + (f.value_json.unit ? ' ' + f.value_json.unit : '') : 'stated'}{f.jurisdiction_name ? ` · ${f.jurisdiction_name}` : ''}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {!facts.length && (
              <div className="bg-white border border-slate-200 rounded-xl p-6 text-center text-sm text-slate-500">
                No indexed facts match{jx ? ` for ${jx.name}` : ''}. The extraction lane builds coverage as it scans sources — try a broader jurisdiction or re-check soon.
              </div>
            )}
            {byJx.map(([name, rows]) => (
              <div key={name} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-slate-400" />
                    <span className="font-semibold text-slate-800 text-sm">{name}</span>
                  </div>
                  <span className="text-[11px] text-slate-400">{rows.length} fact{rows.length === 1 ? '' : 's'}</span>
                </div>
                <SignageFactsPanel facts={rows} jurisdictionName={name} compact />
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
