import React, { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/components/auth/EmailGate";
import { Button } from "@/components/ui/button";
import { Loader2, BookOpen, AlertCircle } from "lucide-react";
import SopBrowser from "@/components/sop/SopBrowser";
import SopDetail from "@/components/sop/SopDetail";
import SopEditor from "@/components/sop/SopEditor";
import SopAdminPanel from "@/components/sop/SopAdminPanel";
import SopPrint, { SOP_PRINT_CSS } from "@/components/sop/SopPrint";
import AiSopBuilderDialog from "@/components/sop/AiSopBuilderDialog";
import {
  sopBootstrap, sopCreate, sopUpdate, sopSetStatus, sopDelete, sopAcknowledge,
} from "@/components/sop/sopService";
import { newSopDraft } from "@/components/sop/sopModel";

// The SOP module front page: browse procedures by department, read them with
// photos/video, and — for admins and named editors — build new ones with AI
// assist (dictation, notes-to-draft, per-step polish, photo-to-step). All
// persistence goes through the session-authenticated manageSops function.

export default function SOP() {
  const { currentUser } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [settings, setSettings] = useState(null);
  const [settingsDate, setSettingsDate] = useState("");
  const [sops, setSops] = useState([]);
  const [me, setMe] = useState(null);
  const [view, setView] = useState("browse"); // browse | detail | edit
  const [activeSop, setActiveSop] = useState(null);
  const [isNewDraft, setIsNewDraft] = useState(false);
  const [draftEpoch, setDraftEpoch] = useState(0);
  const [adminOpen, setAdminOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [printSop, setPrintSop] = useState(null);
  const [busy, setBusy] = useState(false);
  const [acknowledging, setAcknowledging] = useState(false);

  const categoryParam = searchParams.get("category") || "all";

  const bootstrap = useCallback(async () => {
    try {
      const res = await sopBootstrap();
      setSettings(res?.settings || null);
      setSettingsDate(res?.settings_updated_date || "");
      setSops(Array.isArray(res?.sops) ? res.sops : []);
      setMe(res?.me || null);
      setError("");
    } catch (e) {
      setError(e?.message || "Could not load SOPs.");
    }
    setLoading(false);
  }, []);

  useEffect(() => { bootstrap(); }, [bootstrap]);

  // Deep links: ?sop=<id> opens detail, ?edit=<id> opens the editor.
  useEffect(() => {
    if (loading) return;
    const sopId = searchParams.get("sop");
    const editId = searchParams.get("edit");
    if (editId) {
      const found = sops.find((s) => s.id === editId);
      if (found) { setActiveSop(found); setIsNewDraft(false); setView("edit"); }
    } else if (sopId) {
      const found = sops.find((s) => s.id === sopId);
      if (found) { setActiveSop(found); setView("detail"); }
    }
  }, [loading, sops, searchParams]);

  const setParam = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value); else next.delete(key);
    setSearchParams(next, { replace: true });
  };

  const setParams = (entries) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(entries)) {
      if (value) next.set(key, value); else next.delete(key);
    }
    setSearchParams(next, { replace: true });
  };

  const openDetail = (sop) => {
    setActiveSop(sop);
    setView("detail");
    setParams({ sop: sop.id, edit: "" });
  };

  const goBrowse = () => {
    setView("browse");
    setActiveSop(null);
    const next = new URLSearchParams(searchParams);
    next.delete("sop");
    next.delete("edit");
    setSearchParams(next, { replace: true });
  };

  const startNew = () => {
    setActiveSop(newSopDraft(settings, currentUser));
    setIsNewDraft(true);
    setDraftEpoch((n) => n + 1);
    setView("edit");
  };

  const startEdit = (sop) => {
    setActiveSop(sop);
    setIsNewDraft(false);
    setDraftEpoch((n) => n + 1);
    setView("edit");
    setParams({ edit: sop.id, sop: "" });
  };

  const applyAiDraft = (draft) => {
    const editingExisting = view === "edit" && !isNewDraft && activeSop?.id;
    const base = editingExisting ? { ...activeSop } : newSopDraft(settings, currentUser);
    setActiveSop({
      ...base,
      title: draft.title || base.title,
      category: draft.category || base.category,
      summary: draft.summary || base.summary,
      estimated_minutes: draft.estimated_minutes || base.estimated_minutes,
      safety_notes: draft.safety_notes?.length ? draft.safety_notes : base.safety_notes,
      steps: draft.steps?.length ? draft.steps : base.steps,
    });
    if (!editingExisting) setIsNewDraft(true);
    setDraftEpoch((n) => n + 1);
    setView("edit");
  };

  const persist = async (payload, publish = false) => {
    setBusy(true);
    try {
      if (isNewDraft) {
        const created = await sopCreate(payload);
        let record = created?.record;
        if (publish && record?.id) {
          const res = await sopSetStatus({ id: record.id, expectedUpdatedDate: record.updated_date, status: "published" });
          record = res?.record || record;
        }
        await bootstrap();
        if (record?.id) {
          setActiveSop(record);
          setIsNewDraft(false);
          setView("detail");
          setParams({ sop: record.id, edit: "" });
        } else {
          goBrowse();
        }
      } else {
        const res = await sopUpdate({ id: activeSop.id, expectedUpdatedDate: activeSop.updated_date, nextFields: payload });
        let record = res?.record;
        if (publish && record?.status !== "published") {
          const st = await sopSetStatus({ id: record.id, expectedUpdatedDate: record.updated_date, status: "published" });
          record = st?.record || record;
        }
        await bootstrap();
        if (record?.id) {
          setActiveSop(record);
          setView("detail");
          setParams({ sop: record.id, edit: "" });
        } else {
          goBrowse();
        }
      }
      setError("");
    } catch (e) {
      setError(e?.message || "Could not save the SOP.");
    }
    setBusy(false);
  };

  const archiveSop = async (sop) => {
    setBusy(true);
    try {
      await sopSetStatus({ id: sop.id, expectedUpdatedDate: sop.updated_date, status: "archived" });
      await bootstrap();
      goBrowse();
    } catch (e) {
      setError(e?.message || "Could not archive the SOP.");
    }
    setBusy(false);
  };

  const deleteSop = async (sop) => {
    if (!window.confirm(`Delete "${sop.title}" permanently? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await sopDelete({ id: sop.id, expectedUpdatedDate: sop.updated_date });
      await bootstrap();
      goBrowse();
    } catch (e) {
      setError(e?.message || "Could not delete the SOP.");
    }
    setBusy(false);
  };

  const acknowledge = async (sop) => {
    setAcknowledging(true);
    try {
      const res = await sopAcknowledge(sop.id);
      const updated = res?.sop;
      await bootstrap();
      if (updated?.id) setActiveSop(updated);
    } catch (e) {
      setError(e?.message || "Could not save your acknowledgment.");
    }
    setAcknowledging(false);
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <style>{SOP_PRINT_CSS}</style>

      <div className="flex items-center gap-3 mb-5">
        <BookOpen className="h-7 w-7 text-slate-700" />
        <div>
          <h1 className="text-2xl font-bold text-slate-900">SOPs</h1>
          <p className="text-sm text-slate-500">Standard operating procedures — how we do things in this shop.</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-2 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <Button type="button" size="sm" variant="ghost" onClick={bootstrap}>Retry</Button>
        </div>
      )}

      {view === "browse" && (
        <SopBrowser
          sops={sops}
          settings={settings}
          me={me}
          activeCategory={categoryParam}
          onCategoryChange={(key) => setParam("category", key === "all" ? "" : key)}
          onOpen={openDetail}
          onNew={startNew}
          onAiBuild={() => setAiOpen(true)}
          onAdmin={() => setAdminOpen(true)}
        />
      )}

      {view === "detail" && activeSop && (
        <SopDetail
          sop={sops.find((s) => s.id === activeSop.id) || activeSop}
          settings={settings}
          me={me}
          onBack={goBrowse}
          onEdit={startEdit}
          onAcknowledge={acknowledge}
          onPrint={setPrintSop}
          acknowledging={acknowledging}
        />
      )}

      {view === "edit" && activeSop && (
        <SopEditor
          key={`${isNewDraft ? "new" : activeSop.id}-${draftEpoch}`}
          sop={activeSop}
          settings={settings}
          me={me}
          isNew={isNewDraft}
          saving={busy}
          onCancel={isNewDraft ? goBrowse : () => openDetail(activeSop)}
          onSave={(payload) => persist(payload, false)}
          onPublish={(payload) => persist(payload, true)}
          onArchive={archiveSop}
          onDelete={deleteSop}
          onAiBuild={() => setAiOpen(true)}
        />
      )}

      <AiSopBuilderDialog
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        categories={settings?.categories || []}
        settings={settings}
        onApply={applyAiDraft}
      />

      <SopAdminPanel
        open={adminOpen}
        onClose={() => setAdminOpen(false)}
        settings={settings}
        settingsUpdatedDate={settingsDate}
        sops={sops}
        onSaved={(next, nextDate) => { setSettings(next); setSettingsDate(nextDate); }}
      />

      {printSop && (
        <SopPrint sop={printSop} settings={settings} onClose={() => setPrintSop(null)} />
      )}
    </div>
  );
}
