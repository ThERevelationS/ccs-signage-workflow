import { useEffect, useMemo, useState } from "react";
import { staffEntities } from "@/components/staff/staffEntities";
import SignageFactsPanel from "./SignageFactsPanel";
import { MapPin, Search } from "lucide-react";

// ClientSignagePanel — resolves a customer's site address → PermitLookupIndex
// → jurisdiction → SignageFact cards. One indexed read when the address was
// previously resolved; compact, invisible when nothing resolves.
const normAddr = (a) => String(a || '').toLowerCase().replace(/\s+/g, ' ').replace(/[^a-z0-9 ]/g, '').trim();

export default function ClientSignagePanel({ customer }) {
  const [facts, setFacts] = useState(null);
  const [jurisdiction, setJurisdiction] = useState(null);
  const address = useMemo(() => {
    const parts = [customer?.location_address_1, customer?.location_city, customer?.location_state, customer?.location_zip].filter(Boolean);
    return parts.join(' ').trim();
  }, [customer]);

  useEffect(() => {
    let alive = true;
    setFacts(null); setJurisdiction(null);
    if (!address) { setFacts([]); return; }
    (async () => {
      // join: normalized site address → PermitLookupIndex.address_key → jurisdiction
      const lk = await staffEntities.PermitLookupIndex.filter({ address_key: normAddr(address) }, { limit: 5 }).catch(() => null);
      const row = (lk?.items || lk || []).find(r => r.jurisdiction_name);
      if (!row) { if (alive) { setFacts([]); } return; }
      const name = row.jurisdiction_name;
      if (alive) setJurisdiction(name);
      const fx = await staffEntities.SignageFact.filter({ jurisdiction_name: name, active: true }, { limit: 500 }).catch(() => null);
      if (alive) setFacts(fx?.items || fx || []);
    })();
    return () => { alive = false; };
  }, [address]);

  if (!facts || !facts.length) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-700">
          <MapPin className="w-3.5 h-3.5 text-blue-500" />
          Signage — {jurisdiction || 'resolved jurisdiction'}
        </div>
        <a href="/PermittingSearch" className="flex items-center gap-1 text-[11px] text-blue-600 hover:underline"><Search className="w-3 h-3" /> search all</a>
      </div>
      <SignageFactsPanel facts={facts} jurisdictionName={jurisdiction} compact />
    </div>
  );
}
