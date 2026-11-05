import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";
import { staffEntities } from "@/components/staff/staffEntities";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";
import { useAllWorkOrders } from "@/lib/workOrderCache";
import { downloadCsv } from "@/components/shared/exportCsv";
import { loadGlLookup } from "@/components/shared/loadGlLookup";
import { GL_EXPORT_HEADERS, glExportRows, reportToGlEntries } from "@/components/shared/glExport";
import { paymentsFromArCsv } from "@/components/statements/statementModel";
import {
  DetailDrawer,
  EmptyState,
  FilterField,
  FilterSelect,
  filterInputCls,
} from "@/components/kit";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { CcsDateField } from "@/components/ui/ccs-date-field";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  BarChart3, Download, RefreshCw, Search, Play, Edit, Loader2,
  AlertCircle, FileSpreadsheet,
} from "lucide-react";

// J-01 engine + J-pack spec modules (browser-safe shared allowlist) — the
// registry that DRIVES this catalog UI.
import { defineReport, runReport, formatCellValue } from "./reportEngine";
import { AR_AGING_REPORTS } from "../../../base44/shared/arAgingReports.ts";
import { CUSTOMER_REPORTS } from "../../../base44/shared/customerReports.ts";
import { ESTIMATE_REPORTS } from "../../../base44/shared/estimateReports.ts";
import { FINANCIAL_REPORTS } from "../../../base44/shared/financialReports.ts";
import { PRODUCTION_REPORTS } from "../../../base44/shared/productionReports.ts";
import { SALES_REPORTS } from "../../../base44/shared/salesReports.ts";
import {
  CATALOG_CATEGORIES, CATALOG_CATEGORY_LABELS,
  catalogFromDefinitions, catalogGrouping, catalogSearch,
  validateReportDefinition, definitionPatchFromForm, isDefinitionRow,
  runRequestValidate,
} from "../../../base44/shared/reportCatalogModel.ts";
import { cellDrillLink } from "../../../base44/shared/reportDrilldownModel.ts";

const clean = (v) => String(v ?? "").trim();

// ── Code registry ──────────────────────────────────────────────────────────
// Each spec FILE shares one data domain (its runs delegate to module-scope
// helpers — e.g. arAgingReports.agingContext — so per-spec source scans
// cannot see the needs). The union per module is declared here as wiring;
// reportCatalogModel.specDataNeeds still contributes per-spec direct reads.
const REPORT_SOURCES = [
  { specs: AR_AGING_REPORTS, needs: ["invoices", "customers"] },
  { specs: CUSTOMER_REPORTS, needs: ["customers", "invoices", "payments", "opportunities", "credit_ledger", "work_orders"] },
  { specs: ESTIMATE_REPORTS, needs: ["estimates", "customers", "work_orders", "revisions"] },
  { specs: FINANCIAL_REPORTS, needs: ["invoices", "work_orders", "income_accounts", "agencies", "builder_products", "tax_groups"] },
  { specs: PRODUCTION_REPORTS, needs: ["work_orders", "responsibilities"] },
  { specs: SALES_REPORTS, needs: ["invoices", "customers", "contacts", "income_accounts"] },
];

const NEEDS_BY_KEY = Object.fromEntries(
  REPORT_SOURCES.flatMap((m) => m.specs.map((s) => [s.id, m.needs])),
);
const REGISTRY_SPECS = REPORT_SOURCES.flatMap((m) =>
  m.specs.map((s) => ({ ...s, data_needs: [...new Set([...(s.data_needs || []), ...m.needs])] })),
);

// ── Definition persistence ─────────────────────────────────────────────────
// ReportDefinition rows are FeatureReport records carrying report_key
// (A-19). Read path order: spec'd manageFeatureReports `list_definitions`
// action → admin staffDataRead on FeatureReport (ADMIN_READABLE) → registry
// only (staff sessions see the pure code registry, which is correct: the
// overrides are admin-managed anyway).
async function listReportDefinitions({ sessionToken, isAdmin }) {
  try {
    const res = await base44.functions.invoke("manageFeatureReports", {
      session_token: sessionToken,
      action: "list_definitions",
    });
    const data = res?.data || res;
    if (Array.isArray(data?.records)) return { rows: data.records, via: "manageFeatureReports" };
  } catch {
    /* action not deployed yet — fall through to the gateway read */
  }
  if (!isAdmin) return { rows: [], via: "registry" };
  try {
    const rows = await loadAllEntityRows({
      entity: staffEntities.FeatureReport,
      sort: "-updated_date",
      label: "Report catalog definitions",
    });
    return { rows: (rows || []).filter(isDefinitionRow), via: "staffDataRead" };
  } catch {
    return { rows: [], via: "registry" };
  }
}

// Write path: spec'd `save_definition` / `delete_definition` actions first
// (the FeatureReports function convention); staffEntityWrite on
// FeatureReport as the fallback lane. Neither is wired today — a clear
// error is surfaced rather than a silent no-op.
async function saveReportDefinition({ record, patch, sessionToken }) {
  try {
    const res = await base44.functions.invoke("manageFeatureReports", {
      session_token: sessionToken,
      action: "save_definition",
      id: record?.id || undefined,
      expected_updated_date: record?.updated_date || undefined,
      data: patch,
    });
    const data = res?.data || res;
    if (data?.record?.id || data?.success) return { ok: true, record: data.record || data };
    if (data?.error) throw new Error(data.error);
  } catch (e) {
    if (!/invalid report action|invalid|not found|404/i.test(e?.message || "")) throw e;
  }
  if (record?.id) {
    const saved = await staffEntities.FeatureReport.updateMany(
      { id: record.id, updated_date: record.updated_date },
      { $set: patch },
    );
    if (saved && saved.updated !== 1) throw new Error("Definition changed in another session. Reload before saving.");
    return { ok: true, record: { ...record, ...patch } };
  }
  const created = await staffEntities.FeatureReport.create({
    ...patch,
    type: "feature",
    status: "open",
    is_system: patch.is_system === true,
  });
  return { ok: true, record: created };
}

async function deleteReportDefinition({ record, sessionToken }) {
  try {
    const res = await base44.functions.invoke("manageFeatureReports", {
      session_token: sessionToken,
      action: "delete_definition",
      id: record?.id,
      expected_updated_date: record?.updated_date || undefined,
    });
    const data = res?.data || res;
    if (data?.deleted || data?.success) return { ok: true };
    if (data?.error) throw new Error(data.error);
  } catch (e) {
    if (!/invalid report action|invalid|not found|404/i.test(e?.message || "")) throw e;
  }
  await staffEntities.FeatureReport.deleteMany({ id: record?.id, updated_date: record?.updated_date });
  return { ok: true };
}

// ── Dataset loaders (canonical need key → rows) ────────────────────────────
// Same channels OpsReportView uses: staffEntities via loadAllEntityRows for
// staff-readable entities, invoicingAction for invoice/payment snapshots,
// opportunityWorkspaceAction for the backend-only opportunity list. Reads
// degrade to [] on denial — a report missing a dataset renders empty rather
// than breaking the catalog.
const EMPTY = [];
function makeLoaders({ sessionToken, workOrders }) {
  const rows = (entity, sort, label) =>
    loadAllEntityRows({ entity, sort, label }).catch(() => []);
  return {
    work_orders: async () => workOrders || [],
    invoices: async () => {
      const res = await base44.functions.invoke("invoicingAction", {
        session_token: sessionToken, action: "list_invoices",
      });
      const data = res?.data || res;
      if (!data?.success) throw new Error(data?.error || "Invoice data could not be verified completely.");
      return data.invoices || [];
    },
    payments: async () => {
      const res = await base44.functions.invoke("invoicingAction", {
        session_token: sessionToken, action: "export_ar",
      });
      const data = res?.data || res;
      if (!data?.success) throw new Error(data?.error || "Payment data could not be verified completely.");
      return paymentsFromArCsv(data.payments_csv || "");
    },
    opportunities: async () => {
      const res = await base44.functions.invoke("opportunityWorkspaceAction", {
        session_token: sessionToken, action: "list_opportunities", include_closed: true,
      });
      const data = res?.data || res;
      if (!data?.success) return [];
      return data.opportunities || [];
    },
    estimates: async () => rows(staffEntities.AllInOneEstimate, "-created_date", "Report catalog estimates"),
    revisions: async () => rows(staffEntities.EstimateRevision, "-created_date", "Report catalog estimate revisions"),
    customers: async () => rows(staffEntities.Customer, null, "Report catalog customers"),
    contacts: async () => rows(staffEntities.CustomerContact, null, "Report catalog contacts"),
    credit_ledger: async () => rows(staffEntities.StoreCreditLedger, null, "Report catalog store credit ledger"),
    responsibilities: async () => rows(staffEntities.Responsibility, "name", "Report catalog responsibilities"),
    income_accounts: async () => rows(staffEntities.IncomeAccount, "code", "Report catalog income accounts"),
    agencies: async () => rows(staffEntities.TaxAgency, "name", "Report catalog tax agencies"),
    builder_products: async () => rows(staffEntities.BuilderProduct, "-updated_date", "Report catalog builder products"),
    tax_groups: async () => rows(staffEntities.TaxGroup, "name", "Report catalog tax groups"),
  };
}

// Loaded need-key → row-set → full aliased `data` object the J-specs read
// (every spec spelling resolves — data?.workOrders, customersById, etc.).
function dataFromLoaded(loaded) {
  const d = { ...loaded };
  d.workOrders = d.work_orders || [];
  d.workOrdersById = d.work_orders || [];
  d.customersById = d.customers || [];
  d.contactsById = d.contacts || [];
  d.customer_contacts = d.contacts || [];
  d.invoicesById = d.invoices || [];
  d.store_credit_ledger = d.credit_ledger || [];
  d.ledger_rows = d.credit_ledger || [];
  d.accounts = d.income_accounts || [];
  d.accountsByCode = d.income_accounts || [];
  d.income_accountsByCode = d.income_accounts || [];
  d.builderProductsById = d.builder_products || [];
  d.taxGroups = d.tax_groups || [];
  d.taxGroupsById = d.tax_groups || [];
  d.taxAgenciesById = d.agencies || [];
  d.jurisdictionsById = d.agencies || [];
  d.revisionsByEstimate = d.revisions || [];
  return d;
}

// ── Param form field renderer ──────────────────────────────────────────────
function ParamField({ spec, value, onChange }) {
  const v = value !== undefined ? value : spec.default;
  if (spec.hidden === true) return null;
  if (spec.type === "select" || spec.type === "date_basis") {
    return (
      <FilterField label={spec.label}>
        <FilterSelect value={clean(v)} onChange={(e) => onChange(e.target.value)}>
          {(spec.options || []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </FilterSelect>
      </FilterField>
    );
  }
  if (spec.type === "date_range") {
    const preset = typeof v === "object" && v ? clean(v.preset) || "custom" : clean(v) || "this_month";
    const custom = preset === "custom";
    return (
      <>
        <FilterField label={`${spec.label} Preset`}>
          <FilterSelect
            value={preset}
            onChange={(e) => {
              const p = e.target.value;
              onChange(p === "custom" ? { preset: "custom", from: "", to: "" } : p);
            }}
          >
            {["today", "yesterday", "this_week", "last_week", "this_month", "last_month", "this_quarter", "this_year", "custom"].map((p) => (
              <option key={p} value={p}>{p.replace(/_/g, " ")}</option>
            ))}
          </FilterSelect>
        </FilterField>
        {custom && (
          <>
            <FilterField label="From">
              <CcsDateField className={filterInputCls} value={typeof v === "object" ? v?.from || "" : ""}
                onChange={(e) => onChange({ preset: "custom", ...(typeof v === "object" ? v : {}), from: e.target.value })} />
            </FilterField>
            <FilterField label="To">
              <CcsDateField className={filterInputCls} value={typeof v === "object" ? v?.to || "" : ""}
                onChange={(e) => onChange({ preset: "custom", ...(typeof v === "object" ? v : {}), to: e.target.value })} />
            </FilterField>
          </>
        )}
      </>
    );
  }
  if (spec.type === "multiselect") {
    const current = new Set(Array.isArray(v) ? v : []);
    return (
      <FilterField label={spec.label}>
        <div className="flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900">
          {(spec.options || []).map((o) => (
            <label key={o.value} className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300">
              <Checkbox
                checked={current.has(o.value)}
                onCheckedChange={(checked) => {
                  const next = new Set(current);
                  if (checked) next.add(o.value); else next.delete(o.value);
                  onChange([...next]);
                }}
              />
              {o.label}
            </label>
          ))}
        </div>
      </FilterField>
    );
  }
  if (spec.type === "boolean") {
    return (
      <FilterField label={spec.label}>
        <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
          <Checkbox checked={v === true} onCheckedChange={(c) => onChange(c === true)} />
          {v === true ? "Yes" : "No"}
        </label>
      </FilterField>
    );
  }
  if (spec.type === "number") {
    return (
      <FilterField label={spec.label}>
        <Input type="number" className={filterInputCls} value={v ?? ""}
          onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))} />
      </FilterField>
    );
  }
  return (
    <FilterField label={spec.label}>
      <Input className={filterInputCls} value={v ?? ""} onChange={(e) => onChange(e.target.value)} />
    </FilterField>
  );
}

// ── Result table (OpsReportView ReportTable conventions) ───────────────────
const alignCls = (a) => (a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left");

function CatalogResultTable({ result }) {
  const { columns, rows, summary } = result;
  const totals = summary?.totals && typeof summary.totals === "object" ? summary.totals : null;
  return (
    <div className="max-h-[60vh] overflow-auto ccs-scrollbar-hidden rounded-xl border border-slate-200 dark:border-slate-700">
      <table className="w-full min-w-[40rem] border-collapse text-sm">
        <thead>
          <tr className="sticky top-0 bg-slate-100 dark:bg-slate-800">
            {columns.map((c) => (
              <th key={c.key} className={`whitespace-nowrap px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 ${alignCls(c.align)}`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-slate-100 odd:bg-white even:bg-slate-50/60 dark:border-slate-800 dark:odd:bg-slate-900 dark:even:bg-slate-800/40">
              {columns.map((c) => {
                const cell = formatCellValue(row?.[c.key], c) || "—";
                const link = cellDrillLink(row, c.key);
                return (
                  <td key={c.key} className={`px-3 py-1.5 text-slate-800 dark:text-slate-200 ${alignCls(c.align)}`}>
                    {link?.href ? (
                      <Link className="text-sky-700 hover:underline dark:text-sky-400" to={link.href} title={link.label}>{cell}</Link>
                    ) : cell}
                  </td>
                );
              })}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={columns.length} className="p-0">
              <EmptyState compact title="No data for this report." message="Widen the date range or adjust the parameters to see more rows." />
            </td></tr>
          )}
        </tbody>
        {totals && (
          <tfoot>
            <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold dark:border-slate-700 dark:bg-slate-800/60">
              {columns.map((c) => (
                <td key={c.key} className={`px-3 py-2 text-slate-900 dark:text-slate-100 ${alignCls(c.align)}`}>
                  {formatCellValue(totals[c.key], c) || "—"}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

// ===========================================================================
export default function ReportCatalogPanel({ sessionToken: sessionTokenProp, isAdmin: isAdminProp }) {
  const auth = useAuth();
  const sessionToken = sessionTokenProp ?? auth.sessionToken;
  const isAdmin = isAdminProp ?? (auth.currentUser?.role === "admin");

  const [definitions, setDefinitions] = useState(null); // null = not yet loaded
  const [defVia, setDefVia] = useState("registry");
  const [search, setSearch] = useState("");
  const [showDisabled, setShowDisabled] = useState(false);
  const [runEntry, setRunEntry] = useState(null);       // entry in the run dialog
  const [runParams, setRunParams] = useState({});
  const [runErrors, setRunErrors] = useState([]);
  const [runLoading, setRunLoading] = useState("");
  const [result, setResult] = useState(null);
  const [glNote, setGlNote] = useState("");
  const [glBusy, setGlBusy] = useState(false);
  const [editEntry, setEditEntry] = useState(null);     // entry in the admin drawer
  const [editForm, setEditForm] = useState({});
  const [adminNote, setAdminNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [newDefOpen, setNewDefOpen] = useState(false);

  const { data: workOrders = EMPTY } = useAllWorkOrders();
  const dataCacheRef = useRef({});                    // need → Promise<rows>

  const loadDefinitions = async () => {
    const { rows, via } = await listReportDefinitions({ sessionToken, isAdmin });
    setDefinitions(rows);
    setDefVia(via);
  };
  // Definitions load once on mount — admin overrides merge onto the code
  // registry; staff sessions see the pure registry (correct degradation:
  // the overrides are admin-managed anyway).
  useEffect(() => {
    let live = true;
    listReportDefinitions({ sessionToken, isAdmin }).then(({ rows, via }) => {
      if (!live) return;
      setDefinitions(rows);
      setDefVia(via);
    });
    return () => { live = false; };
     
  }, []);

  const catalog = useMemo(
    () => catalogFromDefinitions(REGISTRY_SPECS, definitions || []),
    [definitions],
  );
  const searched = useMemo(() => catalogSearch(catalog, search), [catalog, search]);
  const groups = useMemo(
    () => catalogGrouping(searched, { includeDisabled: isAdmin && showDisabled }),
    [searched, isAdmin, showDisabled],
  );
  const totalCount = useMemo(() => catalog.filter((e) => e.enabled !== false && !e.orphaned).length, [catalog]);

  const loaders = useMemo(() => makeLoaders({ sessionToken, workOrders }), [sessionToken, workOrders]);

  const ensureNeed = (need) => {
    const cache = dataCacheRef.current;
    if (!cache[need]) {
      const loader = loaders[need];
      cache[need] = loader ? loader() : Promise.resolve([]);
      cache[need].catch(() => { delete cache[need]; }); // retry next run on failure
    }
    return cache[need];
  };

  const openRun = (entry) => {
    setRunEntry(entry);
    setRunParams({});
    setRunErrors([]);
    setResult(null);
    setGlNote("");
  };

  const executeRun = async () => {
    if (!runEntry?.spec) return;
    const v = runRequestValidate(runEntry, runParams);
    if (!v.ok) { setRunErrors(v.errors); return; }
    setRunErrors([]);
    const needs = [...new Set([...(runEntry.data_needs || []), ...(NEEDS_BY_KEY[runEntry.key] || [])])];
    try {
      const loaded = {};
      for (const need of needs) {
        setRunLoading(`Loading ${need.replace(/_/g, " ")}…`);
        loaded[need] = await ensureNeed(need);
      }
      setRunLoading("Running report…");
      const def = defineReport(runEntry.spec);
      const res = runReport(def, { params: v.params, data: dataFromLoaded(loaded), now: new Date() });
      setResult(res);
    } catch (e) {
      setRunErrors([e?.message || "The report could not be run."]);
    } finally {
      setRunLoading("");
    }
  };

  const exportCsv = () => {
    if (!result) return;
    const headers = result.columns.map((c) => c.label);
    const body = result.rows.map((r) => result.columns.map((c) => r?.[c.key]));
    const totals = result.summary?.totals;
    if (totals) body.push(result.columns.map((c) => totals[c.key]));
    downloadCsv(`${runEntry.key}.csv`, headers, body);
  };

  // GL export — same convention OpsReportView uses (totals stay out).
  const exportGl = async () => {
    if (!result || glBusy || !result.rows.length) return;
    setGlBusy(true);
    setGlNote("");
    try {
      const lookup = await loadGlLookup();
      const entries = reportToGlEntries({ columns: result.columns, rows: result.rows, source: runEntry.title });
      const { rows, unmapped } = glExportRows(entries, lookup);
      downloadCsv(`${runEntry.key}-gl.csv`, GL_EXPORT_HEADERS, rows);
      setGlNote(unmapped
        ? `${unmapped} of ${rows.length} GL rows have no account mapping — map categories/items in Manage Accounts.`
        : `${rows.length} GL rows exported — all mapped.`);
    } catch (e) {
      setGlNote(e?.message || "GL export failed.");
    } finally {
      setGlBusy(false);
    }
  };

  // ── admin edit drawer ────────────────────────────────────────────────────
  const openEdit = (entry) => {
    setEditEntry(entry);
    setAdminNote("");
    setEditForm({
      report_key: entry.key,
      title: entry.title,
      category: entry.category,
      description: entry.description || "",
      enabled: entry.enabled !== false,
      sort: entry.sort_order,
      _record: entry.definition_id
        ? { id: entry.definition_id, updated_date: entry.definition_updated_date }
        : null,
    });
  };

  const saveEdit = async () => {
    const v = validateReportDefinition(editForm);
    if (!v.ok) { setAdminNote(v.errors.join(" ")); return; }
    const patch = definitionPatchFromForm(v.definition);
    setSaving(true);
    setAdminNote("");
    try {
      await saveReportDefinition({ record: editForm._record, patch, sessionToken });
      setAdminNote(`Saved definition for "${editForm.report_key}".`);
      setEditEntry(null);
      await loadDefinitions();
    } catch (e) {
      setAdminNote(
        `${e?.message || "Definition could not be saved."} ` +
        `(Definition writes ride manageFeatureReports save_definition — pending backend wiring.)`,
      );
    } finally {
      setSaving(false);
    }
  };

  const removeDefinition = async () => {
    if (!editForm._record?.id) { setEditEntry(null); return; }
    setSaving(true);
    try {
      await deleteReportDefinition({ record: editForm._record, sessionToken });
      setEditEntry(null);
      await loadDefinitions();
    } catch (e) {
      setAdminNote(e?.message || "Definition could not be deleted.");
    } finally {
      setSaving(false);
    }
  };

  const createDefinition = async () => {
    const v = validateReportDefinition(editForm);
    if (!v.ok) { setAdminNote(v.errors.join(" ")); return; }
    const patch = definitionPatchFromForm(v.definition);
    setSaving(true);
    try {
      await saveReportDefinition({ record: null, patch, sessionToken });
      setNewDefOpen(false);
      await loadDefinitions();
    } catch (e) {
      setAdminNote(
        `${e?.message || "Definition could not be created."} ` +
        `(Definition writes ride manageFeatureReports save_definition — pending backend wiring.)`,
      );
    } finally {
      setSaving(false);
    }
  };

  const definitionCount = (definitions || []).length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Search + admin bar */}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="relative min-w-52 flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search reports…"
            className="pl-8"
          />
        </div>
        <Badge variant="outline" className="text-xs">{totalCount} reports</Badge>
        {defVia === "registry" && (
          <span className="text-[11px] text-slate-400">
            code registry{isAdmin ? " — definitions unreadable" : ""}
          </span>
        )}
        {isAdmin && (
          <>
            <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
              <Checkbox checked={showDisabled} onCheckedChange={(c) => setShowDisabled(c === true)} />
              Show disabled{definitionCount ? ` (${definitionCount} overrides)` : ""}
            </label>
            <button
              type="button"
              onClick={() => { setEditForm({ report_key: "", title: "", category: "", description: "", enabled: true, sort: null, _record: null }); setAdminNote(""); setNewDefOpen(true); }}
              className="rounded-lg border border-violet-300 px-3 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-50 dark:border-violet-800 dark:text-violet-300"
            >
              + New definition
            </button>
          </>
        )}
      </div>

      {/* Grouped catalog */}
      {groups.length === 0 ? (
        <EmptyState
          title="No reports found"
          message={search ? `No report matches "${search}".` : "The report registry is empty."}
          actionLabel={search ? "Clear search" : undefined}
          onAction={search ? () => setSearch("") : undefined}
        />
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.category}>
              <div className="mb-2 flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-slate-400" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {group.label}
                </h2>
                <span className="text-[11px] text-slate-400">{group.entries.length}</span>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {group.entries.map((entry) => (
                  <div key={entry.key} className="clay-card flex flex-col gap-2 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100" title={entry.title}>
                          {entry.title}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                          <Badge variant="outline" className="text-[10px]">{CATALOG_CATEGORY_LABELS[entry.category] || entry.category}</Badge>
                          {entry.parameters_schema.length > 0 && (
                            <Badge variant="outline" className="text-[10px]">{entry.parameters_schema.length} param{entry.parameters_schema.length === 1 ? "" : "s"}</Badge>
                          )}
                          {entry.drill_target && (
                            <Badge variant="outline" className="text-[10px]">drills to {entry.drill_target.replace(/_/g, " ")}</Badge>
                          )}
                          {entry.enabled === false && <Badge className="bg-gray-100 text-[10px] text-gray-600">disabled</Badge>}
                          {entry.orphaned && <Badge className="bg-amber-100 text-[10px] text-amber-700">no spec</Badge>}
                          {entry.overridden && !entry.orphaned && <Badge className="bg-violet-100 text-[10px] text-violet-700">override</Badge>}
                        </div>
                      </div>
                    </div>
                    {entry.description && (
                      <p className="line-clamp-2 text-xs leading-snug text-slate-500 dark:text-slate-400">{entry.description}</p>
                    )}
                    <div className="mt-auto flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => openRun(entry)}
                        disabled={!entry.has_spec}
                        className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
                        title={entry.has_spec ? "Run this report" : "No engine spec backs this entry"}
                      >
                        <Play className="h-3.5 w-3.5" /> Run
                      </button>
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => openEdit(entry)}
                          className="flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                          <Edit className="h-3.5 w-3.5" /> Edit
                        </button>
                      )}
                      <span className="ml-auto font-mono text-[10px] text-slate-400">{entry.key}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* ── Run dialog: params form → live preview + export ─────────────── */}
      <Dialog open={!!runEntry} onOpenChange={(v) => !v && setRunEntry(null)}>
        <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <FileSpreadsheet className="h-4 w-4 text-violet-600" />
              {runEntry?.title}
              {runEntry && (
                <Badge variant="outline" className="text-[10px]">{CATALOG_CATEGORY_LABELS[runEntry.category] || runEntry.category}</Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          {runEntry?.description && (
            <p className="text-xs text-slate-500 dark:text-slate-400">{runEntry.description}</p>
          )}

          {runEntry?.parameters_schema?.length > 0 && (
            <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-700 dark:bg-slate-800/40">
              {runEntry.parameters_schema.map((p) => (
                <ParamField
                  key={p.key}
                  spec={p}
                  value={runParams[p.key]}
                  onChange={(v) => setRunParams((cur) => ({ ...cur, [p.key]: v }))}
                />
              ))}
            </div>
          )}

          {runErrors.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              <div className="flex items-center gap-1.5 font-semibold"><AlertCircle className="h-3.5 w-3.5" /> Check the run parameters</div>
              <ul className="mt-1 list-inside list-disc">{runErrors.map((e, i) => <li key={i}>{e}</li>)}</ul>
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={executeRun}
              disabled={!!runLoading}
              className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
            >
              {runLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              Run Report
            </button>
            {result && (
              <>
                <button
                  type="button"
                  onClick={exportCsv}
                  disabled={!result.rows.length}
                  className="flex items-center gap-1.5 rounded-lg border border-violet-300 px-3 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-50 dark:border-violet-800 dark:text-violet-300"
                >
                  <Download className="h-3.5 w-3.5" /> Export CSV
                </button>
                {(runEntry.export_formats || []).includes("gl") && (
                  <button
                    type="button"
                    onClick={exportGl}
                    disabled={glBusy || !result.rows.length}
                    title="Journal-style CSV (date, memo, entity_ref, gl_account, debit, credit) with GL account codes"
                    className="flex items-center gap-1.5 rounded-lg border border-violet-300 px-3 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-50 dark:border-violet-800 dark:text-violet-300"
                  >
                    {glBusy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                    GL export
                  </button>
                )}
              </>
            )}
            {runLoading && <span className="text-xs text-slate-500">{runLoading}</span>}
            {result && (
              <span className="ml-auto text-[11px] text-slate-400">
                {result.meta?.rowCount ?? result.rows.length} rows · {new Date(result.meta?.generatedAt).toLocaleTimeString()}
              </span>
            )}
          </div>

          {glNote && <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{glNote}</p>}
          {result?.meta?.warnings?.length > 0 && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400">{result.meta.warnings.join(" · ")}</p>
          )}

          {result ? (
            <CatalogResultTable result={result} />
          ) : runLoading ? (
            <TableSkeleton columns={5} rows={6} />
          ) : null}
        </DialogContent>
      </Dialog>

      {/* ── Admin edit drawer ────────────────────────────────────────────── */}
      <DetailDrawer
        open={!!editEntry}
        onOpenChange={(v) => !v && setEditEntry(null)}
        title={editEntry ? `Definition — ${editEntry.key}` : "Definition"}
        description="Admin overrides merge onto the code registry. Title/category/description replace the spec's display text; disabling hides the report from the run catalog."
        footer={
          <>
            {editForm._record?.id && (
              <button type="button" onClick={removeDefinition} disabled={saving}
                className="mr-auto rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-800">
                Remove override
              </button>
            )}
            <button type="button" onClick={() => setEditEntry(null)} disabled={saving}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300">
              Cancel
            </button>
            <button type="button" onClick={saveEdit} disabled={saving}
              className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50">
              {saving ? "Saving…" : editForm._record?.id ? "Save override" : "Create override"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <Label className="text-xs">Report key</Label>
            <Input value={editForm.report_key || ""} disabled className="mt-1 font-mono text-xs opacity-70" />
          </div>
          <div>
            <Label className="text-xs">Title</Label>
            <Input value={editForm.title || ""} onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Category</Label>
            <FilterSelect className="mt-1 w-full" value={editForm.category || ""}
              onChange={(e) => setEditForm((f) => ({ ...f, category: e.target.value }))}>
              {CATALOG_CATEGORIES.map((c) => <option key={c} value={c}>{CATALOG_CATEGORY_LABELS[c] || c}</option>)}
            </FilterSelect>
          </div>
          <div>
            <Label className="text-xs">Description</Label>
            <Textarea value={editForm.description || ""} onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))} className="mt-1 min-h-20" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Sort order</Label>
              <Input type="number" value={editForm.sort ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, sort: e.target.value === "" ? null : Number(e.target.value) }))} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Enabled</Label>
              <label className="mt-1 flex items-center gap-2 rounded-lg border border-slate-200 px-2 py-2 text-xs dark:border-slate-700">
                <Checkbox checked={editForm.enabled !== false} onCheckedChange={(c) => setEditForm((f) => ({ ...f, enabled: c === true }))} />
                Visible in catalog
              </label>
            </div>
          </div>
          {adminNote && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
              {adminNote}
            </p>
          )}
        </div>
      </DetailDrawer>

      {/* ── New definition dialog (admin) ────────────────────────────────── */}
      <Dialog open={newDefOpen} onOpenChange={setNewDefOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">New Report Definition</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              A definition keyed to a registry <code>report_key</code> overrides that report's display fields. An unmatched key stays an orphan (never runnable).
            </p>
            <div>
              <Label className="text-xs">Report key *</Label>
              <Input value={editForm.report_key || ""} placeholder="sales_by_customer"
                onChange={(e) => setEditForm((f) => ({ ...f, report_key: e.target.value }))} className="mt-1 font-mono text-xs" />
            </div>
            <div>
              <Label className="text-xs">Title *</Label>
              <Input value={editForm.title || ""} onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Category</Label>
              <FilterSelect className="mt-1 w-full" value={editForm.category || ""}
                onChange={(e) => setEditForm((f) => ({ ...f, category: e.target.value }))}>
                <option value="">— inherit —</option>
                {CATALOG_CATEGORIES.map((c) => <option key={c} value={c}>{CATALOG_CATEGORY_LABELS[c] || c}</option>)}
              </FilterSelect>
            </div>
            <div>
              <Label className="text-xs">Description</Label>
              <Textarea value={editForm.description || ""} onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))} className="mt-1 min-h-16" />
            </div>
            {adminNote && <p className="text-[11px] text-amber-700 dark:text-amber-300">{adminNote}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setNewDefOpen(false)} disabled={saving}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300">
                Cancel
              </button>
              <button type="button" onClick={createDefinition} disabled={saving || !clean(editForm.report_key) || !clean(editForm.title)}
                className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50">
                {saving ? "Creating…" : "Create definition"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
