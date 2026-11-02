import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Settings, ArrowRight, ShieldCheck, Save, Loader2, Clock } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { staffEntities } from "@/components/staff/staffEntities";
import { loadSingleGlobalSetting } from "@/components/shared/globalSettingsPersistence";
import { getSessionToken, getSessionUser } from "@/components/auth/EmailGate";
import { listAuthorizedUsersAdmin, updateAuthorizedUserAdmin } from "@/components/admin/authorizedUserAdminPersistence";
import EstimatorAuditPanel from "@/components/estimator/EstimatorAuditPanel";
import PricingRegistriesPanel from "@/components/estimator/settings/PricingAdminTabs";
import { useWorkspacePreferences } from "@/components/layout/WorkspacePreferencesProvider";
import { isValidTimeZone, resolveUserTimeZone } from "@/components/estimator/userDateDisplay";

const LINKS = [
  { label: "Master Inventory", desc: "Unified inventory for substrates, vinyl, equipment, labor, lighting, hardware, supplies, metals and concrete", to: "/MasterInventory" },
  { label: "Foundation / Masonry Catalog", desc: "Concrete, brick, poles and fill materials", to: "/FoundationCatalog" },
  { label: "Foundation Settings", desc: "Labor, timing, masonry and pole-paint calculation defaults", to: "/FoundationSettings" },
  { label: "Painting Settings", desc: "Paint mix, coverage, mask, consumables, labor and quantity tiers", to: "/PaintingSettings" },
  { label: "CNC Settings", desc: "Machine rate calculator, labor, setup, material multipliers and cut speeds", to: "/CNCSettings" },
  { label: "Laser Settings", desc: "Parameter and engraving laser rates, calculators, material multipliers and speeds", to: "/LaserSettings" },
  { label: "Metal Settings", desc: "Fabrication, welding and finishing labor defaults", to: "/MetalSettings" },
  { label: "Maintenance Settings", desc: "Service action rates, labor, repaint and Maintenance travel", to: "/MaintenanceSettings" },
  { label: "Installation Settings", desc: "Install labor, size/height/environment times, conditions, travel and letter pricing", to: "/InstallationSettings" },
  { label: "Vinyl Inventory", desc: "Shared vinyl, laminate and transfer-tape catalog", to: "/VinylInventory" },
  { label: "Vinyl Settings", desc: "Printers, cutters, laminators, geometry, ink, blade and machine rates", to: "/VinylSettings" },
  { label: "Quote Defaults", desc: "Company branding, quote content, validity and default customer-facing display settings for new estimates", to: "/QuoteSettings" },
  { label: "Pricing Admin", desc: "Markup tiers, tier matrices, labor levels, machine rates and the quote simulator", to: "/PricingAdmin" },
  { label: "Pricing Registries", desc: "Admin-only CRUD for the shared pricing registries — tiers, templates, variables, modifiers, machines, labor, part groups, import history", to: "/EstimatorSettings?tab=pricing_registries" },
  { label: "Admin Settings", desc: "Users, backups, workflow rules", to: "/AdminSettings" },
  { label: "Audit Log", desc: "Admin-only who-changed-what timeline (estimate revisions, opportunity activity, admin actions)", to: "/EstimatorSettings?tab=audit_log" },
  { label: "Tools", desc: "Quick price, walk-in sale, exports and estimator utilities", to: "/EstimatorTools" },
  { label: "My Info", desc: "Your profile and preferences", to: "/UserSettings" },
];

export default function EstimatorSettings() {
  // #316 — ?tab=<section> deep-link. This hub page has no tab UI; the
  // tab-addressable sections are the Quote Approval card (?tab=quote_approval),
  // the admin Pricing Registries card (?tab=pricing_registries, F-24) and the
  // admin Audit Log card (?tab=audit_log) — all scroll + flash.
  // Nothing writes the param back since there is no tab control to change.
  const approvalRef = useRef(null);
  const auditRef = useRef(null);
  const pricingRef = useRef(null);
  const isAdmin = getSessionUser()?.role === "admin";
  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get("tab") || "";
    const ref = tab === "quote_approval" ? approvalRef : tab === "audit_log" ? auditRef : tab === "pricing_registries" ? pricingRef : null;
    const el = ref?.current;
    if (!el) return;
    const t = window.setTimeout(() => {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      el.classList.add("ring-4", "ring-blue-300");
      window.setTimeout(() => el.classList.remove("ring-4", "ring-blue-300"), 3500);
    }, 350);
    return () => window.clearTimeout(t);
  }, []);
  return (
    <div className="clay-scope min-h-full bg-gradient-to-br from-rose-50 to-orange-50">
      <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-3">
        <div className="bg-white px-4 py-3 flex items-center gap-2">
          <Settings className="w-4 h-4 text-red-500" />
          <h1 className="text-xs font-bold tracking-wide text-gray-600">ESTIMATOR SETTINGS</h1>
        </div>

        <div className="bg-white divide-y divide-gray-100">
          {LINKS.map((l) => (
            <Link key={l.to} to={l.to} className="flex items-center justify-between px-4 py-3 hover:bg-red-50/50">
              <div>
                <div className="text-sm font-semibold text-gray-800">{l.label}</div>
                <div className="text-xs text-gray-500">{l.desc}</div>
              </div>
              <ArrowRight className="w-4 h-4 text-red-400" />
            </Link>
          ))}
        </div>

        <MyDisplayPrefsCard />

        <div ref={approvalRef}>
          <QuoteApprovalCard />
        </div>

        {isAdmin && (
          <div ref={pricingRef}>
            <PricingRegistriesPanel />
          </div>
        )}

        {isAdmin && (
          <div ref={auditRef}>
            <EstimatorAuditPanel />
          </div>
        )}
      </div>
    </div>
  );
}

// #488 — per-user display preferences that live in the workspace-prefs blob
// (UserWorkspacePreferences.preferences). Currently: the viewer's timezone,
// which estimator surfaces honor when rendering dates/timestamps.
function MyDisplayPrefsCard() {
  const { prefs, updatePrefs, saving } = useWorkspacePreferences();
  const savedTz = String(prefs?.locale?.timezone || "");
  const [value, setValue] = useState(savedTz);
  const [error, setError] = useState("");
  const [savedFlash, setSavedFlash] = useState(false);
  useEffect(() => { setValue(savedTz); }, [savedTz]);

  const resolved = resolveUserTimeZone(prefs, "");
  const save = () => {
    const v = String(value || "").trim();
    setError("");
    if (v && !isValidTimeZone(v)) {
      setError(`"${v}" is not a valid IANA timezone — try e.g. America/New_York, America/Chicago, America/Denver, America/Los_Angeles.`);
      return;
    }
    updatePrefs("locale.timezone", v);
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 2500);
  };

  return (
    <div className="bg-white px-4 py-4 border-t-4 border-sky-300">
      <div className="flex items-center gap-2">
        <Clock className="w-4 h-4 text-red-500" />
        <div className="text-xs font-bold tracking-wide text-gray-600">MY DISPLAY PREFERENCES</div>
      </div>
      <p className="mt-1 text-[11px] text-gray-500">
        Per-user preferences that follow your account across devices. The timezone is honored on due-date and audit/activity timestamp displays.
      </p>
      {error && <div className="mt-2 border border-red-200 bg-red-50 px-3 py-2 text-[10px] text-red-700">{error}</div>}
      {savedFlash && <div className="mt-2 border border-emerald-200 bg-emerald-50 px-3 py-2 text-[10px] text-emerald-800">Preference saved{resolved ? ` — dates will display in ${resolved}` : " — dates will display in your browser timezone"}.</div>}
      <div className="mt-3 flex items-end gap-2">
        <label className="text-[10px] font-bold tracking-wide text-gray-500">
          MY TIMEZONE (IANA)
          <input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") save(); }}
            placeholder="blank = browser local"
            list="ccs-tz-options"
            className="mt-1 h-[32px] w-56 rounded border border-gray-300 px-2 text-[11px] font-normal text-gray-800"
          />
          <datalist id="ccs-tz-options">
            <option value="America/New_York" />
            <option value="America/Chicago" />
            <option value="America/Denver" />
            <option value="America/Los_Angeles" />
            <option value="America/Phoenix" />
            <option value="America/Anchorage" />
            <option value="Pacific/Honolulu" />
            <option value="UTC" />
          </datalist>
        </label>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="h-[32px] px-3 rounded border border-lime-400 bg-lime-200 text-[11px] font-bold text-gray-900 hover:bg-lime-300 disabled:opacity-40 inline-flex items-center gap-1.5"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
      <p className="mt-1.5 text-[9px] text-gray-400">Company-wide fallback is set on Quote Defaults → Display timezone. Your pick wins when both are set.</p>
    </div>
  );
}

const QUOTE_APPROVAL_THRESHOLD_KEY = "quote_approval_threshold";
const DEFAULT_QUOTE_APPROVAL_THRESHOLD = 5000;

function thresholdValue(record) {
  const raw = record?.setting_value;
  const parsed = Number(raw?.threshold ?? raw?.value ?? raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_QUOTE_APPROVAL_THRESHOLD;
}

function QuoteApprovalCard() {
  const canManage = getSessionUser()?.role === "admin";
  const [loading, setLoading] = useState(true);
  const [settingRecord, setSettingRecord] = useState(null);
  const [threshold, setThreshold] = useState(String(DEFAULT_QUOTE_APPROVAL_THRESHOLD));
  const [users, setUsers] = useState([]);
  const [savingThreshold, setSavingThreshold] = useState(false);
  const [togglingUserId, setTogglingUserId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const record = await loadSingleGlobalSetting({
        entity: staffEntities.GlobalSettings,
        settingKey: QUOTE_APPROVAL_THRESHOLD_KEY,
        label: "Quote approval threshold",
      });
      setSettingRecord(record);
      setThreshold(String(thresholdValue(record)));
      if (canManage) {
        const rows = await listAuthorizedUsersAdmin({ sessionToken: getSessionToken() });
        setUsers(Array.isArray(rows) ? rows : []);
      } else {
        setUsers([]);
      }
    } catch (err) {
      setError(err?.message || "Quote approval settings could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const saveThreshold = async () => {
    const next = Number(threshold);
    if (!Number.isFinite(next) || next < 0) {
      setError("Enter a valid non-negative dollar threshold.");
      return;
    }
    setSavingThreshold(true);
    setMessage("");
    setError("");
    try {
      const response = await base44.functions.invoke("manageQuoteApprovalSettings", {
        session_token: getSessionToken(),
        action: "save_threshold",
        threshold: next,
        expected_id: settingRecord?.id || "",
        expected_updated_date: settingRecord?.updated_date || "",
      });
      const data = response?.data || response;
      if (data?.error) throw new Error(data.error);
      if (!data?.success) throw new Error("Quote approval threshold could not be verified after saving.");
      setSettingRecord(data.record || null);
      setThreshold(String(data.threshold ?? next));
      setMessage("Quote approval threshold saved.");
    } catch (err) {
      setError(err?.response?.data?.error || err?.data?.error || err?.message || "Quote approval threshold could not be saved.");
    } finally {
      setSavingThreshold(false);
    }
  };

  const toggleApprover = async (user, next) => {
    if (togglingUserId || !user?.id) return;
    setTogglingUserId(user.id);
    setMessage("");
    setError("");
    try {
      const saved = await updateAuthorizedUserAdmin({
        record: user,
        nextFields: { can_approve_quotes: next },
        sessionToken: getSessionToken(),
      });
      const confirmed = saved?.can_approve_quotes === true;
      setUsers((prev) => prev.map((row) => (row.id === user.id ? { ...row, can_approve_quotes: confirmed } : row)));
    } catch (err) {
      setError(err?.message || "Quote approver access could not be changed.");
    } finally {
      setTogglingUserId("");
    }
  };

  return (
    <div className="bg-white px-4 py-4 border-t-4 border-lime-300">
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-red-500" />
        <div className="text-xs font-bold tracking-wide text-gray-600">QUOTE APPROVAL</div>
      </div>
      <p className="mt-1 text-[11px] text-gray-500">
        Quotes above this total need a recorded manager approval before they can be marked sent. Approvers may approve quotes, including their own.
      </p>

      {message && <div className="mt-2 border border-emerald-200 bg-emerald-50 px-3 py-2 text-[10px] text-emerald-800">{message}</div>}
      {error && <div className="mt-2 border border-red-200 bg-red-50 px-3 py-2 text-[10px] text-red-700">{error}</div>}

      {loading ? (
        <div className="mt-3 text-[11px] text-gray-400 flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading quote approval settings…</div>
      ) : (
        <>
          <div className="mt-3 flex items-end gap-2">
            <label className="text-[10px] font-bold tracking-wide text-gray-500">
              APPROVAL THRESHOLD ($)
              <input
                type="number"
                min="0"
                step="0.01"
                value={threshold}
                disabled={!canManage || savingThreshold}
                onChange={(event) => setThreshold(event.target.value)}
                className="mt-1 h-[32px] w-40 rounded border border-gray-300 px-2 text-[11px] font-normal text-gray-800 disabled:opacity-50"
              />
            </label>
            <button
              type="button"
              onClick={saveThreshold}
              disabled={!canManage || savingThreshold}
              title={canManage ? "Save the quote approval threshold" : "Only an administrator can change the quote approval threshold."}
              className="h-[32px] px-3 rounded border border-lime-400 bg-lime-200 text-[11px] font-bold text-gray-900 hover:bg-lime-300 disabled:opacity-40 inline-flex items-center gap-1.5"
            >
              {savingThreshold ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              {savingThreshold ? "Saving…" : "Save"}
            </button>
          </div>

          <div className="mt-4">
            <div className="text-[10px] font-bold tracking-wide text-gray-500 mb-1.5">QUOTE APPROVERS</div>
            {!canManage && (
              <div className="border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] text-amber-800">
                Only an administrator can view and change which users may approve quotes.
              </div>
            )}
            {canManage && users.length === 0 && (
              <div className="text-[10px] text-gray-400">No authorized users found.</div>
            )}
            {canManage && users.length > 0 && (
              <div className="divide-y divide-gray-100 border border-gray-200 rounded">
                {users.map((user) => (
                  <label key={user.id} className="flex items-center justify-between gap-3 px-3 py-2 text-[11px] text-gray-700">
                    <span className="min-w-0">
                      <span className="font-semibold text-gray-800">{user.full_name || user.email}</span>
                      {user.full_name && <span className="ml-2 text-gray-400">{user.email}</span>}
                      {user.role === "admin" && <span className="ml-2 text-[9px] font-bold tracking-wide text-gray-400">ADMIN</span>}
                    </span>
                    <span className="flex items-center gap-2 shrink-0">
                      {togglingUserId === user.id && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />}
                      <input
                        type="checkbox"
                        checked={user.can_approve_quotes === true}
                        disabled={togglingUserId === user.id}
                        onChange={(event) => toggleApprover(user, event.target.checked)}
                        className="w-3.5 h-3.5 accent-red-600"
                      />
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}