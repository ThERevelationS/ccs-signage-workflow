import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search, Loader2, MapPin, AlertTriangle, CheckCircle2, Zap, ZapOff, X, Save } from "lucide-react";
import GoogleMapView from "./GoogleMapView";
import { useAuth } from "@/components/auth/EmailGate";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";
import { createPermitLocalityIfAbsent } from "./permitLocalityPersistence";
import {
  findRepositoryJurisdictionMatches,
  hasDuplicateRepositoryIdentity,
  jurisdictionToDraftPermitLocality,
} from "./jurisdictionPermitBridge";
import { assessJurisdictionTrust } from "./jurisdictionTrust";

const AUTHORITY_ROLE_LABELS = {
  sign_permit: "Sign permit",
  zoning: "Zoning",
  building: "Building",
  electrical: "Electrical",
  right_of_way: "ROW / public works",
  historic_review: "Historic review",
  planning: "Planning",
  transportation: "Transportation",
  other: "Other",
};

function verifiedAuthoritySummary(locality) {
  const verified = (locality?.offices || []).filter(office =>
    office?.authority_verification_status === "staff_verified" &&
    Array.isArray(office?.authority_roles) && office.authority_roles.length > 0
  );
  const roles = [...new Set(verified.flatMap(office => office.authority_roles))];
  return {
    officeCount: verified.length,
    labels: roles.map(role => AUTHORITY_ROLE_LABELS[role] || role),
  };
}

export default function LocalityPickerDialog({
  isOpen,
  onClose,
  localities,
  onApply,  // (localityId, { excludeElectrical }) => void
}) {
  const { sessionToken } = useAuth();
  const [address, setAddress] = useState("");
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState(null); // full AI result
  const [error, setError] = useState("");
  const [excludeElectrical, setExcludeElectrical] = useState(false);
  const [selectedLocalityId, setSelectedLocalityId] = useState("");
  const [repositoryJurisdictions, setRepositoryJurisdictions] = useState([]);
  const [repositoryLoading, setRepositoryLoading] = useState(false);
  const [repositoryError, setRepositoryError] = useState("");
  const [draftCandidate, setDraftCandidate] = useState(null);
  const [draftCreateError, setDraftCreateError] = useState("");
  const [creatingDraft, setCreatingDraft] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setAddress("");
      setResult(null);
      setError("");
      setSelectedLocalityId("");
      setExcludeElectrical(false);
      setDraftCandidate(null);
      setDraftCreateError("");
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    let cancelled = false;
    setRepositoryLoading(true);
    setRepositoryError("");

    loadAllEntityRows({
      entity: base44.entities.JurisdictionProfile,
      sort: "name",
      label: "Permitting locality picker repository",
    }).then((rows) => {
      if (!cancelled) setRepositoryJurisdictions(Array.isArray(rows) ? rows : []);
    }).catch((e) => {
      console.error("Could not load Jurisdiction Repository in locality picker:", e);
      if (!cancelled) setRepositoryError("The Jurisdiction Repository could not be loaded. You can still use an existing configured locality.");
    }).finally(() => {
      if (!cancelled) setRepositoryLoading(false);
    });

    return () => { cancelled = true; };
  }, [isOpen]);

  const runSearch = async () => {
    if (!address.trim()) return;
    setSearching(true);
    setError("");
    setResult(null);
    try {
      const { data } = await base44.functions.invoke('findLocalityByAddress', {
        address: address.trim(),
        session_token: sessionToken,
      });
      if (data?.success === false) {
        setError(data.error || "Search failed");
      } else {
        setResult(data);
        if (data?.suggested_locality?.id) {
          setSelectedLocalityId(data.suggested_locality.id);
        }
      }
    } catch (e) {
      setError(e.message || "Search failed");
    }
    setSearching(false);
  };

  const selectedLocality = localities.find(locality => locality.id === selectedLocalityId);
  const selectedAuthority = verifiedAuthoritySummary(selectedLocality);

  const handleApply = () => {
    if (!selectedLocalityId) return;
    onApply(selectedLocalityId, { excludeElectrical });
    onClose();
  };

  const repositoryMatches = result
    ? findRepositoryJurisdictionMatches(repositoryJurisdictions, result)
    : [];

  const requestDraftFromRepository = (jurisdiction) => {
    setDraftCreateError("");
    if (hasDuplicateRepositoryIdentity(repositoryJurisdictions, jurisdiction)) {
      setDraftCreateError(`Multiple repository profiles match ${jurisdiction.name}, ${jurisdiction.state || ""}. Review and resolve the duplicate profiles before creating a permit locality.`);
      return;
    }
    setDraftCandidate(jurisdiction);
  };

  const confirmDraftFromRepository = async () => {
    if (!draftCandidate || creatingDraft) return;
    setCreatingDraft(true);
    setDraftCreateError("");

    try {
      const payload = jurisdictionToDraftPermitLocality(draftCandidate);
      const createResult = await createPermitLocalityIfAbsent({
        entity: base44.entities.PermitLocality,
        data: payload,
        readCurrentLocalities: () => loadAllEntityRows({
          entity: base44.entities.PermitLocality,
          sort: "name",
          label: "Permit locality repository bridge identity",
        }),
        label: `Permit locality draft ${payload.name}`,
      });
      const locality = createResult.record;
      setSelectedLocalityId(locality.id);
      setDraftCandidate(null);
      onApply(locality.id, { excludeElectrical, locality });
      onClose();
    } catch (e) {
      console.error("Could not create Permit locality draft from repository:", e);
      setDraftCreateError(e?.message || "The draft locality could not be created safely. Nothing was applied to this Work Order.");
    } finally {
      setCreatingDraft(false);
    }
  };

  const mapPosition = result?.geocode ? { lat: result.geocode.lat, lng: result.geocode.lon } : null;
  const markerTitle = result?.geocode?.display_name || "";

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="clay-card border-none max-w-[1400px] w-[95vw] max-h-[92vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-purple-600" />
            Select Locality for this Project
          </DialogTitle>
        </DialogHeader>

        {/* Address search bar */}
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex-1 min-w-0 w-full sm:min-w-[280px]">
            <Label className="text-xs">Address (AI will identify the locality, zoning, and parcel info)</Label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input
                ref={inputRef}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="e.g. 4900 Parkway Dr, Mason, OH 45040"
                className="h-9 pl-8 text-sm"
                onKeyDown={(e) => e.key === 'Enter' && !searching && runSearch()}
              />
            </div>
          </div>
          <Button onClick={runSearch} disabled={searching || !address.trim()} className="bg-purple-600 hover:bg-purple-700 gap-1 h-9 w-full sm:w-auto">
            {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            {searching ? "Searching…" : "AI Lookup"}
          </Button>

          {/* Electrical inspector toggle */}
          <Button
            variant="outline"
            onClick={() => setExcludeElectrical(v => !v)}
            className={`gap-1 h-9 w-full sm:w-auto ${excludeElectrical ? 'border-red-400 bg-red-50 text-red-700 hover:bg-red-100' : 'border-amber-400 bg-amber-50 text-amber-700 hover:bg-amber-100'}`}
            title={excludeElectrical ? "Electrical Inspectors will be hidden/excluded" : "Electrical Inspectors will be included"}
          >
            {excludeElectrical ? <ZapOff className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
            {excludeElectrical ? "Electrical: OFF" : "Electrical: ON"}
          </Button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded p-2 text-sm text-red-700 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Responsive split: stacked on smaller screens, two columns on desktop. */}
        <div className="flex flex-1 flex-col lg:flex-row gap-3 overflow-y-auto lg:overflow-hidden min-h-0 lg:h-[680px]">
          <div className="w-full lg:w-[420px] lg:flex-shrink-0 lg:overflow-y-auto space-y-3 pr-1">
            {!result && !searching && (
              <div className="h-full flex items-center justify-center text-gray-400 text-sm p-8 text-center border border-dashed rounded">
                Enter an address above and click <strong>AI Lookup</strong> to get locality, zoning, and parcel info.
              </div>
            )}

            {searching && (
              <div className="h-full flex flex-col items-center justify-center text-gray-500 p-8">
                <Loader2 className="w-8 h-8 animate-spin text-purple-500 mb-2" />
                <p className="text-sm">Looking up locality, zoning & parcel data…</p>
              </div>
            )}

            {result && (
              <>
                {/* Locality match */}
                <div className={`border rounded-lg p-3 ${result.suggested_locality ? 'border-green-300 bg-green-50' : 'border-amber-300 bg-amber-50'}`}>
                  <div className="flex items-center gap-2 mb-1.5">
                    {result.suggested_locality ? (
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-amber-600" />
                    )}
                    <h4 className="font-semibold text-sm">Locality Match</h4>
                  </div>
                  {result.suggested_locality ? (
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-green-900">
                          {result.suggested_locality.name}
                          {result.suggested_locality.state && ` (${result.suggested_locality.state})`}
                        </p>
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${result.match_confidence === 'high' ? 'border-green-300 bg-green-100 text-green-800' : 'border-amber-300 bg-amber-100 text-amber-800'}`}>
                          {result.match_confidence === 'high' ? 'High confidence' : 'Medium confidence'}
                        </span>
                      </div>
                      {result.match_reason && (
                        <p className="text-[11px] text-green-800 mt-1">{result.match_reason}</p>
                      )}
                      {result.suggested_locality.zip && (
                        <p className="text-xs text-green-700">ZIP: {result.suggested_locality.zip}</p>
                      )}
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm text-amber-900">
                        <strong>No match found in your system.</strong>
                      </p>
                      {result.ai_locality_name && (
                        <p className="text-xs text-amber-800 mt-1">
                          AI suggests: <strong>{result.ai_locality_name}</strong>
                          {result.ai_state && `, ${result.ai_state}`}
                          {result.ai_county && ` (${result.ai_county} County)`}
                        </p>
                      )}
                      <p className="text-[11px] text-amber-700 mt-1 italic">
                        No configured tracker locality matches yet. Check the Jurisdiction Repository match below, or choose an existing locality manually.
                      </p>
                      {result.match_reason && (
                        <p className="text-[11px] text-amber-800 mt-1">{result.match_reason}</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Repository bridge — explicit draft creation only; never treat AI/repository data as verified workflow. */}
                {!result.suggested_locality && (
                  <div className="border rounded-lg p-3 bg-violet-50 border-violet-200 space-y-2">
                    <div>
                      <h4 className="font-semibold text-sm text-violet-950">Jurisdiction Repository</h4>
                      <p className="text-[11px] text-violet-800 mt-0.5">
                        Repository data is reference material, not proof of permitting authority. Review it before creating a tracker locality.
                      </p>
                    </div>

                    {repositoryLoading && (
                      <div className="text-xs text-violet-700 flex items-center gap-1.5">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking repository…
                      </div>
                    )}

                    {repositoryError && (
                      <div className="text-xs text-red-700 flex items-start gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                        <span>{repositoryError}</span>
                      </div>
                    )}

                    {!repositoryLoading && !repositoryError && repositoryMatches.length === 0 && (
                      <p className="text-xs text-violet-700">No matching repository profile was found.</p>
                    )}

                    {!repositoryLoading && repositoryMatches.map((jurisdiction) => {
                      const duplicate = hasDuplicateRepositoryIdentity(repositoryJurisdictions, jurisdiction);
                      const trust = assessJurisdictionTrust(jurisdiction, duplicate ? 2 : 1);
                      const parentCounty = jurisdiction.parent_county?.name;
                      const contact = jurisdiction.contact_info || {};
                      return (
                        <div key={jurisdiction.id} className="rounded-md border border-violet-200 bg-white p-2.5">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-900">{jurisdiction.name}{jurisdiction.state ? `, ${jurisdiction.state}` : ""}</p>
                              <p className="text-[11px] text-gray-500 capitalize">
                                {jurisdiction.type || "jurisdiction"}{parentCounty ? ` • Parent: ${parentCounty}` : ""}
                              </p>
                              <span className={`inline-flex mt-1 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${trust.className}`} title={trust.description}>
                                {trust.label}
                              </span>
                              {contact.department && contact.department !== "INFORMATION NOT FOUND" && (
                                <p className="text-xs text-gray-700 mt-1">{contact.department}</p>
                              )}
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={duplicate || creatingDraft}
                              onClick={() => requestDraftFromRepository(jurisdiction)}
                              className="h-7 text-xs border-violet-300 text-violet-800 hover:bg-violet-100 flex-shrink-0"
                            >
                              Create draft & apply
                            </Button>
                          </div>
                          {duplicate ? (
                            <p className="text-[11px] text-amber-700 mt-1.5 flex items-start gap-1">
                              <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" /> Duplicate repository profiles must be resolved before this can be used.
                            </p>
                          ) : trust.issues.length > 0 ? (
                            <p className="text-[11px] text-amber-700 mt-1.5 flex items-start gap-1">
                              <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" /> {trust.issues[0]}{trust.issues.length > 1 ? ` +${trust.issues.length - 1} more review item${trust.issues.length - 1 === 1 ? '' : 's'}` : ''}.
                            </p>
                          ) : null}
                        </div>
                      );
                    })}

                    {draftCreateError && (
                      <div className="text-xs text-red-700 flex items-start gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                        <span>{draftCreateError}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Locality override — allow manual pick */}
                {localities.length > 0 && (
                  <div className="border rounded-lg p-3 bg-white">
                    <Label className="text-xs">Choose locality to apply</Label>
                    <select
                      value={selectedLocalityId}
                      onChange={(e) => setSelectedLocalityId(e.target.value)}
                      className="w-full h-8 text-sm border rounded px-2 mt-1"
                    >
                      <option value="">— Select —</option>
                      {localities.map(l => (
                        <option key={l.id} value={l.id}>
                          {l.name}{l.state ? ` (${l.state})` : ''}{l.zip ? ` ${l.zip}` : ''}
                        </option>
                      ))}
                    </select>
                    {selectedLocality && (
                      selectedAuthority.officeCount > 0 ? (
                        <div className="mt-2 rounded border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-[11px] text-emerald-900">
                          <div className="flex items-center gap-1 font-semibold">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            {selectedAuthority.officeCount} staff-verified authorit{selectedAuthority.officeCount === 1 ? "y" : "ies"}
                          </div>
                          <p className="mt-0.5">{selectedAuthority.labels.join(" • ")}</p>
                          <p className="mt-1 text-emerald-800">Only these roles are confirmed authority relationships; other configured offices remain workflow references.</p>
                        </div>
                      ) : (
                        <div className="mt-2 rounded border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-900">
                          <div className="flex items-center gap-1 font-semibold">
                            <AlertTriangle className="h-3.5 w-3.5" /> No staff-verified office authority
                          </div>
                          <p className="mt-1">Configured offices can still be applied with the existing workflow, but none are confirmed here as the legal authority for this locality.</p>
                        </div>
                      )
                    )}
                  </div>
                )}

                {/* Zoning */}
                {(result.zoning?.district_code || result.zoning?.district_name || result.zoning?.summary) && (
                  <div className="border rounded-lg p-3 bg-blue-50 border-blue-200">
                    <h4 className="font-semibold text-sm mb-1.5 text-blue-900">🏛️ Zoning</h4>
                    {result.zoning.district_code && (
                      <p className="text-xs"><strong>District:</strong> {result.zoning.district_code}{result.zoning.district_name ? ` — ${result.zoning.district_name}` : ''}</p>
                    )}
                    {result.zoning.summary && (
                      <p className="text-xs mt-1 text-blue-900/80">{result.zoning.summary}</p>
                    )}
                  </div>
                )}

                {/* Parcel */}
                {(result.parcel?.owner || result.parcel?.parcel_number || result.parcel?.lot_size_acres) && (
                  <div className="border rounded-lg p-3 bg-purple-50 border-purple-200">
                    <h4 className="font-semibold text-sm mb-1.5 text-purple-900">📋 Parcel Info</h4>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-purple-900">
                      {result.parcel.owner && <div><strong>Owner:</strong> {result.parcel.owner}</div>}
                      {result.parcel.lot_size_acres && <div><strong>Lot size:</strong> {result.parcel.lot_size_acres} ac</div>}
                      {result.parcel.parcel_number && <div className="col-span-2"><strong>Parcel #:</strong> {result.parcel.parcel_number}</div>}
                      {result.parcel.source_url && (
                        <div className="col-span-2">
                          <a href={result.parcel.source_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline text-[11px]">
                            View source →
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {result.notes && (
                  <div className="text-[11px] text-gray-500 italic px-1">{result.notes}</div>
                )}
              </>
            )}
          </div>

          {/* Map stays visible on mobile without forcing a 420px results column beside it. */}
          <div className="rounded-lg overflow-hidden border relative w-full min-h-[280px] lg:min-h-0 lg:flex-1 lg:aspect-square lg:self-start lg:max-h-[680px] bg-gray-100">
            <GoogleMapView position={mapPosition} markerTitle={markerTitle} />
          </div>
        </div>

        {/* Footer */}
        <AlertDialog
          open={!!draftCandidate}
          onOpenChange={(open) => {
            if (!open && !creatingDraft) setDraftCandidate(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Create a draft permit locality?</AlertDialogTitle>
              <AlertDialogDescription>
                This will copy the repository contact information for {draftCandidate?.name || "this jurisdiction"} into a new Permit locality and add only three generic tracking milestones: Application Submitted, Follow-up, and Permit Received. It will not copy AI permit requirements, fees, deadlines, or approval claims. Verify the responsible office and workflow before relying on it for submission.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {draftCreateError && (
              <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">{draftCreateError}</div>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={creatingDraft}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={creatingDraft}
                onClick={(e) => {
                  e.preventDefault();
                  confirmDraftFromRepository();
                }}
              >
                {creatingDraft ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
                Create Draft & Apply
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-t pt-3">
          <div className="text-[11px] text-gray-500">
            {excludeElectrical ? "🚫 Electrical Inspectors will be excluded" : "⚡ Electrical Inspectors will be included"}
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <Button variant="outline" onClick={onClose} className="gap-1 flex-1 sm:flex-none">
              <X className="w-4 h-4" /> Close
            </Button>
            <Button
              onClick={handleApply}
              disabled={!selectedLocalityId}
              className="bg-purple-600 hover:bg-purple-700 gap-1 flex-1 sm:flex-none"
            >
              <Save className="w-4 h-4" /> Save & Apply
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}