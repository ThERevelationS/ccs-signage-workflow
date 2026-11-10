// MP-8.3 — Rules transparency: every auto-resolution the pipeline minted,
// visible to staff. A rule says "addresses/names like THIS decided to THAT
// jurisdiction" — postal_name_map covers a whole entered-name class,
// address_override covers one address. Retiring a rule stops it applying.
import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Route, MapPin, Ban } from "lucide-react";
import { loadAllEntityRows } from "@/lib/loadAllEntityRows";
import { staffEntities } from "@/components/staff/staffEntities";

const TYPE_LABEL = {
  postal_name_map: "Postal name",
  address_override: "Address",
};

export default function PermittingRulesList() {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retiring, setRetiring] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const rows = await loadAllEntityRows({
        entity: staffEntities.PermitResolutionRule,
        sort: "-created_date",
        label: "Permit resolution rules",
      });
      setRules(Array.isArray(rows) ? rows : []);
      setError(null);
    } catch (e) {
      setError(String(e?.message || e));
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const retire = async (rule) => {
    setRetiring(rule.id);
    try {
      await staffEntities.PermitResolutionRule.update(rule.id, { active: false });
      setRules((r) => r.map((x) => x.id === rule.id ? { ...x, active: false } : x));
    } catch (e) { setError(`Could not retire rule "${rule.jurisdiction_name || rule.id}": ${e?.message || e}`); } finally { setRetiring(null); }
  };

  const active = rules.filter((r) => r.active !== false);
  const inactive = rules.length - active.length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Route className="w-5 h-5 text-indigo-500" />
          Address Resolution Rules
        </CardTitle>
        <CardDescription>
          {active.length} active{inactive ? ` · ${inactive} retired` : ""} — decisions the
          address pipeline reuses automatically (staff picks + parcel-GIS auto-rules)
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        ) : error ? (
          <p className="text-sm text-red-500 py-4">{error}</p>
        ) : !rules.length ? (
          <p className="text-sm text-gray-500 text-center py-8">
            No rules yet — they mint when staff resolves a flagged address or a county parcel map settles a boundary case.
          </p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {rules.map((r) => (
              <div key={r.id}
                className={`flex items-start gap-3 p-3 rounded-lg border ${r.active === false ? "opacity-50 border-gray-100" : "border-gray-200"}`}>
                <MapPin className="w-4 h-4 mt-0.5 text-gray-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">
                    {r.rule_type === "address_override"
                      ? <>{'"'}{(r.address_key || r.created_from_address || '').slice(0, 60)}{'"'}</>
                      : <>{'"'}{r.entered_name}{'"'}{r.county ? ` (${r.county} Co)` : ""}</>}
                    {" → "}
                    <span className="text-indigo-600">{r.jurisdiction_name}</span>
                    <span className="text-gray-400 font-normal"> ({r.jurisdiction_type || "jurisdiction"}, {r.state})</span>
                  </p>
                  <div className="flex gap-2 mt-1 flex-wrap items-center">
                    <Badge variant="outline" className="text-xs">{TYPE_LABEL[r.rule_type] || r.rule_type}</Badge>
                    <Badge variant="outline" className={`text-xs ${r.source === "staff_review" ? "bg-blue-50" : "bg-emerald-50"}`}>
                      {r.source === "staff_review" ? "staff decision" : r.source || "auto"}
                    </Badge>
                    {r.active === false && <Badge variant="outline" className="text-xs bg-gray-100">retired</Badge>}
                  </div>
                  {r.evidence && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{r.evidence}</p>}
                </div>
                {r.active !== false && (
                  <Button size="sm" variant="ghost" className="text-xs text-gray-400 hover:text-red-600"
                    disabled={retiring === r.id} onClick={() => retire(r)}>
                    {retiring === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Ban className="w-3 h-3" />}
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
