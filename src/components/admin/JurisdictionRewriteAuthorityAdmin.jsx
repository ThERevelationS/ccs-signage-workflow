import { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle, Loader2, ShieldCheck } from "lucide-react";

const blank = {
  adoptionStatus: "not_verified",
  adoption_evidence_url: "",
  adoption_evidence_reference: "",
  effectiveDateStatus: "not_verified",
  effective_date: "",
  effective_date_evidence_url: "",
  verification_notes: "",
};

const normalizeDraft = (authority = {}) => ({
  ...blank,
  adoptionStatus: authority.adoptionStatus === "verified" ? "verified" : "not_verified",
  adoption_evidence_url: authority.adoption_evidence_url || "",
  adoption_evidence_reference: authority.adoption_evidence_reference || "",
  effectiveDateStatus: authority.effectiveDateStatus === "verified" ? "verified" : "not_verified",
  effective_date: authority.effective_date || "",
  effective_date_evidence_url: authority.effective_date_evidence_url || "",
  verification_notes: authority.verification_notes || "",
});

export default function JurisdictionRewriteAuthorityAdmin({ jurisdictions = [], onJurisdictionUpdated }) {
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const selected = useMemo(
    () => jurisdictions.find((j) => String(j.id) === String(selectedId)) || null,
    [jurisdictions, selectedId],
  );

  useEffect(() => {
    if (!selectedId && jurisdictions.length) setSelectedId(jurisdictions[0].id);
  }, [jurisdictions, selectedId]);

  useEffect(() => {
    setDraft(normalizeDraft(selected?.rewrite_authority));
    setMessage(null);
  }, [selected?.id, selected?.updated_date]);

  const set = (key, value) => setDraft((current) => ({ ...current, [key]: value }));

  const localError = () => {
    if (draft.adoptionStatus === "verified" && (!draft.adoption_evidence_url.trim() || !draft.adoption_evidence_reference.trim())) {
      return "Verified adoption requires an official evidence URL and stable ordinance/resolution/action reference.";
    }
    if (draft.effectiveDateStatus === "verified" && draft.adoptionStatus !== "verified") {
      return "Effectiveness cannot be verified before adoption is verified for this jurisdiction.";
    }
    if (draft.effectiveDateStatus === "verified" && (!draft.effective_date.trim() || !draft.effective_date_evidence_url.trim())) {
      return "Verified effectiveness requires the official effective date/applicability statement and official evidence URL.";
    }
    return "";
  };

  const save = async () => {
    if (!selected) return;
    const validation = localError();
    if (validation) {
      setMessage({ type: "error", text: validation });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const response = await base44.functions.invoke("updateJurisdictionRewriteAuthority", {
        jurisdiction_id: selected.id,
        expected_updated_date: selected.updated_date,
        authority: draft,
      });
      const data = response?.data || response;
      if (!data?.success || !data?.jurisdiction?.id) throw new Error(data?.error || "Authority update could not be verified.");
      onJurisdictionUpdated?.(data.jurisdiction);
      setDraft(normalizeDraft(data.jurisdiction.rewrite_authority));
      setMessage({ type: "success", text: "Rewrite authority evidence saved and verified against the current jurisdiction version." });
    } catch (error) {
      setMessage({ type: "error", text: error?.message || "Rewrite authority evidence could not be saved safely." });
    } finally {
      setSaving(false);
    }
  };

  const promotable = draft.adoptionStatus === "verified" && draft.effectiveDateStatus === "verified";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" />Rewrite Authority Verification</CardTitle>
        <CardDescription>
          Fail closed by jurisdiction. A rewrite becomes authoritative only after this jurisdiction has verified legislative adoption and verified effective-date/applicability evidence.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Jurisdiction</label>
          <select
            value={selectedId}
            onChange={(event) => setSelectedId(event.target.value)}
            disabled={saving}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
          >
            {jurisdictions.map((j) => <option key={j.id} value={j.id}>{j.name} ({j.state})</option>)}
          </select>
        </div>

        {selected && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={promotable ? "default" : "secondary"}>{promotable ? "Verified rewrite authority" : "Retain current adopted authority"}</Badge>
              <span className="text-xs text-gray-500">Jurisdiction ID: {selected.id}</span>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-3 rounded-lg border border-gray-200 p-4">
                <div className="font-medium text-gray-900">Legislative adoption</div>
                <select value={draft.adoptionStatus} onChange={(e) => set("adoptionStatus", e.target.value)} disabled={saving} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
                  <option value="not_verified">Not verified</option>
                  <option value="verified">Verified</option>
                </select>
                <input value={draft.adoption_evidence_reference} onChange={(e) => set("adoption_evidence_reference", e.target.value)} disabled={saving} placeholder="Ordinance / resolution / meeting action reference" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
                <input value={draft.adoption_evidence_url} onChange={(e) => set("adoption_evidence_url", e.target.value)} disabled={saving} placeholder="Official adoption evidence URL" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
              </div>

              <div className="space-y-3 rounded-lg border border-gray-200 p-4">
                <div className="font-medium text-gray-900">Effective date / applicability</div>
                <select value={draft.effectiveDateStatus} onChange={(e) => set("effectiveDateStatus", e.target.value)} disabled={saving} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
                  <option value="not_verified">Not verified</option>
                  <option value="verified">Verified</option>
                </select>
                <input value={draft.effective_date} onChange={(e) => set("effective_date", e.target.value)} disabled={saving} placeholder="Official effective date or applicability statement" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
                <input value={draft.effective_date_evidence_url} onChange={(e) => set("effective_date_evidence_url", e.target.value)} disabled={saving} placeholder="Official effective-date evidence URL" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
              </div>
            </div>

            <textarea value={draft.verification_notes} onChange={(e) => set("verification_notes", e.target.value)} disabled={saving} rows={3} placeholder="Authority review notes and jurisdiction-specific caveats" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />

            {message && (
              <div className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${message.type === "success" ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-800"}`}>
                {message.type === "success" ? <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
                <span>{message.text}</span>
              </div>
            )}

            <Button onClick={save} disabled={saving || !selected} className="min-w-40">
              {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : "Save authority evidence"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
