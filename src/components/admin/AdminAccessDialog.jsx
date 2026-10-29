import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, ShieldCheck, ChevronDown, ChevronRight, Copy } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ADMIN_TAB_GROUPS, ADMIN_NESTED_TABS } from "@/components/admin/adminTabNavigation";
import { updateAuthorizedUserAdmin } from "@/components/admin/authorizedUserAdminPersistence";

function buildInitial(user) {
  const perms = user?.admin_permissions && typeof user.admin_permissions === "object" && !Array.isArray(user.admin_permissions)
    ? user.admin_permissions : null;
  const tabs = perms?.tabs && typeof perms.tabs === "object" ? perms.tabs : {};
  const subtabs = perms?.subtabs && typeof perms.subtabs === "object" ? perms.subtabs : {};
  return {
    fullAdmin: user?.is_full_admin === true,
    tabs,
    subtabs,
  };
}

const PRESETS = [
  { label: "All pages", apply: () => ({ tabs: {}, subtabs: {} }) },
  { label: "People only", groups: ["people"] },
  { label: "Integrations only", groups: ["integrations"] },
  { label: "Permitting only", groups: ["permitting"] },
  { label: "Workflow only", groups: ["workflow"] },
];

function presetChecks(groupIds) {
  const tabs = {};
  for (const g of ADMIN_TAB_GROUPS) {
    const allowed = groupIds.includes(g.id);
    for (const t of g.tabs) tabs[t.value] = allowed;
  }
  return { tabs, subtabs: {} };
}

export default function AdminAccessDialog({ user, open, onOpenChange, sessionToken, onSaved, admins = [] }) {
  const [fullAdmin, setFullAdmin] = useState(() => buildInitial(user).fullAdmin);
  const [tabChecks, setTabChecks] = useState(() => buildInitial(user).tabs);
  const [subtabChecks, setSubtabChecks] = useState(() => buildInitial(user).subtabs);
  const [deniedChecks, setDeniedChecks] = useState(() => new Set(user?.admin_permissions?.denied_tabs || []));
  const [expanded, setExpanded] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const allTabValues = useMemo(() => ADMIN_TAB_GROUPS.flatMap((g) => g.tabs.map((t) => t.value)), []);
  const permittedLabels = useMemo(() => {
    if (fullAdmin) return null;
    return ADMIN_TAB_GROUPS.flatMap((g) => g.tabs)
      .filter((t) => tabChecks[t.value] !== false)
      .map((t) => t.label);
  }, [fullAdmin, tabChecks]);

  const toggleTab = (value, checked) => {
    setTabChecks((prev) => ({ ...prev, [value]: checked }));
    if (!checked) setSubtabChecks((prev) => { const next = { ...prev }; delete next[value]; return next; });
  };
  const toggleSubtab = (parent, value, checked) => {
    setSubtabChecks((prev) => {
      const list = new Set(Array.isArray(prev[parent]) ? prev[parent] : (ADMIN_NESTED_TABS[parent] || []).map((t) => t.value));
      if (checked) list.add(value); else list.delete(value);
      const next = { ...prev };
      if (list.size === (ADMIN_NESTED_TABS[parent] || []).length) delete next[parent];
      else next[parent] = [...list];
      return next;
    });
  };
  const applyPreset = (preset) => {
    if (preset.apply) { const next = preset.apply(); setTabChecks(next.tabs); setSubtabChecks(next.subtabs); return; }
    const next = presetChecks(preset.groups || []); setTabChecks(next.tabs); setSubtabChecks(next.subtabs);
    setExpanded({});
  };
  const copyFrom = (adminId) => {
    const source = admins.find((a) => a.id === adminId);
    if (!source) return;
    const init = buildInitial(source);
    setFullAdmin(init.fullAdmin); setTabChecks(init.tabs); setSubtabChecks(init.subtabs); setExpanded({});
  };
  const subtabState = (parent, value) => {
    const list = subtabChecks[parent];
    if (!Array.isArray(list)) return true;
    return list.includes(value);
  };

  const save = async () => {
    setBusy(true); setError("");
    try {
      const denied = [...deniedChecks];
      const perms = {
        ...(fullAdmin ? {} : {
          sections: ADMIN_TAB_GROUPS
            .filter((g) => g.tabs.some((t) => tabChecks[t.value] !== false))
            .map((g) => g.id),
          tabs: Object.fromEntries(allTabValues.map((v) => [v, tabChecks[v] !== false])),
          ...(Object.keys(subtabChecks).length ? { subtabs: subtabChecks } : {}),
        }),
        ...(denied.length ? { denied_tabs: denied } : {}),
      };
      const saved = await updateAuthorizedUserAdmin({
        record: user,
        nextFields: { is_full_admin: fullAdmin, admin_permissions: perms },
        sessionToken,
      });
      onSaved?.(saved);
      onOpenChange(false);
    } catch (err) {
      setError(err?.message || "Admin access could not be saved.");
    }
    setBusy(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent className="clay-card border-none max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-purple-600" /> Admin Access — {user?.full_name || user?.email}
          </DialogTitle>
        </DialogHeader>
        {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}

        <div className="flex items-center justify-between rounded-lg border border-purple-200 bg-purple-50 p-3">
          <div>
            <div className="font-semibold text-sm">Full Administrator</div>
            <div className="text-xs text-gray-600">Sees every Admin page and may approve their own time clock and HR records.</div>
          </div>
          <Switch checked={fullAdmin} onCheckedChange={setFullAdmin} disabled={busy} />
        </div>

        {admins.length > 0 && (
          <div className="flex items-center gap-2">
            <Copy className="w-4 h-4 text-gray-400" />
            <Select onValueChange={copyFrom} disabled={busy}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Copy access from another admin…" /></SelectTrigger>
              <SelectContent>
                {admins.map((a) => <SelectItem key={a.id} value={a.id}>{a.full_name || a.email}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}

        {!fullAdmin && (
          <div className="space-y-2">
            <p className="text-xs text-gray-500">Unchecked pages are hidden from this admin's Admin navigation.</p>
            <div className="flex flex-wrap gap-1">
              {PRESETS.map((p) => (
                <button key={p.label} type="button" disabled={busy} onClick={() => applyPreset(p)}
                  className="rounded-full border border-gray-300 px-2 py-0.5 text-[11px] font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50">
                  {p.label}
                </button>
              ))}
            </div>
            {ADMIN_TAB_GROUPS.map((group) => {
              const allChecked = group.tabs.every((t) => tabChecks[t.value] !== false);
              const someChecked = group.tabs.some((t) => tabChecks[t.value] !== false);
              return (
                <div key={group.id} className="rounded-lg border border-gray-200 p-3 space-y-2">
                  <label className="flex items-center gap-2 font-semibold text-sm cursor-pointer">
                    <Checkbox
                      checked={allChecked ? true : someChecked ? "indeterminate" : false}
                      onCheckedChange={(checked) => {
                        const next = {};
                        for (const t of group.tabs) next[t.value] = checked === true;
                        setTabChecks((prev) => ({ ...prev, ...next }));
                      }}
                    />
                    {group.label}
                  </label>
                  <div className="ml-6 space-y-1.5">
                    {group.tabs.map((tab) => {
                      const nested = ADMIN_NESTED_TABS[tab.value] || [];
                      const isOpen = expanded[tab.value];
                      return (
                        <div key={tab.value}>
                          <div className="flex items-center gap-2">
                            <Checkbox
                              checked={tabChecks[tab.value] !== false}
                              onCheckedChange={(checked) => toggleTab(tab.value, checked === true)}
                            />
                            <span className="text-sm">{tab.label}</span>
                            {nested.length > 0 && tabChecks[tab.value] !== false && (
                              <button type="button" onClick={() => setExpanded((p) => ({ ...p, [tab.value]: !isOpen }))}
                                className="ml-auto text-gray-400 hover:text-gray-700">
                                {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                              </button>
                            )}
                          </div>
                          {isOpen && nested.length > 0 && tabChecks[tab.value] !== false && (
                            <div className="ml-7 mt-1 space-y-1 border-l-2 border-gray-100 pl-3">
                              {nested.map((sub) => (
                                <label key={sub.value} className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                                  <Checkbox
                                    checked={subtabState(tab.value, sub.value)}
                                    onCheckedChange={(checked) => toggleSubtab(tab.value, sub.value, checked === true)}
                                  />
                                  {sub.label}
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <div className="text-xs font-semibold text-gray-700 mb-1">This admin will see:</div>
          {fullAdmin ? (
            <p className="text-xs text-gray-600">Every Admin page — Full Administrator bypasses all page restrictions.</p>
          ) : permittedLabels.length === 0 ? (
            <p className="text-xs text-red-600 font-medium">Nothing — this admin will be locked out of every Admin page.</p>
          ) : (
            <p className="text-xs text-gray-600">{permittedLabels.join(" · ")}</p>
          )}
        </div>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" disabled={busy} onClick={() => onOpenChange(false)}>Cancel</Button>
        <div className="mt-2 border-t border-gray-100 pt-2">
          <p className="text-xs font-medium text-red-700">Explicit blocks — denied tabs override every grant, including full admin:</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {ADMIN_TAB_GROUPS.flatMap((g) => g.tabs).map((t) => (
              <button key={t.value} type="button"
                aria-pressed={deniedChecks.has(t.value)}
                onClick={() => setDeniedChecks((cur) => { const next = new Set(cur); next.has(t.value) ? next.delete(t.value) : next.add(t.value); return next; })}
                className={`rounded-full border px-2 py-0.5 text-[10px] ${deniedChecks.has(t.value) ? "border-red-400 bg-red-50 font-semibold text-red-700" : "border-gray-200 text-gray-400 hover:border-red-200 hover:text-red-500"}`}>
                {deniedChecks.has(t.value) ? "✕ " : ""}{t.label}
              </button>
            ))}
          </div>
        </div>
          <Button className="flex-1" disabled={busy} onClick={save}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Access"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}